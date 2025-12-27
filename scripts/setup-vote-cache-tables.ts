import { getDatabase, closeDatabase } from '../lib/db/database';

const db = getDatabase();

console.log('Setting up vote cache tables...');

// Create vote details cache table (caches vote details from OpenParliament)
db.exec(`
  CREATE TABLE IF NOT EXISTS vote_details_cache (
    vote_url TEXT PRIMARY KEY,
    vote_data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_vote_details_cache_expires ON vote_details_cache(expires_at);
`);

// Create votes cache table (caches MP's complete voting record)
db.exec(`
  CREATE TABLE IF NOT EXISTS votes_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mp_id INTEGER NOT NULL,
    vote_id TEXT NOT NULL,
    vote_data TEXT NOT NULL,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE,
    UNIQUE(mp_id, vote_id)
  );

  CREATE INDEX IF NOT EXISTS idx_votes_cache_mp_id ON votes_cache(mp_id);
  CREATE INDEX IF NOT EXISTS idx_votes_cache_expires ON votes_cache(expires_at);
`);

// Create party loyalty stats cache table
db.exec(`
  CREATE TABLE IF NOT EXISTS party_loyalty_cache (
    mp_id INTEGER PRIMARY KEY,
    votes_with_party INTEGER NOT NULL,
    votes_against_party INTEGER NOT NULL,
    free_votes INTEGER NOT NULL,
    abstained_paired_votes INTEGER DEFAULT 0,
    loyalty_percentage REAL NOT NULL,
    opposition_percentage REAL NOT NULL,
    free_vote_percentage REAL NOT NULL,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (mp_id) REFERENCES mps(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_party_loyalty_cache_expires ON party_loyalty_cache(expires_at);
`);

console.log('Vote cache tables created successfully!');
closeDatabase();

