import axios from 'axios';
import * as https from 'https';
import { queryAll, queryOne, convertPlaceholders, closeDatabase } from '../lib/db/database';
import { saveNewVotesToDB } from '../lib/db/save-votes';
import { getCurrentSession } from '../lib/db/sessions';
import type { Vote } from '@/types';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

interface VoteDetails {
  date: string;
  description?: {
    en?: string;
    fr?: string;
  };
  result?: string;
  related?: {
    ballots_url?: string;
  };
  party_votes?: Array<{
    party?: {
      short_name?: { en?: string };
      name?: { en?: string };
    };
    vote?: string;
    yea?: number;
    nay?: number;
  }>;
}

interface Ballot {
  vote_url?: string;
  politician_url: string;
  politician_name?: string;
  politician_membership_url?: string;
  ballot: string;
}

interface BallotResponse {
  objects: Ballot[];
  pagination?: {
    next_url?: string;
  };
}

/**
 * Map OpenParliament ballot value to our Vote type
 */
function mapBallotToVoteType(ballot: string | null | undefined): 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting' {
  if (!ballot || typeof ballot !== 'string') {
    return 'Not Voting';
  }
  const normalized = ballot.toLowerCase().trim();
  
  switch (normalized) {
    case 'yes':
    case 'yea':
    case 'yay':
      return 'Yea';
    case 'no':
    case 'nay':
      return 'Nay';
    case 'paired':
      return 'Paired';
    case 'abstained':
      return 'Abstained';
    case "didn't vote":
    case 'didnt vote':
    case 'not voting':
      return 'Not Voting';
    default:
      return 'Not Voting';
  }
}

/**
 * Map OpenParliament vote result to our result type
 */
function mapResultToVoteResult(result: string | null | undefined): 'Agreed To' | 'Negatived' | 'Tie' {
  if (!result || typeof result !== 'string') {
    return 'Negatived';
  }
  switch (result.toLowerCase()) {
    case 'passed':
      return 'Agreed To';
    case 'failed':
      return 'Negatived';
    case 'tie':
      return 'Tie';
    default:
      return 'Negatived';
  }
}

/**
 * Normalize party name for comparison
 */
function normalizePartyName(partyName: string | null | undefined): string {
  if (!partyName || typeof partyName !== 'string') {
    return '';
  }
  const normalized = partyName.toLowerCase().trim();
  
  if (normalized.includes('liberal')) return 'liberal';
  if (normalized.includes('conservative')) return 'conservative';
  if (normalized.includes('new democratic') || normalized.includes('ndp')) return 'ndp';
  if (normalized.includes('bloc') || normalized.includes('québécois')) return 'bloc';
  if (normalized.includes('green')) return 'green';
  
  return normalized;
}

/**
 * Convert politician URL slug to name
 */
