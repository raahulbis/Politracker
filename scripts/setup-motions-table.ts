import { queryExec, closeDatabase } from '../lib/db/database';

async function setupMotionsTable() {
  console.log('Creating motions table...\n');

  await queryExec(`
    CREATE TABLE IF NOT EXISTS motions (
      id SERIAL PRIMARY KEY,
      decision_division_number INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      result TEXT NOT NULL,
      number_of_yeas INTEGER NOT NULL,
      number_of_nays INTEGER NOT NULL,
      number_of_paired INTEGER NOT NULL DEFAULT 0,
      date TIMESTAMP NOT NULL,
      type TEXT NOT NULL,
      parliament_number INTEGER NOT NULL,
      session_number INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_motions_decision_division_number ON motions(decision_division_number);
    CREATE INDEX IF NOT EXISTS idx_motions_parliament_session ON motions(parliament_number, session_number);
    CREATE INDEX IF NOT EXISTS idx_motions_date ON motions(date);
    CREATE INDEX IF NOT EXISTS idx_motions_type ON motions(type);
  `);

  console.log('✓ Motions table created successfully\n');
}

async function main() {
  try {
    await setupMotionsTable();
  } catch (error: any) {
    console.error('Error setting up motions table:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main();
}

export { setupMotionsTable };


