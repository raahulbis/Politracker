import { NextRequest, NextResponse } from 'next/server';
import { getMPByDistrict } from '@/lib/db/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const mpId = params.id;

  try {
    // Decode the ID (could be district_id, district_name, or MP name)
    const decodedId = decodeURIComponent(mpId);
    
    // getMPByDistrict handles district_name, district_id, and name lookups
    const mp = await getMPByDistrict(decodedId);

    if (!mp) {
      return NextResponse.json(
        { error: 'MP not found' },
        { status: 404 }
      );
    }

    // Return only the MP profile data (fast, from database)
    return NextResponse.json({ mp });
  } catch (error) {
    console.error('Error fetching MP profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MP profile' },
      { status: 500 }
    );
  }
}

