import { transaction, convertPlaceholders } from './database';
import type { Vote } from '@/types';

/**
 * Find bill_id from bills_motions table by bill_number, session, or legisinfo_id
 * This ensures votes are properly linked to the master bills table
 */
async function findBillId(
  client: any,
  billNumber: string | undefined,
  session: string | undefined,
  legisinfoId?: number | null
): Promise<number | null> {
  if (!billNumber && !legisinfoId) {
    return null;
  }

  // First try by legisinfo_id (most reliable unique identifier)
  if (legisinfoId) {
    const sql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE legisinfo_id = $1 
      LIMIT 1
    `);
    const result = await client.query(sql, [legisinfoId]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  // Try by bill_number + session (most specific match)
  if (billNumber && session) {
    const sql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE bill_number = $1 AND session = $2 
      LIMIT 1
    `);
    const result = await client.query(sql, [billNumber, session]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  // Fallback: try by bill_number only (less specific, but better than nothing)
  if (billNumber) {
    const sql = convertPlaceholders(`
      SELECT id FROM bills_motions 
      WHERE bill_number = $1 
      ORDER BY introduced_date DESC
      LIMIT 1
    `);
    const result = await client.query(sql, [billNumber]);
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
  }

  return null;
}

/**
 * Save new votes to database (called after fetching from OpenParliament)
 * Works with PostgreSQL - uses transaction client and handles conflicts
 * Links votes to bills using bill_id foreign key
 */
export async function saveNewVotesToDB(mpId: number, votes: Vote[]): Promise<void> {
  if (votes.length === 0) {
    console.log(`No votes to save for MP ${mpId}`);
    return;
  }

  await transaction(async (client) => {
    const insertVoteSql = convertPlaceholders(`
      INSERT INTO votes (
        vote_id, mp_id, bill_id, date, bill_number, bill_title,
        motion_title, vote_type, result, party_position, sponsor_party,
        parliament_number, session_number, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
      ON CONFLICT (vote_id, mp_id) DO UPDATE SET
        bill_id = EXCLUDED.bill_id,
        updated_at = CURRENT_TIMESTAMP
    `);

    let savedCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (const vote of votes) {
      try {
        // Skip votes without a valid date (required by database)
        if (!vote.date || typeof vote.date !== 'string' || vote.date.trim().length === 0) {
          skippedCount++;
          console.warn(`Skipping vote ${vote.id} for MP ${mpId}: missing or invalid date`);
          continue;
        }

        // Extract parliament and session from vote ID
        // Vote IDs from OpenParliament are like: /votes/45-1/59/
        const sessionMatch = vote.id.match(/\/votes\/(\d+)-(\d+)\//);
        const parliamentNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : null;
        const sessionNumber = sessionMatch ? parseInt(sessionMatch[2], 10) : null;
        const sessionString = sessionMatch ? `${parliamentNumber}-${sessionNumber}` : null;

        // Find bill_id if we have a bill_number
        // Try to find by bill_number + session first, then fallback to bill_number only
        const billId = await findBillId(client, vote.bill_number, sessionString ?? undefined);

        // Use SAVEPOINT to allow individual vote failures without aborting the entire transaction
        const savepointName = `sp_vote_${savedCount + errorCount + skippedCount}`;
        await client.query(`SAVEPOINT ${savepointName}`);

        try {
          const result = await client.query(insertVoteSql, [
            vote.id,
            mpId,
            billId,
            vote.date,
            vote.bill_number || null,
            vote.bill_title || null,
            vote.motion_title || 'Motion',
            vote.vote_type,
            vote.result,
            vote.party_position || null,
            vote.sponsor_party || null,
            parliamentNumber,
            sessionNumber
          ]);

          // Check if row was inserted (rowCount > 0) or skipped due to conflict (rowCount = 0)
          if (result.rowCount && result.rowCount > 0) {
            savedCount++;
          }
          await client.query(`RELEASE SAVEPOINT ${savepointName}`);
        } catch (voteError: any) {
          // Rollback to savepoint to continue with next vote
          await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          errorCount++;
          console.error(`Error saving vote ${vote.id} for MP ${mpId}:`, voteError.message);
          if (voteError.code) {
            console.error(`Error code: ${voteError.code}`);
          }
        }
      } catch (error) {
        errorCount++;
        // Log error but continue with other votes
        console.error(`Error processing vote ${vote.id} for MP ${mpId}:`, error);
        if (error instanceof Error) {
          console.error(`Error details: ${error.message}`);
        }
      }
    }

    console.log(`Saved ${savedCount} new votes for MP ${mpId} (${errorCount} errors, ${skippedCount} skipped due to missing data, ${votes.length - savedCount - errorCount - skippedCount} duplicates/skipped)`);
  });
}
