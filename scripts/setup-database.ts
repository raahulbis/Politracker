import { queryExec, closeDatabase } from '../lib/db/database';

console.log('Setting up database schema...');

async function setupDatabase() {
  // Create MPs table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS mps (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      photo_url TEXT,
      party_name TEXT,
      district_name TEXT NOT NULL,
      district_id TEXT,
      elected_office TEXT DEFAULT 'MP',
      url TEXT,
      source_url TEXT,
      personal_url TEXT,
      gender TEXT,
      committees TEXT,
      associations TEXT,
      parliamentary_positions TEXT,
      salary REAL DEFAULT 209800,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(district_name, name)
    );

    CREATE INDEX IF NOT EXISTS idx_mps_name ON mps(name);
    CREATE INDEX IF NOT EXISTS idx_mps_district_name ON mps(district_name);
    CREATE INDEX IF NOT EXISTS idx_mps_district_id ON mps(district_id);
  `);

  // Create postal code mappings table (manual mappings)
  await queryExec(`
    CREATE TABLE IF NOT EXISTS postal_code_mappings (
      id SERIAL PRIMARY KEY,
      postal_code TEXT NOT NULL UNIQUE,
      mp_id INTEGER NOT NULL,
      district_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_postal_code ON postal_code_mappings(postal_code);
    CREATE INDEX IF NOT EXISTS idx_postal_code_mp_id ON postal_code_mappings(mp_id);
  `);

  // Create postal code cache table (API cache with TTL)
  await queryExec(`
    CREATE TABLE IF NOT EXISTS postal_code_cache (
      postal_code TEXT PRIMARY KEY,
      fed_boundary_id TEXT,
      riding_name TEXT,
      district_name TEXT,
      source TEXT DEFAULT 'represent',
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_postal_code_cache_expires ON postal_code_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_postal_code_cache_district ON postal_code_cache(district_name);
  `);

  // Create bill policy categories table (must be created before bills_motions for foreign key)
  await queryExec(`
    CREATE TABLE IF NOT EXISTS bill_policy_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_bill_categories_name ON bill_policy_categories(name);
    CREATE INDEX IF NOT EXISTS idx_bill_categories_slug ON bill_policy_categories(slug);
  `);

  // Create votes table (stores individual MP votes)
  // Note: bill_id foreign key is added separately after bills_motions table exists
  await queryExec(`
    CREATE TABLE IF NOT EXISTS votes (
      id SERIAL PRIMARY KEY,
      vote_id TEXT NOT NULL,
      mp_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      bill_number TEXT,
      bill_title TEXT,
      motion_title TEXT NOT NULL,
      vote_type TEXT NOT NULL,
      result TEXT NOT NULL,
      party_position TEXT,
      sponsor_party TEXT,
      parliament_number INTEGER,
      session_number INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE,
      UNIQUE(vote_id, mp_id)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_mp_id ON votes(mp_id);
    CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(date);
    CREATE INDEX IF NOT EXISTS idx_votes_vote_id ON votes(vote_id);
    CREATE INDEX IF NOT EXISTS idx_votes_mp_date ON votes(mp_id, date);
  `);

  // Add sponsor_party column if it doesn't exist (for existing databases)
  try {
    await queryExec(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'votes' AND column_name = 'sponsor_party'
        ) THEN
          ALTER TABLE votes ADD COLUMN sponsor_party TEXT;
        END IF;
      END $$;
    `);
    console.log('Checked sponsor_party column in votes table');
  } catch (error: any) {
    console.warn('Error checking sponsor_party column (may already exist):', error.message);
  }

  // Add bill_id column if it doesn't exist (for existing databases)
  // This must be done AFTER bills_motions table is created
  try {
    await queryExec(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'votes' AND column_name = 'bill_id'
        ) THEN
          -- Check if bills_motions table exists before adding foreign key
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bills_motions') THEN
            ALTER TABLE votes ADD COLUMN bill_id INTEGER REFERENCES bills_motions(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_votes_bill_id ON votes(bill_id);
          ELSE
            -- If bills_motions doesn't exist yet, add column without foreign key constraint
            ALTER TABLE votes ADD COLUMN bill_id INTEGER;
            CREATE INDEX IF NOT EXISTS idx_votes_bill_id ON votes(bill_id);
            -- Foreign key will be added later when bills_motions table is created
          END IF;
        END IF;
      END $$;
    `);
    console.log('Checked bill_id column in votes table');
    
    // If bills_motions exists but foreign key constraint doesn't, add it
    await queryExec(`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bills_motions') THEN
          -- Check if foreign key constraint exists
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
            WHERE tc.table_name = 'votes' 
              AND tc.constraint_type = 'FOREIGN KEY'
              AND ccu.column_name = 'bill_id'
          ) THEN
            -- Add foreign key constraint if column exists but constraint doesn't
            IF EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'votes' AND column_name = 'bill_id'
            ) THEN
              ALTER TABLE votes 
              ADD CONSTRAINT votes_bill_id_fkey 
              FOREIGN KEY (bill_id) REFERENCES bills_motions(id) ON DELETE SET NULL;
            END IF;
          END IF;
        END IF;
      END $$;
    `);
  } catch (error: any) {
    console.warn('Error checking bill_id column (may already exist):', error.message);
  }

  // Add updated_at column if it doesn't exist (for existing databases)
  try {
    await queryExec(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'votes' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE votes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        END IF;
      END $$;
    `);
    console.log('Checked updated_at column in votes table');
  } catch (error: any) {
    console.warn('Error checking updated_at column (may already exist):', error.message);
  }

  // Create bills/motions table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS bills_motions (
      id SERIAL PRIMARY KEY,
      bill_number TEXT,
      motion_number TEXT,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      introduced_date TEXT,
      parliament_number INTEGER,
      session_number INTEGER,
      long_title TEXT,
      short_title TEXT,
      policy_category_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (policy_category_id) REFERENCES bill_policy_categories(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bills_motions_bill_number ON bills_motions(bill_number);
    CREATE INDEX IF NOT EXISTS idx_bills_motions_type ON bills_motions(type);
    CREATE INDEX IF NOT EXISTS idx_bills_motions_category ON bills_motions(policy_category_id);
  `);

  // Create MP bill sponsorships table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS mp_bill_sponsorships (
      id SERIAL PRIMARY KEY,
      mp_id INTEGER NOT NULL,
      bill_motion_id INTEGER NOT NULL,
      sponsor_type TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_motion_id) REFERENCES bills_motions(id) ON DELETE CASCADE,
      UNIQUE(mp_id, bill_motion_id, sponsor_type)
    );

    CREATE INDEX IF NOT EXISTS idx_sponsorships_mp_id ON mp_bill_sponsorships(mp_id);
    CREATE INDEX IF NOT EXISTS idx_sponsorships_bill_id ON mp_bill_sponsorships(bill_motion_id);
  `);

  // Create vote cache tables for optimizing API requests
  console.log('Creating vote cache tables...');
  await queryExec(`
    CREATE TABLE IF NOT EXISTS vote_details_cache (
      vote_url TEXT PRIMARY KEY,
      vote_data TEXT NOT NULL,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vote_details_cache_expires ON vote_details_cache(expires_at);
  `);

  await queryExec(`
    CREATE TABLE IF NOT EXISTS votes_cache (
      id SERIAL PRIMARY KEY,
      mp_id INTEGER NOT NULL,
      vote_id TEXT NOT NULL,
      vote_data TEXT NOT NULL,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE,
      UNIQUE(mp_id, vote_id)
    );

    CREATE INDEX IF NOT EXISTS idx_votes_cache_mp_id ON votes_cache(mp_id);
    CREATE INDEX IF NOT EXISTS idx_votes_cache_expires ON votes_cache(expires_at);
  `);

  await queryExec(`
    CREATE TABLE IF NOT EXISTS party_loyalty_cache (
      mp_id INTEGER PRIMARY KEY,
      votes_with_party INTEGER NOT NULL,
      votes_against_party INTEGER NOT NULL,
      free_votes INTEGER NOT NULL,
      abstained_paired_votes INTEGER DEFAULT 0,
      loyalty_percentage REAL NOT NULL,
      opposition_percentage REAL NOT NULL,
      free_vote_percentage REAL NOT NULL,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_party_loyalty_cache_expires ON party_loyalty_cache(expires_at);
  `);

  // Create MP expenses table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS mp_expenses (
      id SERIAL PRIMARY KEY,
      mp_id INTEGER NOT NULL,
      quarter TEXT NOT NULL,
      year INTEGER NOT NULL,
      quarter_number INTEGER NOT NULL,
      staff_salaries REAL DEFAULT 0,
      travel REAL DEFAULT 0,
      hospitality REAL DEFAULT 0,
      contracts REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE,
      UNIQUE(mp_id, year, quarter_number)
    );

    CREATE INDEX IF NOT EXISTS idx_mp_expenses_mp_id ON mp_expenses(mp_id);
    CREATE INDEX IF NOT EXISTS idx_mp_expenses_quarter ON mp_expenses(year, quarter_number);
  `);

  // Create processed files tracking table
  await queryExec(`
    CREATE TABLE IF NOT EXISTS processed_expense_files (
      filename TEXT PRIMARY KEY,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      rows_processed INTEGER DEFAULT 0
    );
  `);

  // Create sessions table (for tracking parliamentary sessions)
  console.log('Creating sessions table...');
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

  console.log('Database schema created successfully!');
  console.log('\n⚠️  Note: Sessions table created, but no current session set.');
  console.log('   Run: npm run db:setup-sessions');
  console.log('   to add a current parliamentary session.\n');
  await closeDatabase();
}

setupDatabase().catch((error) => {
  console.error('Error setting up database:', error);
  process.exit(1);
});
