import { queryExec, queryRun, convertPlaceholders, closeDatabase } from '../lib/db/database';

/**
 * Clear all cache tables
 */
async function clearAllCaches() {
  console.log('Clearing all caches...\n');

  try {
    // Clear vote_details_cache
    console.log('Clearing vote_details_cache...');
    await queryExec('TRUNCATE TABLE vote_details_cache');
    console.log('  ✓ Cleared vote_details_cache');

    // Clear votes_cache
    console.log('Clearing votes_cache...');
    await queryExec('TRUNCATE TABLE votes_cache');
    console.log('  ✓ Cleared votes_cache');

    // Clear party_loyalty_cache
    console.log('Clearing party_loyalty_cache...');
    await queryExec('TRUNCATE TABLE party_loyalty_cache');
    console.log('  ✓ Cleared party_loyalty_cache');

    // Clear postal_code_cache
    console.log('Clearing postal_code_cache...');
    await queryExec('TRUNCATE TABLE postal_code_cache');
    console.log('  ✓ Cleared postal_code_cache');

    console.log('\n✅ All caches cleared successfully!');
  } catch (error: any) {
    // If table doesn't exist, that's okay - just log and continue
    if (error.code === '42P01') {
      console.log(`  ⚠️  Table doesn't exist (may not be created yet): ${error.message}`);
    } else {
      console.error('Error clearing caches:', error.message);
      throw error;
    }
  }

  await closeDatabase();
}

// Run the script
if (require.main === module) {
  clearAllCaches().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { clearAllCaches };

