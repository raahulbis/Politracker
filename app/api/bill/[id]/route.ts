import { NextRequest, NextResponse } from 'next/server';
import { getBillWithMPVotes } from '@/lib/db/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const billNumber = decodeURIComponent(params.id);
    
    const result = await getBillWithMPVotes(billNumber);
    
    if (!result.bill) {
      return NextResponse.json(
        { error: 'Bill not found' },
        { status: 404 }
      );
    }
    
    // Log for debugging
    console.log(`[Bill API] Bill ${billNumber}: Found ${result.mpVotes.length} MP votes`);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching bill data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bill data' },
      { status: 500 }
    );
  }
}

