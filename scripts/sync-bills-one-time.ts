import axios from 'axios';
import * as https from 'https';
import { transaction, convertPlaceholders, queryExec, queryOne, closeDatabase } from '../lib/db/database';
import { getCurrentSessionStartDate, getCurrentSession } from '../lib/db/sessions';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

interface OpenParliamentBill {
  session: string;
  legisinfo_id: number;
  introduced: string;
  name: {
    en: string;
    fr: string;
  };
  number: string;
  url: string;
  law?: boolean;
  private_member_bill?: boolean;
  sponsor_politician?: string;
  sponsor_politician_membership?: string | any;
  sponsor_politician_membership_url?: string;
  sponsor_politician_url?: string; // New field from OpenParliament
  status_code?: string;
}

interface OpenParliamentResponse {
  objects: OpenParliamentBill[];
  pagination: {
    offset: number;
    limit: number;
    next_url?: string;
    previous_url?: string | null;
  };
}

/**
 * Ensure all required columns exist in bills_motions table
 */
async function ensureColumnsExist(): Promise<void> {
  console.log('Checking if required columns exist in bills_motions table...');
  
  const columnsToAdd = [
    { name: 'law', type: 'BOOLEAN' },
    { name: 'legisinfo_id', type: 'INTEGER' },
    { name: 'private_member_bill', type: 'BOOLEAN' },
    { name: 'session', type: 'TEXT' },
    { name: 'sponsor_politician', type: 'TEXT' },
    { name: 'sponsor_politician_membership', type: 'TEXT' },
    { name: 'sponsor_party', type: 'TEXT' },
    { name: 'status_code', type: 'TEXT' },
  ];

  for (const column of columnsToAdd) {
    try {
      await queryExec(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bills_motions' AND column_name = '${column.name}'
          ) THEN
            ALTER TABLE bills_motions ADD COLUMN ${column.name} ${column.type};
            RAISE NOTICE 'Added column ${column.name}';
          END IF;
        END $$;
      `);
      console.log(`✓ Column '${column.name}' exists or was added`);
    } catch (error: any) {
      console.warn(`Error checking/adding column '${column.name}':`, error.message);
    }
  }

  // Create indexes
  try {
    await queryExec(`
      CREATE INDEX IF NOT EXISTS idx_bills_motions_legisinfo_id 
      ON bills_motions(legisinfo_id);
    `);
    console.log('✓ Index on legisinfo_id created or already exists');
  } catch (error: any) {
    console.warn('Error creating index on legisinfo_id:', error.message);
  }

  try {
    await queryExec(`
      CREATE INDEX IF NOT EXISTS idx_bills_motions_session 
      ON bills_motions(session);
    `);
    console.log('✓ Index on session created or already exists');
  } catch (error: any) {
    console.warn('Error creating index on session:', error.message);
  }
}

/**
 * Fetch all bills from OpenParliament API with pagination
 * Fetches bills for the current session
 */
async function fetchAllBills(): Promise<OpenParliamentBill[]> {
  const allBills: OpenParliamentBill[] = [];
  let offset = 0;
  const limit = 100; // Maximum allowed by API
  let hasMore = true;

  // Get current session to filter bills
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    console.error('No current session found. Cannot fetch bills.');
    return [];
  }

  const sessionString = `${currentSession.session_number}`;
  console.log(`Fetching bills for current session ${currentSession.session_number} from OpenParliament...`);

  while (hasMore) {
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;
    let response: any = null;

    while (!success && retryCount < maxRetries) {
      try {
        const url = `${OPENPARLIAMENT_API_BASE}/bills/`;
        const params: any = {
          limit,
          offset,
        };
        
        // Filter by session if we have a current session
        if (currentSession) {
          // OpenParliament uses session format like "45-1" in the session field
          // We'll filter by introduced date from session start date
          const sessionStartDate = await getCurrentSessionStartDate();
          if (sessionStartDate) {
            params.introduced__gte = sessionStartDate;
          }
        }

        console.log(`Fetching bills (offset: ${offset}, limit: ${limit})...`);
        
        response = await axios.get<OpenParliamentResponse>(url, {
          httpsAgent,
          params,
          timeout: 30000,
        });

        success = true;
      } catch (error: any) {
        if (error.response?.status === 429) {
          // Rate limited - exponential backoff
          retryCount++;
          const backoffDelay = Math.min(2000 * Math.pow(2, retryCount), 60000);
          console.warn(`Rate limited (429). Waiting ${backoffDelay/1000}s before retry ${retryCount}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        } else {
          console.error(`Error fetching bills (offset: ${offset}):`, error.message);
          throw error;
        }
      }
    }

    if (!response) {
      throw new Error(`Failed to fetch bills after ${maxRetries} retries`);
    }

    const bills = response.data.objects || [];
    console.log(`  Retrieved ${bills.length} bills`);

    if (bills.length === 0) {
      hasMore = false;
    } else {
      allBills.push(...bills);
      offset += bills.length;

      // Check if there's more data
      if (!response.data.pagination?.next_url) {
        hasMore = false;
      }

      // Delay between requests to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log(`\nTotal bills fetched: ${allBills.length}`);
  return allBills;
}

