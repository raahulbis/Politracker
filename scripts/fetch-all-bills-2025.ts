import axios from 'axios';
import * as https from 'https';
import { transaction, convertPlaceholders, queryExec, closeDatabase } from '../lib/db/database';
import { getCurrentSessionStartDate } from '../lib/db/sessions';

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
  sponsor_politician_membership?: string | any; // Can be URL string or object
  sponsor_politician_membership_url?: string; // Alternative field name
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

  // Create index on legisinfo_id for faster lookups
  try {
    await queryExec(`
      CREATE INDEX IF NOT EXISTS idx_bills_motions_legisinfo_id 
      ON bills_motions(legisinfo_id);
    `);
    console.log('✓ Index on legisinfo_id created or already exists');
  } catch (error: any) {
    console.warn('Error creating index on legisinfo_id:', error.message);
  }

  // Create index on session for faster lookups
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
 */
async function fetchAllBills(introducedDate?: string): Promise<OpenParliamentBill[]> {
  // If no introducedDate provided, get current session start date
  if (!introducedDate) {
    const currentSessionStartDate = await getCurrentSessionStartDate();
    introducedDate = currentSessionStartDate || '2025-01-01'; // Fallback
  }
  const allBills: OpenParliamentBill[] = [];
  let offset = 0;
  const limit = 100; // Maximum allowed by API
  let hasMore = true;

  console.log(`Fetching all bills introduced on or after ${introducedDate}...`);

  while (hasMore) {
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;
    let response: any = null;

    while (!success && retryCount < maxRetries) {
      try {
        const url = `${OPENPARLIAMENT_API_BASE}/bills/`;
        const params = {
          introduced__gte: introducedDate,
          limit,
          offset,
        };

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
 * Fetch full bill details if needed (for fields that might not be in list response)
 * Only fetches if we're missing critical fields to minimize API calls
 */
async function fetchBillDetails(bill: OpenParliamentBill): Promise<OpenParliamentBill> {
  // If we already have all the key fields, return as-is
  // Note: Some fields might be null/undefined, which is okay - we just need to know they were checked
  const hasAllFields = bill.legisinfo_id !== undefined && 
                       bill.law !== undefined && 
                       bill.private_member_bill !== undefined && 
                       bill.status_code !== undefined;
  
  if (hasAllFields) {
    return bill;
  }

  // Fetch full bill details for missing fields
  try {
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const response = await axios.get<OpenParliamentBill>(`${OPENPARLIAMENT_API_BASE}${bill.url}`, {
      httpsAgent,
      timeout: 15000,
    });

    // Merge the full details with the list data (full details take precedence)
    return {
      ...bill,
      ...response.data,
      // Preserve URL from original
      url: bill.url,
    };
  } catch (error: any) {
    if (error.response?.status === 429) {
      // Rate limited - wait longer before returning
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.warn(`Could not fetch full details for bill ${bill.number || bill.legisinfo_id}: ${error.message}`);
    return bill; // Return original if fetch fails
  }
}

/**
 * Normalize sponsor_politician_membership to a string
 */
function normalizeSponsorMembership(membership: string | any | undefined): string | null {
  if (!membership) return null;
  
  if (typeof membership === 'string') {
    return membership;
  }
  
  // If it's an object, try to get the URL or stringify it
  if (typeof membership === 'object') {
    if (membership.url) {
      return membership.url;
    }
    if (membership.membership_url) {
      return membership.membership_url;
    }
    // Fallback: stringify the object
    return JSON.stringify(membership);
  }
  
  return String(membership);
}

/**
 * Insert or update bill in database
 */
async function saveBill(bill: OpenParliamentBill): Promise<{ inserted: boolean; updated: boolean }> {
  // Fetch full bill details to ensure we have all fields
  const fullBill = await fetchBillDetails(bill);

  return await transaction(async (client) => {
    // Extract parliament and session numbers from session string (e.g., "45-1" -> parliament: 45, session: 1)
    let parliamentNumber: number | null = null;
    let sessionNumber: number | null = null;
    
    if (fullBill.session) {
      const sessionMatch = fullBill.session.match(/^(\d+)-(\d+)$/);
      if (sessionMatch) {
        parliamentNumber = parseInt(sessionMatch[1], 10);
        sessionNumber = parseInt(sessionMatch[2], 10);
      }
    }

    // Normalize sponsor_politician_membership
    const sponsorMembership = normalizeSponsorMembership(
      fullBill.sponsor_politician_membership || fullBill.sponsor_politician_membership_url
    );

    // Check if bill exists
    const existingId = await billExists(client, fullBill.legisinfo_id, fullBill.number, fullBill.session);

    if (existingId) {
      // Update existing bill
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
          status_code = $16,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $17
      `);

      await client.query(updateSql, [
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
        existingId,
      ]);

      return { inserted: false, updated: true };
    } else {
      // Insert new bill
      const insertSql = convertPlaceholders(`
        INSERT INTO bills_motions (
          bill_number, title, type, status, introduced_date,
          parliament_number, session_number, long_title, short_title,
          law, legisinfo_id, private_member_bill, session,
          sponsor_politician, sponsor_politician_membership, status_code,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
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
    console.log('Starting bill sync from OpenParliament...\n');

    // Ensure all required columns exist
    await ensureColumnsExist();
    console.log('');

    // Fetch all bills from 2025 onwards
    // Get current session start date
    const currentSessionStartDate = await getCurrentSessionStartDate();
    if (!currentSessionStartDate) {
      console.error('No current session found. Cannot fetch bills.');
      return;
    }
    const bills = await fetchAllBills(currentSessionStartDate);

    if (bills.length === 0) {
      console.log('No bills found to process.');
      return;
    }

    console.log(`\nProcessing ${bills.length} bills...\n`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process bills in batches to avoid overwhelming the database
    const batchSize = 50;
    for (let i = 0; i < bills.length; i += batchSize) {
      const batch = bills.slice(i, i + batchSize);
      
      for (const bill of batch) {
        try {
          const result = await saveBill(bill);
          if (result.inserted) {
            inserted++;
            if (inserted % 10 === 0) {
              console.log(`  Processed ${i + batch.indexOf(bill) + 1}/${bills.length} bills... (${inserted} inserted, ${updated} updated)`);
            }
          } else if (result.updated) {
            updated++;
          } else {
            skipped++;
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

    console.log('\n✅ Bill sync complete!');
    console.log(`   - Inserted: ${inserted}`);
    console.log(`   - Updated: ${updated}`);
    console.log(`   - Skipped: ${skipped}`);
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

