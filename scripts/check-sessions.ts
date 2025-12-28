import { queryOne, queryAll, closeDatabase, convertPlaceholders } from '../lib/db/database';

async function checkSessions() {
  console.log('Checking sessions table...\n');

  try {
    // Check if table exists and get all sessions
    const allSessions = await queryAll<any>(convertPlaceholders(`
      SELECT id, session_number, start_date, end_date, is_current, created_at, updated_at
      FROM sessions
      ORDER BY session_number DESC
    `));

    console.log(`Found ${allSessions.length} session(s) in database:\n`);

    if (allSessions.length === 0) {
      console.log('⚠️  No sessions found in database!');
      console.log('   Run: npm run setup-sessions-table (or node -r ts-node/register scripts/setup-sessions-table.ts)');
      console.log('   to create the sessions table and add a current session.\n');
    } else {
      allSessions.forEach((session, i) => {
        console.log(`Session ${i + 1}:`);
        console.log(`  ID: ${session.id}`);
        console.log(`  Session Number: ${session.session_number}`);
        console.log(`  Start Date: ${session.start_date}`);
        console.log(`  End Date: ${session.end_date || 'null (ongoing)'}`);
        console.log(`  Is Current: ${session.is_current}`);
        console.log(`  Created: ${session.created_at}`);
        console.log('');
      });

      // Check for current session
      const currentSession = await queryOne<any>(convertPlaceholders(`
        SELECT id, session_number, start_date, end_date, is_current
        FROM sessions
        WHERE is_current = true
        ORDER BY start_date DESC
        LIMIT 1
      `));

      if (!currentSession) {
        console.log('⚠️  No current session found (is_current = true)');
        console.log('   This is why getCurrentSessionStartDate() returns null!');
        console.log('   You need to set is_current = true for at least one session.\n');
      } else {
        console.log('✓ Current session found:');
        console.log(`  Session ${currentSession.session_number}: ${currentSession.start_date} - ${currentSession.end_date || 'ongoing'}\n`);
      }
    }
  } catch (error: any) {
    if (error.message.includes('does not exist')) {
      console.error('❌ Sessions table does not exist!');
      console.error('   Run: npm run setup-sessions-table (or node -r ts-node/register scripts/setup-sessions-table.ts)');
      console.error('   to create the sessions table.\n');
    } else {
      console.error('❌ Error checking sessions table:', error.message);
    }
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

checkSessions();


