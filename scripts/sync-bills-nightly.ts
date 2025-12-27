import axios from 'axios';
import * as https from 'https';
import { transaction, convertPlaceholders, queryExec, queryOne, closeDatabase } from '../lib/db/database';
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
  sponsor_politician_membership?: string | any;
  sponsor_politician_membership_url?: string;
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
 * Get the latest bill introduced_date from database
 */
async function getLatestBillDate(): Promise<string | null> {
  const sql = convertPlaceholders(`
    SELECT MAX(introduced_date) as latest_date 
    FROM bills_motions 
    WHERE introduced_date IS NOT NULL
  `);
  const result = await queryOne<{ latest_date: string | null }>(sql, []);
  return result?.latest_date || null;
}

/**
 * Fetch new bills from OpenParliament API (bills introduced after latest date in DB)
 */
async function fetchNewBills(introducedDate?: string): Promise<OpenParliamentBill[]> {
  // If no date provided, get latest date from database
  if (!introducedDate) {
    introducedDate = await getLatestBillDate();
  }
  
  // If still no date, get current session start date
  if (!introducedDate) {
    const currentSessionStartDate = await getCurrentSessionStartDate();
    introducedDate = currentSessionStartDate || '2025-01-01'; // Fallback
  }

  const allBills: OpenParliamentBill[] = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  console.log(`Fetching bills introduced on or after ${introducedDate}...`);

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

      if (!response.data.pagination?.next_url) {
        hasMore = false;
      }

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log(`\nTotal new bills fetched: ${allBills.length}`);
  return allBills;
}

/**
 * Check if bill exists in database
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
 */
async function fetchBillDetails(bill: OpenParliamentBill): Promise<OpenParliamentBill> {
  const hasAllFields = bill.legisinfo_id !== undefined && 
                       bill.law !== undefined && 
                       bill.private_member_bill !== undefined && 
                       bill.status_code !== undefined;
  
  if (hasAllFields) {
    return bill;
  }

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
 * Main function to sync new bills
 */
async function main() {
  try {
    console.log('Starting nightly bill sync from OpenParliament...\n');

    // Fetch new bills (only bills introduced after latest date in DB)
    const bills = await fetchNewBills();

    if (bills.length === 0) {
      console.log('No new bills found.');
      return;
    }

    console.log(`\nProcessing ${bills.length} new/updated bills...\n`);

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

      if (i + batchSize < bills.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n✅ Nightly bill sync complete!');
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

