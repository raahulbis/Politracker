import { getDatabase, closeDatabase } from '../lib/db/database';

const db = getDatabase();

console.log('Wiping all votes and bills data from database...\n');

try {
  // Delete all votes
  const votesDeleted = db.prepare('DELETE FROM votes').run();
  console.log(`✓ Deleted ${votesDeleted.changes} votes`);

  // Delete all bills/motions
  const billsDeleted = db.prepare('DELETE FROM bills_motions').run();
  console.log(`✓ Deleted ${billsDeleted.changes} bills/motions`);

  // Delete all MP bill sponsorships
  const sponsorshipsDeleted = db.prepare('DELETE FROM mp_bill_sponsorships').run();
  console.log(`✓ Deleted ${sponsorshipsDeleted.changes} MP bill sponsorships`);

  // Delete all vote details cache
  const voteDetailsCacheDeleted = db.prepare('DELETE FROM vote_details_cache').run();
  console.log(`✓ Deleted ${voteDetailsCacheDeleted.changes} vote details cache entries`);

  // Delete all votes cache
  const votesCacheDeleted = db.prepare('DELETE FROM votes_cache').run();
  console.log(`✓ Deleted ${votesCacheDeleted.changes} votes cache entries`);

  // Delete all party loyalty cache
  const partyLoyaltyCacheDeleted = db.prepare('DELETE FROM party_loyalty_cache').run();
  console.log(`✓ Deleted ${partyLoyaltyCacheDeleted.changes} party loyalty cache entries`);

  console.log('\n✅ Successfully wiped all votes and bills data from database!');
  console.log('\nNote: MP data, expenses, and postal code mappings were NOT deleted.');
} catch (error) {
  console.error('❌ Error wiping votes and bills:', error);
  process.exit(1);
} finally {
  closeDatabase();
}

