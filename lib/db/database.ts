import { Pool, Client, PoolClient, QueryResult } from 'pg';

// Get database connection string from environment variable
// Format: postgresql://user:password@host:port/database
// Or use individual env vars: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// On macOS with Homebrew, the default user is usually the current user, not 'postgres'
const defaultUser = process.env.USER || process.env.USERNAME || 'postgres';
const connectionString = process.env.DATABASE_URL || 
  (process.env.PGHOST ? 
    `postgresql://${process.env.PGUSER || defaultUser}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'politracker'}` :
    `postgresql://${defaultUser}@localhost:5432/politracker`
  );

// Create a connection pool for better performance
let pool: Pool | null = null;

export function getDatabase(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // Increased timeout for initial connection
      statement_timeout: 30000, // 30 second query timeout
      query_timeout: 30000,
    });

    // Handle pool errors
    pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

// Get a single client for transactions (caller must release it)
export async function getClient(): Promise<PoolClient> {
  const pool = getDatabase();
  return await pool.connect();
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Helper to execute a query and return a single row (similar to .get())
export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const pool = getDatabase();
  const result = await pool.query(sql, params);
  return result.rows[0] || null;
}

// Helper to execute a query and return all rows (similar to .all())
export async function queryAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const pool = getDatabase();
  const result = await pool.query(sql, params);
  return result.rows;
}

// Helper to execute a query and return the result (similar to .run())
export async function queryRun(sql: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid?: number }> {
  const pool = getDatabase();
  const result = await pool.query(sql, params);
  return {
    changes: result.rowCount || 0,
    lastInsertRowid: result.rows[0]?.id, // PostgreSQL returns id in RETURNING clause
  };
}

// Helper to execute multiple statements (similar to .exec())
export async function queryExec(sql: string): Promise<void> {
  const pool = getDatabase();
  const client = await pool.connect();
  try {
    await client.query(sql);
  } finally {
    client.release();
  }
}

// Helper for transactions
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Convert ? placeholders to PostgreSQL $1, $2, etc.
export function convertPlaceholders(sql: string): string {
  let paramIndex = 1;
  return sql.replace(/\?/g, () => `$${paramIndex++}`);
}
