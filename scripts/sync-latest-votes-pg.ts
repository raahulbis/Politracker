import { queryAll, queryOne, transaction, convertPlaceholders, closeDatabase } from '../lib/db/database';
import { getMPVotingRecord as getOpenParliamentVotes } from '../lib/api/openparliament';
import { saveNewVotesToDB } from '../lib/db/save-votes';
import type { Vote } from '@/types';

/**
 * Sync latest votes from OpenParliament API for all MPs (PostgreSQL version)
 * Only fetches votes newer than what's already in the database
 */
export async function syncLatestVotes() {
  console.log('Syncing Latest Votes from OpenParliament\n========================================\n');

  // Get all MPs
  const mpsSql = convertPlaceholders('SELECT id, name FROM mps ORDER BY name');
  const mps = await queryAll<{ id: number; name: string }>(mpsSql, []);

  console.log(`Found ${mps.length} MPs to sync\n`);

  let totalNewVotes = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let processed = 0;

  const batchSize = 10; // Smaller batches to avoid rate limiting
  
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
        const latestDateSql = convertPlaceholders(`
          SELECT MAX(date) as latest_date 
          FROM votes 
          WHERE mp_id = $1
        `);
        const latest = await queryOne<{ latest_date: string | null }>(latestDateSql, [mp.id]);
        const latestDate = latest?.latest_date || null;

        console.log(`Fetching votes for ${mp.name}${latestDate ? ` (since ${latestDate})` : ''}...`);

        // Fetch votes from OpenParliament (increased limit to 500)
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
    
    // Step 2: Save votes for this batch
    if (batchVotes.length > 0) {
      console.log(`\nSaving votes for batch ${batchNumber}...`);
      
      for (const { mp, votes } of batchVotes) {
        try {
          await saveNewVotesToDB(mp.id, votes);
          totalNewVotes += votes.length;
          console.log(`  ✓ ${mp.name}: ${votes.length} votes saved`);
        } catch (error) {
          totalErrors++;
          console.error(`  ✗ Error saving votes for ${mp.name}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      console.log(`✓ Batch ${batchNumber} complete`);
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

  await closeDatabase();
}

// Only run if called directly (not imported)
if (require.main === module) {
  syncLatestVotes().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

