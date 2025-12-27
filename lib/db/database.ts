import { Pool, Client, PoolClient, QueryResult } from 'pg';
import { logDatabaseHealth } from './health-check';

// Get database connection string from environment variable
// Format: postgresql://user:password@host:port/database
// Railway provides:
//   - DATABASE_PRIVATE_URL: Private/internal connection (use this for same-project connections)
//   - DATABASE_URL: Internal connection (fallback)
//   - DATABASE_PUBLIC_URL: Public-facing connection (for external connections)
// Or use individual env vars: PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
// On macOS with Homebrew, the default user is usually the current user, not 'postgres'
const defaultUser = process.env.USER || process.env.USERNAME || 'postgres';
// Connection string priority:
// 1. DATABASE_PRIVATE_URL - Railway private/internal (preferred for same-project)
// 2. DATABASE_URL - Railway internal or custom (fallback)
// 3. DATABASE_PUBLIC_URL - Railway public (works if internal networking fails)
const connectionString = process.env.DATABASE_PRIVATE_URL ||  // Railway private/internal (preferred for same-project)
  process.env.DATABASE_URL ||                                  // Railway internal (fallback)
  process.env.DATABASE_PUBLIC_URL ||                           // Railway public (fallback if internal fails)
  (process.env.PGHOST ? 
    `postgresql://${process.env.PGUSER || defaultUser}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'politracker'}` :
    `postgresql://${defaultUser}@localhost:5432/politracker`
  );

// Log connection info (but not the full connection string for security)
if (connectionString) {
  try {
    const url = new URL(connectionString);
    const connectionType = process.env.DATABASE_PRIVATE_URL ? 'private' : 
                          process.env.DATABASE_URL ? 'internal' :
                          process.env.DATABASE_PUBLIC_URL ? 'public' : 'default';
    console.log(`[DB] Connecting to PostgreSQL (${connectionType}) at ${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`);
  } catch (e) {
    // Ignore URL parsing errors
  }
} else {
  console.error('[DB] ❌ No database connection string found! Check environment variables:');
  console.error('   - DATABASE_PRIVATE_URL (Railway private - recommended)');
  console.error('   - DATABASE_URL (Railway internal)');
  console.error('   - DATABASE_PUBLIC_URL (Railway public)');
  console.error('   - PGHOST, PGPORT, etc. (individual vars)');
}

// Create a connection pool for better performance
let pool: Pool | null = null;

export function getDatabase(): Pool {
  if (!pool) {
    // For Railway and other cloud providers, enable SSL by default
    // Railway's DATABASE_URL includes SSL parameters in the connection string
    // If it doesn't, we'll add SSL configuration for production environments
    const poolConfig: any = {
      connectionString,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000, // Increased timeout for Railway/cloud connections
      statement_timeout: 30000, // 30 second query timeout
      query_timeout: 30000,
    };

    // Railway's connection strings typically include SSL parameters in the URL itself
    // We let the connection string handle SSL configuration
    // Only add explicit SSL config if connection string doesn't specify it
    // and we're in production/Railway environment
    const isRailway = connectionString.includes('railway.app') || 
                      connectionString.includes('railway.internal') ||
                      process.env.RAILWAY_ENVIRONMENT;
    
    if ((process.env.NODE_ENV === 'production' || isRailway) && 
        !connectionString.includes('sslmode=') && 
        !connectionString.includes('ssl=')) {
      // Railway typically includes SSL in connection string, but if not, enable it
      // Internal connections might work without explicit SSL, but let's be safe
      poolConfig.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(poolConfig);

    // Handle pool errors with better logging
    pool.on('error', (err: Error & { code?: string }) => {
      console.error('❌ Unexpected error on idle PostgreSQL client:', err.message);
      if (err.code) {
        console.error(`   Error code: ${err.code}`);
      }
      if (err.code === 'ECONNREFUSED') {
        console.error('   💡 Connection refused - possible causes:');
        console.error('      1. PostgreSQL service is not running on Railway');
        console.error('      2. Services are not in the same Railway project');
        console.error('      3. Check Railway dashboard → PostgreSQL service status');
        console.error('      4. Ensure DATABASE_PRIVATE_URL or DATABASE_URL is set correctly');
      }
      if (err.stack) {
        console.error(err.stack);
      }
    });

    // Log successful pool creation for debugging
    console.log('[DB] PostgreSQL connection pool created');
    
    // Perform a non-blocking health check (async, doesn't wait)
    // This helps diagnose connection issues early
    logDatabaseHealth(pool, connectionString).catch(() => {
      // Silently fail - health check is just for logging
    });
  }
  return pool;
}

// Get a single client for transactions (caller must release it)
export async function getClient(): Promise<PoolClient> {
  const pool = getDatabase();
  try {
    return await pool.connect();
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error('[DB] ❌ Connection refused when getting client');
      console.error('   This usually means:');
      console.error('   1. PostgreSQL service is not running on Railway');
      console.error('   2. Services are in different Railway projects');
      console.error('   3. Check Railway dashboard → PostgreSQL service → Status');
    }
    throw error;
  }
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
