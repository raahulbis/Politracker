import { queryAll, queryOne, convertPlaceholders, closeDatabase } from '../lib/db/database';
import { getMPVotingRecord as getOpenParliamentVotes } from '../lib/api/openparliament';
import { saveNewVotesToDB } from '../lib/db/save-votes';
import type { Vote } from '@/types';

/**
 * One-time bulk import script for MPs with less than 30 votes
 * Fetches ALL available votes for these MPs to backfill their records
 */
export async function syncVotesBulkImport() {
  console.log('Starting Bulk Vote Import for MPs with < 30 votes\n========================================\n');

  // Get MPs with less than 30 votes
  const mpsSql = convertPlaceholders(`
    SELECT m.id, m.name, COALESCE(vote_counts.vote_count, 0) as vote_count
    FROM mps m
    LEFT JOIN (
      SELECT mp_id, COUNT(*) as vote_count
      FROM votes
      GROUP BY mp_id
    ) vote_counts ON m.id = vote_counts.mp_id
    WHERE COALESCE(vote_counts.vote_count, 0) < 30
    ORDER BY m.name
  `);
  const mps = await queryAll<{ id: number; name: string; vote_count: number }>(mpsSql, []);

  console.log(`Found ${mps.length} MPs with less than 30 votes to backfill\n`);
  
  if (mps.length === 0) {
    console.log('No MPs need backfilling (all have 30+ votes).');
    await closeDatabase();
    return;
  }
  
  // Show summary of vote counts
  const voteCountBreakdown = mps.reduce((acc, mp) => {
    const count = mp.vote_count;
    if (count < 10) acc['0-9'] = (acc['0-9'] || 0) + 1;
    else if (count < 20) acc['10-19'] = (acc['10-19'] || 0) + 1;
    else acc['20-29'] = (acc['20-29'] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Vote count breakdown:');
  Object.entries(voteCountBreakdown).forEach(([range, count]) => {
    console.log(`  ${range} votes: ${count} MPs`);
  });
  console.log('');

  let totalNewVotes = 0;
  let totalErrors = 0;
  let processed = 0;

  const batchSize = 10; // Smaller batches to avoid rate limiting
  
  // Process MPs in batches
  for (let i = 0; i < mps.length; i += batchSize) {
    const batch = mps.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(mps.length / batchSize);
    
    console.log(`\n[Processing batch ${batchNumber}/${totalBatches} - MPs ${i + 1} to ${Math.min(i + batchSize, mps.length)}]\n`);
    
    // Step 1: Fetch votes for all MPs in this batch
    const batchVotes: Array<{ mp: typeof mps[0]; votes: Vote[] }> = [];
    
    for (const mp of batch) {
      processed++;
      try {
        console.log(`Fetching ALL votes for ${mp.name} (currently has ${mp.vote_count} votes)...`);

        // Fetch ALL available votes from OpenParliament (up to 500 limit)
        // Since these MPs have < 30 votes, we want to backfill all available votes
        const votingRecord = await getOpenParliamentVotes(mp.name, 500);

        // For bulk import, we fetch ALL votes and let the database handle duplicates
        // The saveNewVotesToDB function uses ON CONFLICT to skip duplicates
        const votesToSave = votingRecord.votes;

        if (votesToSave.length === 0) {
          console.log(`  No votes found for ${mp.name}`);
        } else {
          console.log(`  Found ${votesToSave.length} votes to import`);
          batchVotes.push({ mp, votes: votesToSave });
        }

        // Delay between API calls to avoid rate limiting
        if (mp !== batch[batch.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        totalErrors++;
        console.error(`  ✗ Error syncing votes for ${mp.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    // Step 2: Save votes for this batch (votes will be linked to bills automatically)
    if (batchVotes.length > 0) {
      console.log(`\nSaving votes for batch ${batchNumber}...`);
      
      for (const { mp, votes } of batchVotes) {
        try {
          await saveNewVotesToDB(mp.id, votes);
          totalNewVotes += votes.length;
          console.log(`  ✓ ${mp.name}: ${votes.length} votes saved (duplicates will be skipped)`);
        } catch (error) {
          totalErrors++;
          console.error(`  ✗ Error saving votes for ${mp.name}:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
      
      console.log(`✓ Batch ${batchNumber} complete`);
    } else {
      console.log(`✓ Batch ${batchNumber} complete: No votes to insert`);
    }
    
    // Delay between batches
    if (i + batchSize < mps.length) {
      console.log(`\nWaiting 2 seconds before next batch...\n`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total MPs processed: ${processed}/${mps.length}`);
  console.log(`Votes imported: ${totalNewVotes}`);
  console.log(`Errors encountered: ${totalErrors}`);

  await closeDatabase();
}

// Only run if called directly (not imported)
if (require.main === module) {
  syncVotesBulkImport().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

