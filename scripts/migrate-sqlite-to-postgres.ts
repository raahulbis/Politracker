import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

const sqlitePath = path.join(process.cwd(), 'data', 'politracker.db');
const connectionString = process.env.DATABASE_URL || 
  (process.env.PGHOST ? 
    `postgresql://${process.env.PGUSER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'politracker'}` :
    'postgresql://postgres:postgres@localhost:5432/politracker'
  );

interface TableInfo {
  name: string;
  sql: string;
}

async function migrateDatabase() {
  console.log('Starting SQLite to PostgreSQL migration...\n');

  // Check if SQLite database exists
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ SQLite database not found at: ${sqlitePath}`);
    process.exit(1);
  }

  console.log(`✓ Found SQLite database: ${sqlitePath}`);

  // Connect to SQLite
  const sqliteDb = new Database(sqlitePath);
  console.log('✓ Connected to SQLite database');

  // Connect to PostgreSQL
  const pgPool = new Pool({ connectionString });
  
  try {
    // Test PostgreSQL connection
    await pgPool.query('SELECT NOW()');
    console.log('✓ Connected to PostgreSQL database\n');
  } catch (error: any) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
    console.error('\nPlease ensure:');
    console.error('1. PostgreSQL is installed and running');
    console.error('2. Database "politracker" exists (run: createdb politracker)');
    console.error('3. DATABASE_URL environment variable is set correctly');
    console.error('   Or set: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD');
    process.exit(1);
  }

  // Get list of tables from SQLite
  const tables = sqliteDb.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all() as Array<{ name: string }>;

  console.log(`Found ${tables.length} tables to migrate:\n`);

  // Migrate each table
  for (const table of tables) {
    const tableName = table.name;
    console.log(`Migrating table: ${tableName}...`);

    try {
      // Get all rows from SQLite
      const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all() as any[];

      if (rows.length === 0) {
        console.log(`  ⊘ Table ${tableName} is empty, skipping\n`);
        continue;
      }

      // Get column names
      const firstRow = rows[0];
      const columns = Object.keys(firstRow);

      // Build INSERT statement with proper PostgreSQL syntax
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const columnList = columns.map(col => `"${col}"`).join(', ');
      const insertSql = `
        INSERT INTO ${tableName} (${columnList})
        VALUES (${placeholders})
        ON CONFLICT DO NOTHING
      `;

      // Insert rows in batches
      const batchSize = 100;
      let inserted = 0;
      let skipped = 0;

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        
        for (const row of batch) {
          const values = columns.map(col => {
            const value = row[col];
            // Handle null, undefined, and convert types if needed
            if (value === null || value === undefined) {
              return null;
            }
            // Keep as-is, PostgreSQL will handle type conversion
            return value;
          });

          try {
            const result = await pgPool.query(insertSql, values);
            if (result.rowCount && result.rowCount > 0) {
              inserted++;
            } else {
              skipped++;
            }
          } catch (error: any) {
            // If conflict error, count as skipped
            if (error.code === '23505') { // unique_violation
              skipped++;
            } else {
              console.error(`  ✗ Error inserting row:`, error.message);
              throw error;
            }
          }
        }
      }

      console.log(`  ✓ Inserted: ${inserted} rows, Skipped: ${skipped} rows (duplicates)\n`);
    } catch (error: any) {
      console.error(`  ✗ Error migrating table ${tableName}:`, error.message);
      // Continue with other tables
    }
  }

  // Close connections
  sqliteDb.close();
  await pgPool.end();

  console.log('✅ Migration complete!');
  console.log('\nNote: You may need to reset sequences for tables with SERIAL primary keys:');
  console.log('Run: npm run db:reset-sequences (if you create that script)');
}

// Reset sequences for SERIAL columns
async function resetSequences() {
  const pgPool = new Pool({ connectionString });
  
  try {
    const tables = [
      'mps', 'postal_code_mappings', 'bill_policy_categories',
      'votes', 'bills_motions', 'mp_bill_sponsorships',
      'votes_cache', 'mp_expenses'
    ];

    for (const table of tables) {
      const result = await pgPool.query(`
        SELECT setval(pg_get_serial_sequence('${table}', 'id'), 
               COALESCE((SELECT MAX(id) FROM ${table}), 1), 
               true)
      `);
      console.log(`✓ Reset sequence for ${table}`);
    }

    await pgPool.end();
    console.log('\n✅ Sequences reset!');
  } catch (error: any) {
    console.error('Error resetting sequences:', error.message);
    await pgPool.end();
    process.exit(1);
  }
}

// Main execution
const command = process.argv[2];

if (command === 'reset-sequences') {
  resetSequences().catch(console.error);
} else {
  migrateDatabase().catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
}