/**
 * Check if bill exists in database by legisinfo_id or bill_number + session
 */
async function billExists(
  client: any,
  legisinfoId: number | null,
  billNumber: string | null,
  session: string | null
): Promise<number | null> {
  if (legisinfoId) {
    const checkByLegisinfoSql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE legisinfo_id = $1 
      LIMIT 1
    `);
    const result = await client.query(checkByLegisinfoSql, [legisinfoId]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  // Fallback: check by bill_number + session
  if (billNumber && session) {
    const checkByNumberSessionSql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE bill_number = $1 AND session = $2 
      LIMIT 1
    `);
    const result = await client.query(checkByNumberSessionSql, [billNumber, session]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  return null;
}

/**
 * Fetch full bill details if needed
 * Always fetches full details to ensure we have sponsor_politician_url
 */
async function fetchBillDetails(bill: OpenParliamentBill): Promise<OpenParliamentBill> {
  // Always fetch full details to get sponsor_politician_url
  // The list endpoint might not include all fields
  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await axios.get<OpenParliamentBill>(`${OPENPARLIAMENT_API_BASE}${bill.url}`, {
      httpsAgent,
      timeout: 15000,
    });

    return {
      ...bill,
      ...response.data,
      url: bill.url,
    };
  } catch (error: any) {
    if (error.response?.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.warn(`Could not fetch full details for bill ${bill.number || bill.legisinfo_id}: ${error.message}`);
    return bill;
  }
}

/**
 * Convert politician URL slug to name
 * Format: /politicians/firstname-lastname/ or firstname-lastname
 */
function slugToName(slug: string): string {
  // Remove /politicians/ prefix and trailing slash
  const cleanSlug = slug.replace(/^\/politicians\//, '').replace(/\/$/, '');
  
  // Split by hyphens - format is firstname-lastname
  const parts = cleanSlug.split('-');
  if (parts.length < 2) {
    // Fallback: just capitalize each word
    return parts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // First part(s) is first name, last part is last name
  // Handle cases like "fares-al-soud" where last name has multiple parts
  const firstName = parts.slice(0, -1).join('-');
  const lastName = parts[parts.length - 1];
  
  // Return as "FirstName LastName"
  const capitalizedFirstName = firstName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const capitalizedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);
  
  return `${capitalizedFirstName} ${capitalizedLastName}`;
}

/**
 * Get MP's party by parsing sponsor_politician_url
 */
async function getSponsorPartyFromUrl(
  client: any,
  sponsorPoliticianUrl: string | undefined
): Promise<string | null> {
  if (!sponsorPoliticianUrl) {
    return null;
  }

  try {
    // Parse name from URL
    const mpName = slugToName(sponsorPoliticianUrl);
    
    // Try exact name match first
    let sql = convertPlaceholders('SELECT party_name FROM mps WHERE name = $1 LIMIT 1');
    let result = await client.query(sql, [mpName]);
    
    if (result.rows.length > 0 && result.rows[0].party_name) {
      return result.rows[0].party_name;
    }
    
    // Try case-insensitive match
    sql = convertPlaceholders('SELECT party_name FROM mps WHERE LOWER(name) = LOWER($1) LIMIT 1');
    result = await client.query(sql, [mpName]);
    
    if (result.rows.length > 0 && result.rows[0].party_name) {
      return result.rows[0].party_name;
    }
    
    // Try matching by first and last name
    const nameParts = mpName.split(' ');
    if (nameParts.length >= 2) {
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      
      sql = convertPlaceholders(`
        SELECT party_name FROM mps 
        WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)
        LIMIT 1
      `);
      result = await client.query(sql, [firstName, lastName]);
      
      if (result.rows.length > 0 && result.rows[0].party_name) {
        return result.rows[0].party_name;
      }
    }
    
    // Try LIKE match for partial matches
    sql = convertPlaceholders('SELECT party_name FROM mps WHERE LOWER(name) LIKE LOWER($1) LIMIT 1');
    result = await client.query(sql, [`%${mpName}%`]);
    
    if (result.rows.length > 0 && result.rows[0].party_name) {
      return result.rows[0].party_name;
    }
  } catch (error: any) {
    console.warn(`Error looking up MP party for URL ${sponsorPoliticianUrl}:`, error.message);
  }
  
  return null;
}

/**
 * Normalize sponsor_politician_membership to a string
 */
function normalizeSponsorMembership(membership: string | any | undefined): string | null {
  if (!membership) return null;
  
  if (typeof membership === 'string') {
    return membership;
  }
  
  if (typeof membership === 'object') {
    if (membership.url) {
      return membership.url;
    }
    if (membership.membership_url) {
      return membership.membership_url;
    }
    return JSON.stringify(membership);
  }
  
  return String(membership);
}

/**
 * Insert or update bill in database
 */
async function saveBill(bill: OpenParliamentBill): Promise<{ inserted: boolean; updated: boolean }> {
  const fullBill = await fetchBillDetails(bill);

  return await transaction(async (client) => {
    // Extract parliament and session numbers from session string
    let parliamentNumber: number | null = null;
    let sessionNumber: number | null = null;
    
    if (fullBill.session) {
      const sessionMatch = fullBill.session.match(/^(\d+)-(\d+)$/);
      if (sessionMatch) {
        parliamentNumber = parseInt(sessionMatch[1], 10);
        sessionNumber = parseInt(sessionMatch[2], 10);
      }
    }

    const sponsorMembership = normalizeSponsorMembership(
      fullBill.sponsor_politician_membership || fullBill.sponsor_politician_membership_url
    );

    // Get sponsor party from sponsor_politician_url
    const sponsorPoliticianUrl = fullBill.sponsor_politician_url || 
                                  (typeof fullBill.sponsor_politician_membership === 'string' && 
                                   fullBill.sponsor_politician_membership.includes('/politicians/') 
                                   ? fullBill.sponsor_politician_membership 
                                   : null);
    
    const sponsorParty = await getSponsorPartyFromUrl(client, sponsorPoliticianUrl);

    // Check if bill exists
    const existingId = await billExists(client, fullBill.legisinfo_id, fullBill.number, fullBill.session);

    if (existingId) {
      // Update existing bill - make sure to update sponsor_party if it's missing
      // First check if sponsor_party is already set
      const checkSponsorPartySql = convertPlaceholders(`
        SELECT sponsor_party FROM bills_motions WHERE id = $1
      `);
      const existingBill = await client.query(checkSponsorPartySql, [existingId]);
      const existingSponsorParty = existingBill.rows[0]?.sponsor_party;
      
      // Only update sponsor_party if it's null/empty and we have a new value
      const shouldUpdateSponsorParty = (!existingSponsorParty && sponsorParty);
      
      const updateSql = convertPlaceholders(`
        UPDATE bills_motions SET
          bill_number = $1,
          title = $2,
          type = $3,
          status = $4,
          introduced_date = $5,
          parliament_number = $6,
          session_number = $7,
          long_title = $8,
          short_title = $9,
          law = $10,
          legisinfo_id = $11,
          private_member_bill = $12,
          session = $13,
          sponsor_politician = $14,
          sponsor_politician_membership = $15,
          status_code = $16${shouldUpdateSponsorParty ? ', sponsor_party = $17' : ''},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${shouldUpdateSponsorParty ? '$18' : '$17'}
      `);

      const updateParams: any[] = [
        fullBill.number || null,
        fullBill.name?.en || fullBill.name || 'Untitled',
        'Bill',
        fullBill.status_code || null,
        fullBill.introduced || null,
        parliamentNumber,
        sessionNumber,
        fullBill.name?.en || fullBill.name || 'Untitled',
        fullBill.name?.en || fullBill.name || 'Untitled',
        fullBill.law ?? null,
        fullBill.legisinfo_id || null,
        fullBill.private_member_bill ?? null,
        fullBill.session || null,
        fullBill.sponsor_politician || null,
        sponsorMembership,
        fullBill.status_code || null,
      ];
      
      if (shouldUpdateSponsorParty) {
        updateParams.push(sponsorParty);
      }
      updateParams.push(existingId);

      await client.query(updateSql, updateParams);

      return { inserted: false, updated: true };
    } else {
      // Insert new bill
      const insertSql = convertPlaceholders(`
        INSERT INTO bills_motions (
          bill_number, title, type, status, introduced_date,
          parliament_number, session_number, long_title, short_title,
          law, legisinfo_id, private_member_bill, session,
          sponsor_politician, sponsor_politician_membership, sponsor_party, status_code,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
        RETURNING id
      `);

      const result = await client.query(insertSql, [
        fullBill.number || null,
        fullBill.name?.en || fullBill.name || 'Untitled',
        'Bill',
        fullBill.status_code || null,
        fullBill.introduced || null,
        parliamentNumber,
        sessionNumber,
        fullBill.name?.en || fullBill.name || 'Untitled',
        fullBill.name?.en || fullBill.name || 'Untitled',
        fullBill.law ?? null,
        fullBill.legisinfo_id || null,
        fullBill.private_member_bill ?? null,
        fullBill.session || null,
        fullBill.sponsor_politician || null,
        sponsorMembership,
        sponsorParty,
        fullBill.status_code || null,
      ]);

      return { inserted: true, updated: false };
    }
  });
}

/**
 * Main function to fetch and save all bills
 */
async function main() {
  try {
    console.log('Starting one-time bill import from OpenParliament...\n');

    // Ensure all required columns exist
    await ensureColumnsExist();
    console.log('');

    // Fetch all bills
    const bills = await fetchAllBills();

    if (bills.length === 0) {
      console.log('No bills found to process.');
      return;
    }

    console.log(`\nProcessing ${bills.length} bills...\n`);

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // Process bills in batches
    const batchSize = 50;
    for (let i = 0; i < bills.length; i += batchSize) {
      const batch = bills.slice(i, i + batchSize);
      
      for (const bill of batch) {
        try {
          const result = await saveBill(bill);
          if (result.inserted) {
            inserted++;
          } else if (result.updated) {
            updated++;
          }
          
          if ((inserted + updated) % 10 === 0) {
            console.log(`  Processed ${i + batch.indexOf(bill) + 1}/${bills.length} bills... (${inserted} inserted, ${updated} updated)`);
          }
        } catch (error: any) {
          errors++;
          console.error(`Error processing bill ${bill.number || bill.legisinfo_id}:`, error.message);
        }
      }

      // Small delay between batches
      if (i + batchSize < bills.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n✅ One-time bill import complete!');
    console.log(`   - Inserted: ${inserted}`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Errors: ${errors}`);
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run the script
main();

