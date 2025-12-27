import { getDatabase, closeDatabase } from '../lib/db/database';
import { getMPVotingRecord as getOpenParliamentVotes } from '../lib/api/openparliament';
import type { Vote } from '@/types';

/**
 * Sync latest votes from OpenParliament API for all MPs
 * Only fetches votes newer than what's already in the database
 */
export async function syncLatestVotes() {
  console.log('Syncing Latest Votes from OpenParliament\n========================================\n');
  const db = getDatabase();

  // Get all MPs
  const mps = db.prepare('SELECT id, name FROM mps').all() as Array<{
    id: number;
    name: string;
  }>;

  console.log(`Found ${mps.length} MPs to sync\n`);

  // Get the most recent vote date for each MP
  const getLatestVoteDate = db.prepare(`
    SELECT MAX(date) as latest_date 
    FROM votes 
    WHERE mp_id = ?
  `);

  const insertVote = db.prepare(`
    INSERT OR IGNORE INTO votes (
      vote_id, mp_id, date, bill_number, bill_title,
      motion_title, vote_type, result, party_position,
      parliament_number, session_number
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let totalNewVotes = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let processed = 0;

  const batchSize = 50;
  
  // Process MPs in batches
  for (let i = 0; i < mps.length; i += batchSize) {
    const batch = mps.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(mps.length / batchSize);
    
    console.log(`\n[Processing batch ${batchNumber}/${totalBatches} - MPs ${i + 1} to ${Math.min(i + batchSize, mps.length)}]\n`);
    
    // Step 1: Fetch votes for all MPs in this batch (with delays between API calls)
    const batchVotes: Array<{ mp: typeof mps[0]; votes: Vote[] }> = [];
    
    for (const mp of batch) {
      processed++;
      try {
        // Get latest vote date for this MP
        const latest = getLatestVoteDate.get(mp.id) as { latest_date: string | null } | undefined;
        const latestDate = latest?.latest_date || null;

        console.log(`Fetching votes for ${mp.name}${latestDate ? ` (since ${latestDate})` : ''}...`);

        // Fetch votes from OpenParliament
        const votingRecord = await getOpenParliamentVotes(mp.name, 500);

        // Filter to only new votes (votes after latest date)
        let newVotes: Vote[] = votingRecord.votes;
        if (latestDate) {
          newVotes = votingRecord.votes.filter(vote => {
            return new Date(vote.date) > new Date(latestDate);
          });
        }

        if (newVotes.length === 0) {
          console.log(`  No new votes for ${mp.name}`);
        } else {
          console.log(`  Found ${newVotes.length} new votes (out of ${votingRecord.votes.length} total)`);
          batchVotes.push({ mp, votes: newVotes });
        }

        // Delay between API calls to avoid rate limiting (2 seconds)
        if (mp !== batch[batch.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        totalErrors++;
        console.error(`  ✗ Error syncing votes for ${mp.name}:`, error instanceof Error ? error.message : 'Unknown error');
        // Continue with next MP even on error
      }
    }
    
    // Step 2: Insert all votes from this batch into database in a single transaction
    if (batchVotes.length > 0) {
      console.log(`\nInserting votes for batch ${batchNumber}...`);
      
      const insertBatchVotes = db.transaction((votesData: typeof batchVotes) => {
        let inserted = 0;
        let skipped = 0;
        
        for (const { mp, votes } of votesData) {
          for (const vote of votes) {
            try {
              // Extract parliament and session from vote ID if available
              const sessionMatch = vote.id.match(/\/(\d+)-(\d+)\//);
              const parliamentNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : null;
              const sessionNumber = sessionMatch ? parseInt(sessionMatch[2], 10) : null;

              insertVote.run(
                vote.id,
                mp.id,
                vote.date,
                vote.bill_number || null,
                vote.bill_title || null,
                vote.motion_title,
                vote.vote_type,
                vote.result,
                vote.party_position || null,
                parliamentNumber,
                sessionNumber
              );
              inserted++;
            } catch (error) {
              skipped++;
              // Ignore duplicate errors (INSERT OR IGNORE)
            }
          }
        }
        
        return { inserted, skipped };
      });

      // Execute transaction - all votes from batch inserted atomically
      const result = insertBatchVotes(batchVotes);
      totalNewVotes += result.inserted;
      totalSkipped += result.skipped;

      console.log(`✓ Batch ${batchNumber} complete: Inserted ${result.inserted} votes${result.skipped > 0 ? ` (${result.skipped} skipped)` : ''}`);
      
      for (const { mp, votes } of batchVotes) {
        console.log(`  - ${mp.name}: ${votes.length} votes`);
      }
    } else {
      console.log(`✓ Batch ${batchNumber} complete: No new votes to insert`);
    }
    
    // Delay between batches (additional 2 seconds after database insert)
    if (i + batchSize < mps.length) {
      console.log(`\nWaiting 2 seconds before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total MPs processed: ${processed}/${mps.length}`);
  console.log(`New votes inserted: ${totalNewVotes}`);
  console.log(`Skipped (duplicates): ${totalSkipped}`);
  console.log(`Errors encountered: ${totalErrors}`);

  closeDatabase();
}

// Only run if called directly (not imported)
if (require.main === module) {
  syncLatestVotes();
}

