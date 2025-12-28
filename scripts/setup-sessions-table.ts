import { queryExec, queryRun, closeDatabase, convertPlaceholders } from '../lib/db/database';

async function setupSessionsTable() {
  console.log('Setting up sessions table...\n');

  // Create sessions table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      session_number INTEGER NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE,
      is_current BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_is_current ON sessions(is_current);
    CREATE INDEX IF NOT EXISTS idx_sessions_start_date ON sessions(start_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_number ON sessions(session_number);
  `);

  // Insert initial session
  const insertSql = convertPlaceholders(`
    INSERT INTO sessions (session_number, start_date, end_date, is_current)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (session_number) DO UPDATE SET
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      is_current = EXCLUDED.is_current,
      updated_at = CURRENT_TIMESTAMP
  `);

  await queryRun(insertSql, [45, '2025-05-25', null, true]);

  console.log('✓ Sessions table created and initial session inserted');
  console.log('  Session 45: May 25, 2025 - (ongoing), is_current: true\n');
}

async function main() {
  try {
    await setupSessionsTable();
  } catch (error) {
    console.error('Error setting up sessions table:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();


