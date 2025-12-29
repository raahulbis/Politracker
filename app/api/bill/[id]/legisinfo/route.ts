import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const billNumber = decodeURIComponent(params.id);
    
    // Extract session from bill number if available, or use default
    // Bill numbers like "C-15" need session info - we'll try to get it from the bill first
    // For now, we'll construct the URL and let it fail gracefully if session is missing
    const session = request.nextUrl.searchParams.get('session');
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session parameter required' },
        { status: 400 }
      );
    }
    
    // Construct LEGISinfo JSON URL
    // Format: https://www.parl.ca/legisinfo/en/bill/{session}/{bill_number}/json
    const billUrl = `https://www.parl.ca/legisinfo/en/bill/${session}/${billNumber.toLowerCase()}/json`;
    
    const response = await fetch(billUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Bill not found on LEGISinfo' },
          { status: 404 }
        );
      }
      throw new Error(`LEGISinfo API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    // The API returns an array, get the first item
    const billData = Array.isArray(data) ? data[0] : data;
    
    return NextResponse.json(billData);
  } catch (error) {
    console.error('Error fetching LEGISinfo data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch LEGISinfo data' },
      { status: 500 }
    );
  }
}


