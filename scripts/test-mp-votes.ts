import { queryAll, queryOne, closeDatabase, convertPlaceholders } from '../lib/db/database';
import { getCurrentSessionStartDate } from '../lib/db/sessions';

async function testMPVotes(mpName: string) {
  console.log(`Testing votes for MP: ${mpName}\n`);

  try {
    // Get MP from database
    const mpSql = convertPlaceholders('SELECT id, name, district_name FROM mps WHERE name = $1 OR district_name = $1 LIMIT 1');
    const mp = await queryOne<{ id: number; name: string; district_name: string }>(mpSql, [mpName]);

    if (!mp) {
      console.log(`❌ MP "${mpName}" not found in database`);
      await closeDatabase();
      return;
    }

    console.log(`✓ Found MP: ${mp.name} (ID: ${mp.id}, District: ${mp.district_name})\n`);

    // Get session date
    const sessionDate = await getCurrentSessionStartDate();
    console.log(`Session date: ${sessionDate || 'null (no session set)'}\n`);

    // Get ALL votes (no date filter)
    const allVotesSql = convertPlaceholders('SELECT COUNT(*) as count FROM votes WHERE mp_id = $1');
    const allVotes = await queryOne<{ count: string }>(allVotesSql, [mp.id]);
    console.log(`Total votes in database: ${allVotes?.count || 0}`);

    // Get votes with dates
    const votesWithDatesSql = convertPlaceholders(`
      SELECT date, COUNT(*) as count 
      FROM votes 
      WHERE mp_id = $1 
      GROUP BY date 
      ORDER BY date DESC 
      LIMIT 10
    `);
    const recentVoteDates = await queryAll<{ date: string; count: string }>(votesWithDatesSql, [mp.id]);
    
    if (recentVoteDates.length > 0) {
      console.log('\nRecent vote dates:');
      recentVoteDates.forEach(v => {
        console.log(`  ${v.date}: ${v.count} vote(s)`);
      });
    } else {
      console.log('\n⚠️  No votes found for this MP in the database');
    }

    // Test the filter logic
    if (sessionDate) {
      console.log(`\n--- Filtering by session date: ${sessionDate} ---`);
      const filteredVotesSql = convertPlaceholders(`
        SELECT COUNT(*) as count 
        FROM votes 
        WHERE mp_id = $1 AND date >= $2
      `);
      const filteredVotes = await queryOne<{ count: string }>(filteredVotesSql, [mp.id, sessionDate]);
      console.log(`Votes after filtering: ${filteredVotes?.count || 0}`);
    } else {
      console.log(`\n--- No session date, showing all votes ---`);
      console.log(`All votes would be shown: ${allVotes?.count || 0}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await closeDatabase();
  }
}

// Get MP name from command line args
const mpName = process.argv[2] || 'Etobicoke Centre';
testMPVotes(mpName);



