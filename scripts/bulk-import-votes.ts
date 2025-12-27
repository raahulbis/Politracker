import { getDatabase, closeDatabase } from '../lib/db/database';
import { getMPVotingRecord as getOpenParliamentVotes } from '../lib/api/openparliament';
import type { Vote } from '@/types';

/**
 * Bulk import votes for all MPs from OpenParliament API
 * This uses the improved party position detection logic
 */
async function bulkImportVotes() {
  console.log('Bulk Import of Votes from OpenParliament\n==========================================\n');
  const db = getDatabase();

  // Check if we should purge existing votes first
  const purgeFirst = process.argv.includes('--purge') || process.argv.includes('-p');
  
  if (purgeFirst) {
    console.log('⚠️  Purging all existing votes from database...');
    const deleteCount = db.prepare('DELETE FROM votes').run().changes;
    console.log(`✓ Deleted ${deleteCount} existing votes\n`);
    
    // Also clear vote caches
    db.prepare('DELETE FROM votes_cache').run();
    db.prepare('DELETE FROM vote_details_cache').run();
    db.prepare('DELETE FROM party_loyalty_cache').run();
    console.log('✓ Cleared vote caches\n');
  } else {
    const existingVotes = db.prepare('SELECT COUNT(*) as count FROM votes').get() as { count: number };
    if (existingVotes.count > 0) {
      console.log(`⚠️  Found ${existingVotes.count} existing votes in database.`);
      console.log(`   Using INSERT OR IGNORE - existing votes will be skipped.`);
      console.log(`   To purge and re-import from scratch, use: npm run db:bulk-import-votes -- --purge\n`);
    }
  }

  // Get all MPs
  const mps = db.prepare('SELECT id, name, party_name FROM mps').all() as Array<{
    id: number;
    name: string;
    party_name: string | null;
  }>;

  if (mps.length === 0) {
    console.error('No MPs found in the database. Please run db:fetch-mps first.');
    closeDatabase();
    return;
  }

  console.log(`Found ${mps.length} MPs to process\n`);

  // Use INSERT OR REPLACE if purging, otherwise INSERT OR IGNORE
  const insertVote = purgeFirst 
    ? db.prepare(`
        INSERT OR REPLACE INTO votes (
          vote_id, mp_id, date, bill_number, bill_title,
          motion_title, vote_type, result, party_position,
          parliament_number, session_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
    : db.prepare(`
        INSERT OR IGNORE INTO votes (
          vote_id, mp_id, date, bill_number, bill_title,
          motion_title, vote_type, result, party_position,
          parliament_number, session_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

  let totalVotesImported = 0;
  let totalVotesSkipped = 0;
  let processedCount = 0;
  let errorsCount = 0;

  // Process MPs in batches to avoid overwhelming the API
  // Increased delays to avoid rate limits
  const batchSize = 3; // Further reduced batch size
  const delayBetweenBatches = 10000; // 10 seconds between batches
  const delayBetweenMPs = 2000; // 2 seconds between individual MPs

  for (let i = 0; i < mps.length; i += batchSize) {
    const batch = mps.slice(i, i + batchSize);
    
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(mps.length / batchSize)} (MPs ${i + 1}-${Math.min(i + batchSize, mps.length)})...\n`);

    for (const mp of batch) {
      processedCount++;
      try {
        console.log(`[${processedCount}/${mps.length}] Fetching votes for ${mp.name} (${mp.party_name || 'Unknown Party'})...`);

        // Fetch votes from OpenParliament (this uses the improved party position logic)
        const votingRecord = await getOpenParliamentVotes(mp.name, 1000); // Fetch up to 1000 votes per MP

        if (votingRecord.votes.length === 0) {
          console.log(`  No votes found for ${mp.name}`);
          continue;
        }

        console.log(`  Found ${votingRecord.votes.length} votes`);

        // Insert votes into database
        let mpVotesImported = 0;
        let mpVotesSkipped = 0;

        for (const vote of votingRecord.votes) {
          try {
            // Extract parliament and session from vote ID if available
            // Vote IDs from OpenParliament are like: /votes/45-1/59/
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
              vote.party_position || null, // This includes the improved party position logic
              parliamentNumber,
              sessionNumber
            );
            mpVotesImported++;
            totalVotesImported++;
          } catch (error: any) {
            // For INSERT OR REPLACE, we shouldn't get duplicate errors
            // For INSERT OR IGNORE, ignore duplicate errors
            if (!purgeFirst && !error.message?.includes('UNIQUE constraint')) {
              console.error(`    Error inserting vote ${vote.id}:`, error.message);
            }
            mpVotesSkipped++;
            totalVotesSkipped++;
          }
        }

        console.log(`  ✓ Imported ${mpVotesImported} votes for ${mp.name}${mpVotesSkipped > 0 ? ` (${mpVotesSkipped} skipped)` : ''}`);

        // Small delay between MPs to avoid rate limiting
        if (processedCount < mps.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenMPs));
        }

      } catch (error: any) {
        errorsCount++;
        console.error(`  ✗ Error processing ${mp.name}:`, error.message);
        if (error.response) {
          console.error(`    Status: ${error.response.status}`);
        }
      }
    }

    // Delay between batches
    if (i + batchSize < mps.length) {
      console.log(`\nWaiting ${delayBetweenBatches / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('=== Bulk Import Complete ===');
  console.log(`${'='.repeat(60)}`);
  console.log(`Total MPs processed: ${processedCount}`);
  console.log(`Total votes imported: ${totalVotesImported}`);
  console.log(`Total votes skipped (duplicates/errors): ${totalVotesSkipped}`);
  console.log(`MPs with errors: ${errorsCount}`);
  console.log(`\n✅ All votes have been imported with improved party position detection logic.`);
  if (purgeFirst) {
    console.log(`\n✓ All votes were re-imported from scratch with improved party position logic.`);
  }
  console.log(`\nNote: Party position is determined using the enhanced matching logic that:`);
  console.log(`  - Handles various party name formats (Green Party, Green Party of Canada, etc.)`);
  console.log(`  - Properly categorizes votes as 'For', 'Against', or 'Free Vote'`);
  console.log(`  - Accounts for small parties where party position may reflect the MP's vote`);

  closeDatabase();
}

// Run the bulk import
bulkImportVotes().catch((error) => {
  console.error('Fatal error during bulk import:', error);
  closeDatabase();
  process.exit(1);
});
