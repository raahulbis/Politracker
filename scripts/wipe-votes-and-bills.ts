import { getDatabase, closeDatabase } from '../lib/db/database';

async function wipeVotesAndBills() {
  const pool = getDatabase();

  console.log('Wiping all votes and bills data from database...\n');

  try {
    // Delete all votes
    const votesResult = await pool.query('DELETE FROM votes');
    console.log(`✓ Deleted ${votesResult.rowCount || 0} votes`);

    // Delete all bills/motions
    const billsResult = await pool.query('DELETE FROM bills_motions');
    console.log(`✓ Deleted ${billsResult.rowCount || 0} bills/motions`);

    // Delete all MP bill sponsorships
    const sponsorshipsResult = await pool.query('DELETE FROM mp_bill_sponsorships');
    console.log(`✓ Deleted ${sponsorshipsResult.rowCount || 0} MP bill sponsorships`);

    // Delete all vote details cache
    const voteDetailsCacheResult = await pool.query('DELETE FROM vote_details_cache');
    console.log(`✓ Deleted ${voteDetailsCacheResult.rowCount || 0} vote details cache entries`);

    // Delete all votes cache
    const votesCacheResult = await pool.query('DELETE FROM votes_cache');
    console.log(`✓ Deleted ${votesCacheResult.rowCount || 0} votes cache entries`);

    // Delete all party loyalty cache
    const partyLoyaltyCacheResult = await pool.query('DELETE FROM party_loyalty_cache');
    console.log(`✓ Deleted ${partyLoyaltyCacheResult.rowCount || 0} party loyalty cache entries`);

    console.log('\n✅ Successfully wiped all votes and bills data from database!');
    console.log('\nNote: MP data, expenses, and postal code mappings were NOT deleted.');
  } catch (error) {
    console.error('❌ Error wiping votes and bills:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

wipeVotesAndBills();

