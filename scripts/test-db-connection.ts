import { queryOne, queryAll } from '../lib/db/database';

async function testConnection() {
  console.log('Testing database connection...\n');

  try {
    // Test 1: Simple query
    console.log('Test 1: Simple COUNT query...');
    const start1 = Date.now();
    const count = await queryOne<{ count: string }>('SELECT COUNT(*)::text as count FROM mps');
    const time1 = Date.now() - start1;
    console.log(`✓ Found ${count?.count} MPs in ${time1}ms\n`);

    // Test 2: Search query
    console.log('Test 2: Search query...');
    const start2 = Date.now();
    const mps = await queryAll<any>('SELECT name, district_name FROM mps LIMIT 5');
    const time2 = Date.now() - start2;
    console.log(`✓ Retrieved ${mps.length} MPs in ${time2}ms`);
    mps.forEach((mp, i) => console.log(`  ${i + 1}. ${mp.name} - ${mp.district_name}`));
    console.log('');

    // Test 3: Complex query with JOIN
    console.log('Test 3: JOIN query...');
    const start3 = Date.now();
    const expenses = await queryAll<any>(
      'SELECT m.name, COUNT(e.id) as expense_count FROM mps m LEFT JOIN mp_expenses e ON m.id = e.mp_id GROUP BY m.id, m.name LIMIT 5'
    );
    const time3 = Date.now() - start3;
    console.log(`✓ JOIN query completed in ${time3}ms\n`);

    console.log('✅ All database tests passed!');
    console.log(`\nPerformance:`);
    console.log(`  Simple query: ${time1}ms`);
    console.log(`  Search query: ${time2}ms`);
    console.log(`  JOIN query: ${time3}ms`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check DATABASE_URL environment variable');
    console.error('2. Verify PostgreSQL is running: pg_isready');
    console.error('3. Check database exists: psql -l | grep politracker');
    process.exit(1);
  }
}

testConnection();



