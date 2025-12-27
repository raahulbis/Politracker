import Database from 'better-sqlite3';
import { Pool } from 'pg';
import path from 'path';

const sqlitePath = path.join(process.cwd(), 'data', 'politracker.db');
const connectionString = process.env.DATABASE_URL || 
  (process.env.PGHOST ? 
    `postgresql://${process.env.PGUSER || process.env.USER || 'postgres'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'politracker'}` :
    `postgresql://${process.env.USER || 'postgres'}@localhost:5432/politracker`
  );

async function migrateRemainingTables() {
  console.log('Migrating remaining tables (mp_expenses, mp_bill_sponsorships)...\n');

  const sqliteDb = new Database(sqlitePath);
  const pgPool = new Pool({ connectionString });

  try {
    // Migrate mp_expenses
    console.log('Migrating mp_expenses...');
    const expenses = sqliteDb.prepare('SELECT * FROM mp_expenses').all() as any[];
    
    if (expenses.length > 0) {
      let inserted = 0;
      let skipped = 0;

      for (const row of expenses) {
        try {
          const result = await pgPool.query(
            `INSERT INTO mp_expenses (mp_id, quarter, year, quarter_number, staff_salaries, travel, hospitality, contracts, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (mp_id, year, quarter_number) DO NOTHING`,
            [
              row.mp_id,
              row.quarter,
              row.year,
              row.quarter_number,
              row.staff_salaries,
              row.travel,
              row.hospitality,
              row.contracts,
              row.created_at,
              row.updated_at
            ]
          );
          if (result.rowCount && result.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (error: any) {
          if (error.code === '23505') {
            skipped++;
          } else {
            console.error(`  ✗ Error: ${error.message}`);
          }
        }
      }
      console.log(`  ✓ Inserted: ${inserted} rows, Skipped: ${skipped} rows\n`);
    } else {
      console.log('  ⊘ Table is empty\n');
    }

    // Migrate mp_bill_sponsorships
    console.log('Migrating mp_bill_sponsorships...');
    const sponsorships = sqliteDb.prepare('SELECT * FROM mp_bill_sponsorships').all() as any[];
    
    if (sponsorships.length > 0) {
      let inserted = 0;
      let skipped = 0;

      for (const row of sponsorships) {
        try {
          const result = await pgPool.query(
            `INSERT INTO mp_bill_sponsorships (mp_id, bill_motion_id, sponsor_type, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (mp_id, bill_motion_id, sponsor_type) DO NOTHING`,
            [
              row.mp_id,
              row.bill_motion_id,
              row.sponsor_type,
              row.created_at
            ]
          );
          if (result.rowCount && result.rowCount > 0) {
            inserted++;
          } else {
            skipped++;
          }
        } catch (error: any) {
          if (error.code === '23505') {
            skipped++;
          } else {
            console.error(`  ✗ Error: ${error.message}`);
          }
        }
      }
      console.log(`  ✓ Inserted: ${inserted} rows, Skipped: ${skipped} rows\n`);
    } else {
      console.log('  ⊘ Table is empty\n');
    }

    sqliteDb.close();
    await pgPool.end();

    console.log('✅ Migration of remaining tables complete!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    sqliteDb.close();
    await pgPool.end();
    process.exit(1);
  }
}

migrateRemainingTables();

