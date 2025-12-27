import { NextRequest, NextResponse } from 'next/server';
import { getMPByDistrict } from '@/lib/db/queries';
import { getPartyLoyaltyStats, getMPMotions, getMPVotingRecord } from '@/lib/api/commons';

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

    // Return MP profile data immediately
    // Then fetch additional data in a separate step (handled on client side)
    // This allows the profile to display while voting data loads
    
    // For now, we'll fetch everything but structure it to allow profile-first loading
    const mpIdentifier = mp.district_id || mp.district_name || mp.name;
    const votingRecord = await getMPVotingRecord(mpIdentifier, mp.name);
    const motions = await getMPMotions(mpIdentifier, mp.name);

    // Calculate party loyalty stats
    const partyLoyalty = await getPartyLoyaltyStats(
      mpIdentifier,
      mp.name,
      mp.party_name || 'Unknown',
      votingRecord.votes
    );

    // Validate that all votes are categorized
    const categorizedVotes = partyLoyalty.votes_with_party + partyLoyalty.votes_against_party + partyLoyalty.free_votes;
    const isValid = categorizedVotes === partyLoyalty.total_votes;

    return NextResponse.json({
      mp,
      votingRecord,
      partyLoyalty,
      motions,
      dataValid: isValid, // Flag to indicate if data validation passed
      categorizedVotes, // For debugging
    });
  } catch (error) {
    console.error('Error fetching MP data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MP data' },
      { status: 500 }
    );
  }
}
