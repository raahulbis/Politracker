import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db/database';

export async function GET() {
  try {
    const start = Date.now();
    const result = await queryOne<{ count: string }>('SELECT COUNT(*)::text as count FROM mps');
    const duration = Date.now() - start;
    
    return NextResponse.json({
      success: true,
      mpCount: result?.count || '0',
      queryTime: `${duration}ms`,
      databaseUrl: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      databaseUrl: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

