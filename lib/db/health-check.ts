/**
 * Database health check utility
 * Tests database connectivity and provides diagnostic information
 */

import { Pool } from 'pg';

export interface HealthCheckResult {
  healthy: boolean;
  error?: string;
  connectionInfo?: {
    host: string;
    port: string;
    database: string;
    connectionType: string;
  };
  details?: string;
}

/**
 * Perform a health check on the database connection
 * This attempts to connect and run a simple query
 */
export async function checkDatabaseHealth(
  pool: Pool,
  connectionString: string
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    healthy: false,
  };

  // Extract connection info
  try {
    const url = new URL(connectionString);
    const connectionType = process.env.DATABASE_PRIVATE_URL ? 'private' : 
                          process.env.DATABASE_URL ? 'internal' :
                          process.env.DATABASE_PUBLIC_URL ? 'public' : 'default';
    
    result.connectionInfo = {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1) || 'unknown',
      connectionType,
    };
  } catch (e) {
    result.error = 'Invalid connection string format';
    return result;
  }

  // Try to connect and run a simple query
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT 1');
    result.healthy = true;
    result.details = 'Database connection successful';
    return result;
  } catch (error: any) {
    result.error = error.message;
    result.details = `Connection failed: ${error.code || 'UNKNOWN'}`;
    
    if (error.code === 'ECONNREFUSED') {
      result.details = 'Connection refused. Possible causes: PostgreSQL service not running, services in different projects, or network configuration issue.';
    } else if (error.code === 'ETIMEDOUT') {
      result.details = 'Connection timeout. Database server may be unreachable.';
    } else if (error.code === 'ENOTFOUND') {
      result.details = 'Database host not found. Check that services are in the same Railway project.';
    }
    
    return result;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Log database health status (non-blocking)
 * Use this for startup diagnostics without blocking the application
 */
export async function logDatabaseHealth(
  pool: Pool,
  connectionString: string
): Promise<void> {
  try {
    const health = await checkDatabaseHealth(pool, connectionString);
    
    if (health.healthy) {
      console.log('[DB] ✅ Database health check passed');
      if (health.connectionInfo) {
        console.log(`[DB]    Connected to ${health.connectionInfo.connectionType} database at ${health.connectionInfo.host}:${health.connectionInfo.port}/${health.connectionInfo.database}`);
      }
    } else {
      console.error('[DB] ❌ Database health check failed');
      if (health.connectionInfo) {
        console.error(`[DB]    Attempting to connect to ${health.connectionInfo.connectionType} database at ${health.connectionInfo.host}:${health.connectionInfo.port}/${health.connectionInfo.database}`);
      }
      if (health.error) {
        console.error(`[DB]    Error: ${health.error}`);
      }
      if (health.details) {
        console.error(`[DB]    ${health.details}`);
      }
      console.error('[DB]    💡 Troubleshooting steps:');
      console.error('[DB]       1. Check Railway dashboard → PostgreSQL service is running');
      console.error('[DB]       2. Verify both services are in the same Railway project');
      console.error('[DB]       3. Check Variables tab for DATABASE_URL or DATABASE_PRIVATE_URL');
    }
  } catch (error) {
    // Silently fail health check logging to not block startup
    console.error('[DB] Health check error:', error);
  }
}



