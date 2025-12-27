import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/database';

/**
 * Test endpoint to diagnose database connection issues
 * This tries to connect and provides detailed information
 */
export async function GET() {
  try {
    const pool = getDatabase();
    
    // Try to get a client from the pool
    const client = await pool.connect();
    
    try {
      // Run a simple query to test connectivity
      const result = await client.query('SELECT version(), current_database(), current_user');
      
      return NextResponse.json({
        success: true,
        message: 'Database connection successful!',
        databaseInfo: {
          version: result.rows[0].version,
          database: result.rows[0].current_database,
          user: result.rows[0].current_user,
        },
        environment: {
          hasPrivateUrl: !!process.env.DATABASE_PRIVATE_URL,
          hasDatabaseUrl: !!process.env.DATABASE_URL,
          hasPublicUrl: !!process.env.DATABASE_PUBLIC_URL,
          nodeEnv: process.env.NODE_ENV,
        },
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        address: error.address,
        port: error.port,
      },
      environment: {
        hasPrivateUrl: !!process.env.DATABASE_PRIVATE_URL,
        hasDatabaseUrl: !!process.env.DATABASE_URL,
        hasPublicUrl: !!process.env.DATABASE_PUBLIC_URL,
        nodeEnv: process.env.NODE_ENV,
      },
      troubleshooting: {
        step1: 'Verify PostgreSQL service is running in Railway dashboard',
        step2: 'Check that both services are in the same Railway project',
        step3: 'Verify DATABASE_URL or DATABASE_PRIVATE_URL is set in Variables',
        step4: 'Check Railway PostgreSQL service logs for errors',
      },
    }, { status: 500 });
  }
}

