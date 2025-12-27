import { getCurrentSessionStartDate } from '../lib/db/sessions';
import { closeDatabase } from '../lib/db/database';

async function testSessionDate() {
  console.log('Testing session date retrieval...\n');

  try {
    const sessionDate = await getCurrentSessionStartDate();
    
    if (!sessionDate) {
      console.log('❌ getCurrentSessionStartDate() returned null');
      console.log('   This means no session with is_current = true exists in the database.');
      console.log('   Run: npm run db:setup-sessions\n');
    } else {
      console.log(`✓ getCurrentSessionStartDate() returned: "${sessionDate}"`);
      console.log(`  Type: ${typeof sessionDate}`);
      console.log(`  Format: ${sessionDate} (YYYY-MM-DD)`);
      console.log(`  Note: If this date is in the future, votes before this date will be filtered out.\n`);
    }
  } catch (error: any) {
    console.error('❌ Error getting session date:', error.message);
    if (error.message.includes('does not exist')) {
      console.error('   Sessions table does not exist!');
      console.error('   Run: npm run db:setup-sessions');
    }
  } finally {
    await closeDatabase();
  }
}

testSessionDate();

