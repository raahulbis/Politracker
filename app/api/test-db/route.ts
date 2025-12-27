import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/database';

export async function GET() {
  try {
    // Check if DATABASE_URL is set
    const hasDatabaseUrl = !!process.env.DATABASE_URL;
    const hasDatabasePublicUrl = !!process.env.DATABASE_PUBLIC_URL;
    
    // Get connection string info (without exposing credentials)
    let connectionInfo: string | null = null;
    if (process.env.DATABASE_URL) {
      try {
        const url = new URL(process.env.DATABASE_URL);
        connectionInfo = `${url.hostname}:${url.port || 5432}/${url.pathname.slice(1)}`;
      } catch (e) {
        connectionInfo = 'Invalid URL format';
      }
    }

    const start = Date.now();
    const result = await queryOne<{ count: string }>('SELECT COUNT(*)::text as count FROM mps');
    const duration = Date.now() - start;
    
    return NextResponse.json({
      success: true,
      mpCount: result?.count || '0',
      queryTime: `${duration}ms`,
      database: {
        urlSet: hasDatabaseUrl,
        publicUrlSet: hasDatabasePublicUrl,
        connectionInfo,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    // Provide more detailed error information
    const errorDetails: any = {
      message: error.message,
      code: error.code || 'UNKNOWN',
    };
    
    // Add common PostgreSQL error codes and their meanings
    if (error.code === 'ECONNREFUSED') {
      errorDetails.meaning = 'Connection refused - database server is not reachable';
    } else if (error.code === 'ETIMEDOUT') {
      errorDetails.meaning = 'Connection timeout - database server did not respond';
    } else if (error.code === '28P01') {
      errorDetails.meaning = 'Authentication failed - invalid username or password';
    } else if (error.code === '3D000') {
      errorDetails.meaning = 'Database does not exist';
    } else if (error.code === '42P01') {
      errorDetails.meaning = 'Table does not exist - database schema not initialized';
    } else if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
      errorDetails.meaning = 'Table does not exist - run: npm run db:setup';
    }

    return NextResponse.json({
      success: false,
      error: errorDetails,
      database: {
        urlSet: !!process.env.DATABASE_URL,
        publicUrlSet: !!process.env.DATABASE_PUBLIC_URL,
      },
      troubleshooting: {
        checkUrl: 'Verify DATABASE_URL is set in Railway Variables',
        checkSchema: 'Run: railway run npm run db:setup',
        checkLogs: 'View Railway logs for more details',
      },
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