function slugToName(slug: string): string {
  const cleanSlug = slug.replace(/^\/politicians\//, '').replace(/\/$/, '');
  const parts = cleanSlug.split('-');
  if (parts.length < 2) {
    return parts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  const firstName = parts.slice(0, -1).join('-');
  const lastName = parts[parts.length - 1];
  
  return `${firstName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} ${lastName.charAt(0).toUpperCase() + lastName.slice(1)}`;
}

/**
 * Get MP ID by politician URL
 */
async function getMPIdByPoliticianUrl(politicianUrl: string): Promise<number | null> {
  // Extract slug from URL (format: /politicians/firstname-lastname/)
  const slugMatch = politicianUrl.match(/\/politicians\/([^\/]+)/);
  if (!slugMatch) {
    return null;
  }
  
  const slug = slugMatch[1];
  const parts = slug.split('-');
  
  if (parts.length < 2) {
    // Try to find by converting slug to name
    const name = slugToName(politicianUrl);
    return await getMPIdByName(name);
  }
  
  const firstName = parts.slice(0, -1).join('-').toLowerCase();
  const lastName = parts[parts.length - 1].toLowerCase();
  
  // Try to match by first_name and last_name
  const sql = convertPlaceholders(`
    SELECT id FROM mps 
    WHERE LOWER(first_name) = $1 AND LOWER(last_name) = $2
    LIMIT 1
  `);
  const mp = await queryOne<{ id: number }>(sql, [firstName, lastName]);
  
  if (mp) {
    return mp.id;
  }
  
  // Fallback: try matching by full name
  const name = slugToName(politicianUrl);
  return await getMPIdByName(name);
}

/**
 * Get MP ID by name
 */
async function getMPIdByName(name: string): Promise<number | null> {
  const sql = convertPlaceholders(`
    SELECT id FROM mps WHERE name = $1 LIMIT 1
  `);
  const mp = await queryOne<{ id: number }>(sql, [name]);
  return mp?.id || null;
}

/**
 * Fetch vote details for a single vote URL
 */
async function fetchVoteDetails(voteUrl: string): Promise<VoteDetails | null> {
  try {
    const fullUrl = voteUrl.startsWith('http') 
      ? voteUrl 
      : `${OPENPARLIAMENT_API_BASE}${voteUrl}`;
      
    const voteResponse = await axios.get<VoteDetails>(fullUrl, {
      httpsAgent,
      timeout: 30000,
    });
    // Delay after vote details fetch
    await new Promise(resolve => setTimeout(resolve, 1500));
    return voteResponse.data;
  } catch (error: any) {
    console.warn(`Error fetching vote details from ${voteUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch ballots from ballots_url
 */
async function fetchBallots(ballotsUrl: string): Promise<Ballot[]> {
  const ballots: Ballot[] = [];
  let ballotOffset = 0;
  const ballotLimit = 100;
  let hasMoreBallots = true;

  const fullBallotsUrl = ballotsUrl.startsWith('http')
    ? ballotsUrl
    : `${OPENPARLIAMENT_API_BASE}${ballotsUrl}`;

  while (hasMoreBallots) {
    try {
      const ballotResponse = await axios.get<BallotResponse>(
        fullBallotsUrl,
        {
          httpsAgent,
          params: {
            limit: ballotLimit,
            offset: ballotOffset,
          },
          timeout: 30000,
        }
      );

      const batchBallots = ballotResponse.data.objects || [];
      if (batchBallots.length === 0) {
        hasMoreBallots = false;
      } else {
        ballots.push(...batchBallots);
        ballotOffset += batchBallots.length;
        if (!ballotResponse.data.pagination?.next_url) {
          hasMoreBallots = false;
        }
      }

      if (hasMoreBallots) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      } else if (error.response?.status === 404) {
        hasMoreBallots = false;
      } else {
        hasMoreBallots = false;
      }
    }
  }

  return ballots;
}

/**
 * Determine party position from vote details
 */
function getPartyPosition(
  voteDetails: VoteDetails,
  mpParty: string | null
): 'For' | 'Against' | 'Free Vote' | undefined {
  if (!mpParty || !voteDetails.party_votes || !Array.isArray(voteDetails.party_votes)) {
    return 'Free Vote';
  }

  const normalizedMpParty = normalizePartyName(mpParty);
  if (!normalizedMpParty) {
    return 'Free Vote';
  }

  const partyVote = voteDetails.party_votes.find((pv: any) => {
    if (!pv || !pv.party) return false;
    const partyShortName = pv.party?.short_name?.en || pv.party?.short_name || '';
    const partyFullName = pv.party?.name?.en || pv.party?.name || '';
    const normalizedShort = normalizePartyName(partyShortName);
    const normalizedFull = normalizePartyName(partyFullName);
    
    return normalizedShort === normalizedMpParty || normalizedFull === normalizedMpParty;
  });

  if (!partyVote) {
    return 'Free Vote';
  }

  const normalizedVote = (partyVote.vote || '').toLowerCase().trim();
  if (normalizedVote === 'yes' || normalizedVote === 'yea' || normalizedVote === 'yay') {
    return 'For';
  } else if (normalizedVote === 'no' || normalizedVote === 'nay') {
    return 'Against';
  } else {
    return 'Free Vote';
  }
}

/**
 * Sync votes for all motions in database
 */
async function syncVotesFromMotions() {
  console.log('Starting motion votes sync...\n');

  // Get current session to filter motions
  const currentSession = await getCurrentSession();
  if (!currentSession) {
    throw new Error('No current session found. Please set up a current session first.');
  }

  const parliamentNumber = currentSession.session_number;

  console.log(`Fetching motions for parliament ${parliamentNumber}...`);

  // Get all motions for current parliament
  const motionsSql = convertPlaceholders(`
    SELECT 
      decision_division_number,
      name,
      parliament_number,
      session_number,
      date
    FROM motions
    WHERE parliament_number = $1
    ORDER BY date DESC, decision_division_number DESC
  `);
  
  const motions = await queryAll<{
    decision_division_number: number;
    name: string;
    parliament_number: number;
    session_number: number;
    date: Date | string;
  }>(motionsSql, [parliamentNumber]);

  console.log(`Found ${motions.length} motions to process\n`);

  if (motions.length === 0) {
    console.log('No motions found. Exiting.');
    return;
  }

  let totalVotesSaved = 0;
  let totalErrors = 0;
  let motionsWithVotes = 0;
  let motionsProcessed = 0;

  // Process motions in batches
  const batchSize = 5;
  
  for (let i = 0; i < motions.length; i += batchSize) {
    const batch = motions.slice(i, i + batchSize);
    
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(motions.length / batchSize)} (${batch.length} motions)...`);

    for (const motion of batch) {
      try {
        motionsProcessed++;
        
        // Construct vote URL: /votes/{parliament_number}-{session_number}/{decision_division_number}/
        const voteUrl = `/votes/${motion.parliament_number}-${motion.session_number}/${motion.decision_division_number}/`;
        
        const motionNamePreview = motion.name.length > 60 
          ? motion.name.substring(0, 60) + '...' 
          : motion.name;
        console.log(`\nProcessing motion ${motion.decision_division_number}: ${motionNamePreview}`);
        console.log(`Vote URL: ${voteUrl}`);

        // Fetch vote details
        const voteDetails = await fetchVoteDetails(voteUrl);
        
        if (!voteDetails || !voteDetails.date) {
          console.log(`  ⚠️  No vote details found or missing date`);
          continue;
        }

        // Get ballots_url from vote details
        const ballotsUrl = voteDetails.related?.ballots_url;

        if (!ballotsUrl) {
          console.log(`  ⚠️  No ballots URL found`);
          continue;
        }

        console.log(`  Found ballots URL: ${ballotsUrl}`);

        // Fetch ballots
        const ballots = await fetchBallots(ballotsUrl);
        
        if (ballots.length === 0) {
          console.log(`  ⚠️  No ballots found`);
          continue;
        }

        console.log(`  Found ${ballots.length} ballots`);

        // Process ballots and match to MPs
        const votesToSave: Array<{ mpId: number; vote: Vote }> = [];
        let matchedCount = 0;
        let unmatchedCount = 0;

        for (const ballot of ballots) {
          // Try to find MP by politician_url first
          let mpId: number | null = null;
          
          if (ballot.politician_url) {
            mpId = await getMPIdByPoliticianUrl(ballot.politician_url);
          }
          
          // Fallback: try politician_name if URL didn't work
          if (!mpId && ballot.politician_name) {
            mpId = await getMPIdByName(ballot.politician_name);
          }
          
          if (!mpId) {
            unmatchedCount++;
            continue;
          }
          
          matchedCount++;

          // Get MP's party for party position calculation
          const mpPartySql = convertPlaceholders('SELECT party_name FROM mps WHERE id = $1');
          const mpPartyRow = await queryOne<{ party_name: string | null }>(mpPartySql, [mpId]);
          const mpParty = mpPartyRow?.party_name || null;

          // Determine party position
          const partyPosition = getPartyPosition(voteDetails, mpParty);

          // Create vote object (no bill_id or bill_number for motions)
          const voteObj: Vote = {
            id: voteUrl,
            date: voteDetails.date,
            motion_title: motion.name,
            vote_type: mapBallotToVoteType(ballot.ballot),
            result: mapResultToVoteResult(voteDetails.result),
            party_position: partyPosition,
            // No sponsor_party for motions (they're not bills)
          };

          votesToSave.push({ mpId, vote: voteObj });
        }

        console.log(`  Matched ${matchedCount} MPs, ${unmatchedCount} unmatched`);

        // Save votes for all MPs
        if (votesToSave.length > 0) {
          // Group votes by MP ID for batch saving
          const votesByMP = new Map<number, Vote[]>();
          for (const { mpId, vote } of votesToSave) {
            if (!votesByMP.has(mpId)) {
              votesByMP.set(mpId, []);
            }
            votesByMP.get(mpId)!.push(vote);
          }

          // Save votes for each MP
          for (const [mpId, votes] of votesByMP.entries()) {
            await saveNewVotesToDB(mpId, votes);
            totalVotesSaved += votes.length;
          }

          motionsWithVotes++;
          console.log(`  ✅ Saved ${votesToSave.length} votes for ${votesByMP.size} MPs`);
        } else {
          console.log(`  ⚠️  No votes to save`);
        }

        // Delay between motions to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        totalErrors++;
        console.error(`  ❌ Error processing motion ${motion.decision_division_number}: ${error.message}`);
      }
    }

    // Delay between batches
    if (i + batchSize < motions.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log('\n========================================');
  console.log('Motion Votes Sync Complete!');
  console.log(`  Motions processed: ${motionsProcessed}`);
  console.log(`  Motions with votes: ${motionsWithVotes}`);
  console.log(`  Total votes saved: ${totalVotesSaved}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('========================================\n');
}

async function main() {
  try {
    await syncVotesFromMotions();
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main();
}

export { syncVotesFromMotions };

