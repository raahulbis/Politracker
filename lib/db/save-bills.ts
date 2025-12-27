import { transaction, convertPlaceholders } from './database';
import type { Motion } from '@/types';

/**
 * Save bills/motions to database (called after fetching from OpenParliament)
 * Focus: Map MPs to their bill interactions (sponsorships)
 * Bills are only inserted if they don't already exist - no updates to existing bills
 * Works with PostgreSQL - uses transaction client for all queries
 */
export async function saveBillsToDB(mpId: number, motions: Motion[]): Promise<void> {
  if (motions.length === 0) {
    console.log(`No bills/motions to save for MP ${mpId}`);
    return;
  }

  await transaction(async (client) => {
    // Check if bill exists by bill_number
    const checkBillByNumberSql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE bill_number = $1 
      LIMIT 1
    `);

    // Check if bill exists by title + type + introduced_date (for bills without numbers)
    const checkBillByTitleSql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE bill_number IS NULL 
        AND title = $1 
        AND type = $2 
        AND introduced_date = $3
      LIMIT 1
    `);

    // Insert new bill only if it doesn't exist
    const insertBillSql = convertPlaceholders(`
      INSERT INTO bills_motions (
        bill_number, motion_number, title, type, status,
        introduced_date, parliament_number, session_number,
        long_title, short_title, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
      RETURNING id
    `);

    // Map MP to bill - this is the main focus
    const insertSponsorshipSql = convertPlaceholders(`
      INSERT INTO mp_bill_sponsorships (
        mp_id, bill_motion_id, sponsor_type
      ) VALUES ($1, $2, $3)
      ON CONFLICT (mp_id, bill_motion_id, sponsor_type) DO NOTHING
    `);

    let billsInserted = 0;
    let billsSkipped = 0;
    let sponsorshipsCreated = 0;
    let sponsorshipsSkipped = 0;

    for (const motion of motions) {
      try {
        // Extract parliament and session from motion ID (format: /bills/45-1/123/)
        let parliamentNumber: number | null = null;
        let sessionNumber: number | null = null;
        
        if (motion.id) {
          const sessionMatch = motion.id.match(/\/(\d+)-(\d+)\//);
          if (sessionMatch) {
            parliamentNumber = parseInt(sessionMatch[1], 10);
            sessionNumber = parseInt(sessionMatch[2], 10);
          }
        }

        let billId: number | null = null;

        // Check if bill already exists
        if (motion.number) {
          // Check by bill number
          const checkResult = await client.query(checkBillByNumberSql, [motion.number]);
          if (checkResult.rows.length > 0) {
            // Bill exists - just get the ID, don't update it
            billId = checkResult.rows[0].id;
            billsSkipped++;
          } else {
            // Bill doesn't exist - insert it
            const insertResult = await client.query(insertBillSql, [
              motion.number,
              motion.type === 'Motion' ? motion.number : null,
              motion.title,
              motion.type,
              motion.status || null,
              motion.introduced_date || null,
              parliamentNumber,
              sessionNumber,
              motion.title, // long_title
              motion.title, // short_title
            ]);
            billId = insertResult.rows[0]?.id || null;
            if (billId) billsInserted++;
          }
        } else {
          // No bill number - check by title + type + date
          if (motion.introduced_date) {
            const checkResult = await client.query(checkBillByTitleSql, [
              motion.title,
              motion.type,
              motion.introduced_date
            ]);
            if (checkResult.rows.length > 0) {
              // Bill exists - just get the ID
              billId = checkResult.rows[0].id;
              billsSkipped++;
            } else {
              // Bill doesn't exist - insert it
              const insertResult = await client.query(insertBillSql, [
                null, // bill_number
                motion.type === 'Motion' ? motion.number : null,
                motion.title,
                motion.type,
                motion.status || null,
                motion.introduced_date || null,
                parliamentNumber,
                sessionNumber,
                motion.title, // long_title
                motion.title, // short_title
              ]);
              billId = insertResult.rows[0]?.id || null;
              if (billId) billsInserted++;
            }
          } else {
            // No bill number and no date - insert as new (might create duplicates)
            const insertResult = await client.query(insertBillSql, [
              null, // bill_number
              motion.type === 'Motion' ? motion.number : null,
              motion.title,
              motion.type,
              motion.status || null,
              null, // introduced_date
              parliamentNumber,
              sessionNumber,
              motion.title, // long_title
              motion.title, // short_title
            ]);
            billId = insertResult.rows[0]?.id || null;
            if (billId) billsInserted++;
          }
        }
        
        // Map MP to bill - this is the main purpose
        if (billId) {
          const sponsorshipResult = await client.query(insertSponsorshipSql, [
            mpId,
            billId,
            motion.sponsor_type || 'Sponsor'
          ]);
          // Check if sponsorship was inserted (rowCount > 0) or skipped due to conflict
          if (sponsorshipResult.rowCount && sponsorshipResult.rowCount > 0) {
            sponsorshipsCreated++;
          } else {
            sponsorshipsSkipped++;
          }
        } else {
          console.warn(`Could not get bill ID for motion ${motion.number || motion.id}`);
        }
      } catch (error) {
        console.error(`Error processing bill ${motion.number || motion.id} for MP ${mpId}:`, error);
        if (error instanceof Error) {
          console.error(`Error details: ${error.message}`);
        }
        // Continue with next motion instead of failing entire transaction
      }
    }

    console.log(`Bill mapping for MP ${mpId}: ${billsInserted} bills inserted, ${billsSkipped} bills already existed, ${sponsorshipsCreated} sponsorships created, ${sponsorshipsSkipped} sponsorships already existed`);
  });
}
