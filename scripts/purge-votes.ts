import { queryRun, queryExec, queryOne, closeDatabase } from '../lib/db/database';

/**
 * One-time purge of all votes from the database
 * This will delete all votes and clear vote-related caches
 */
async function purgeVotes() {
  console.log('⚠️  ONE-TIME PURGE OF VOTES\n========================================\n');

  try {
    // First, get the count of votes before deletion
    const voteCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM votes');
    const count = voteCount ? parseInt(voteCount.count, 10) : 0;
    
    console.log(`Found ${count} votes in the database\n`);

    if (count === 0) {
      console.log('No votes to delete. Database is already empty.');
      await closeDatabase();
      return;
    }

    // Delete all votes
    console.log('Deleting all votes...');
    const votesDeleted = await queryRun('DELETE FROM votes');
    console.log(`✓ Deleted ${votesDeleted.changes} votes\n`);

    // Clear vote-related caches
    console.log('Clearing vote-related caches...');
    
    try {
      await queryExec('TRUNCATE TABLE votes_cache');
      console.log('  ✓ Cleared votes_cache');
    } catch (error: any) {
      if (error.code !== '42P01') { // 42P01 = table doesn't exist
        throw error;
      }
      console.log('  ⚠️  votes_cache table does not exist (skipping)');
    }

    try {
      await queryExec('TRUNCATE TABLE vote_details_cache');
      console.log('  ✓ Cleared vote_details_cache');
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error;
      }
      console.log('  ⚠️  vote_details_cache table does not exist (skipping)');
    }

    try {
      await queryExec('TRUNCATE TABLE party_loyalty_cache');
      console.log('  ✓ Cleared party_loyalty_cache');
    } catch (error: any) {
      if (error.code !== '42P01') {
        throw error;
      }
      console.log('  ⚠️  party_loyalty_cache table does not exist (skipping)');
    }

    console.log('\n✅ Successfully purged all votes from the database!');
    console.log('\nNote: MP data, bills, expenses, and postal code mappings were NOT deleted.');
  } catch (error: any) {
    console.error('❌ Error purging votes:', error.message);
    throw error;
  } finally {
    await closeDatabase();
  }
}

// Run the script
if (require.main === module) {
  purgeVotes().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { purgeVotes };

