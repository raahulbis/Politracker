import axios from 'axios';
import * as https from 'https';
import { transaction, convertPlaceholders, queryOne, queryAll, closeDatabase } from '../lib/db/database';
import { saveNewVotesToDB } from '../lib/db/save-votes';
import type { Vote } from '@/types';
import { cacheVoteDetails, getCachedVoteDetails } from '../lib/api/openparliament-cache';
import { getCurrentSessionStartDate } from '../lib/db/sessions';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

interface Ballot {
  vote_url: string;
  politician_url: string;
  politician_membership_url: string;
  ballot: string;
}

interface BallotResponse {
  objects: Ballot[];
  pagination: {
    offset: number;
    limit: number;
    next_url?: string;
    previous_url?: string | null;
  };
}

interface VoteDetails {
  date: string;
  description?: {
    en?: string;
    fr?: string;
  };
  result?: string;
  bill_url?: string;
  party_votes?: any[];
}

interface BillInfo {
  number?: string;
  legisinfo_id?: number;
  session?: string;
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
 * Convert politician URL slug to name
 * e.g., "/politicians/justin-trudeau/" -> "Justin Trudeau"
 */
function slugToName(slug: string): string {
  // Remove /politicians/ prefix and trailing slash
  const cleanSlug = slug.replace(/^\/politicians\//, '').replace(/\/$/, '');
  
  // Split by hyphens and capitalize each word
  return cleanSlug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Find MP in database by politician URL slug
 */
async function findMPByPoliticianUrl(politicianUrl: string): Promise<{ id: number; name: string } | null> {
  // Convert slug to name
  const name = slugToName(politicianUrl);
  
  // Try exact name match first
  const sql = convertPlaceholders('SELECT id, name FROM mps WHERE name = $1 LIMIT 1');
  let mp = await queryOne<{ id: number; name: string }>(sql, [name]);
  
  if (mp) {
    return mp;
  }
  
  // Try case-insensitive match
  const sqlCaseInsensitive = convertPlaceholders('SELECT id, name FROM mps WHERE LOWER(name) = LOWER($1) LIMIT 1');
  mp = await queryOne<{ id: number; name: string }>(sqlCaseInsensitive, [name]);
  
  if (mp) {
    return mp;
  }
  
  // Try matching by first and last name
  const nameParts = name.split(' ');
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    
    const sqlNameParts = convertPlaceholders(`
      SELECT id, name FROM mps 
      WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)
      LIMIT 1
    `);
    mp = await queryOne<{ id: number; name: string }>(sqlNameParts, [firstName, lastName]);
    
    if (mp) {
      return mp;
    }
  }
  
  return null;
}

/**
 * Check if bill exists in database by bill_number, legisinfo_id, or bill_number + session
 */
async function billExistsInDB(billInfo: BillInfo): Promise<{ id: number; bill_number: string | null } | null> {
  // First try by legisinfo_id (most reliable)
  if (billInfo.legisinfo_id) {
    const sql = convertPlaceholders(`
      SELECT id, bill_number FROM bills_motions 
      WHERE legisinfo_id = $1 
      LIMIT 1
    `);
    const result = await queryOne<{ id: number; bill_number: string | null }>(sql, [billInfo.legisinfo_id]);
    if (result) {
      return result;
    }
  }
  
  // Try by bill_number + session (more specific than just bill_number)
  if (billInfo.number && billInfo.session) {
    const sql = convertPlaceholders(`
      SELECT id, bill_number FROM bills_motions 
      WHERE bill_number = $1 AND session = $2
      LIMIT 1
    `);
    const result = await queryOne<{ id: number; bill_number: string | null }>(sql, [billInfo.number, billInfo.session]);
    if (result) {
      return result;
    }
  }
  
  // Fallback: try by bill_number alone
  if (billInfo.number) {
    const sql = convertPlaceholders(`
      SELECT id, bill_number FROM bills_motions 
      WHERE bill_number = $1 
      LIMIT 1
    `);
    const result = await queryOne<{ id: number; bill_number: string | null }>(sql, [billInfo.number]);
    if (result) {
      return result;
    }
  }
  
  return null;
}

/**
 * Fetch vote details from API or cache
 */
async function getVoteDetails(voteUrl: string): Promise<VoteDetails | null> {
  // Check cache first
  const cached = getCachedVoteDetails(voteUrl);
  if (cached) {
    return cached;
  }
  
  // Fetch from API
  try {
    const response = await axios.get<VoteDetails>(`${OPENPARLIAMENT_API_BASE}${voteUrl}`, {
      httpsAgent,
      timeout: 15000,
    });
    
    const voteData = response.data;
    
    // Cache the vote details
    cacheVoteDetails(voteUrl, voteData);
    
    return voteData;
  } catch (error: any) {
    console.warn(`Could not fetch vote details for ${voteUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Extract bill number from bill URL
 * e.g., "/bills/45-1/C-12/" -> "C-12"
 */
function extractBillNumberFromUrl(billUrl: string): string | null {
  // Pattern: /bills/{session}/{bill-number}/
  const match = billUrl.match(/\/bills\/\d+-\d+\/([CS]-\d+)\//);
  return match ? match[1] : null;
}

/**
 * Extract session from bill URL
 * e.g., "/bills/45-1/C-12/" -> "45-1"
 */
function extractSessionFromUrl(billUrl: string): string | null {
  const match = billUrl.match(/\/bills\/(\d+-\d+)\//);
  return match ? match[1] : null;
}

/**
 * Get bill info from vote details
 * Extracts bill number directly from bill_url to avoid unnecessary API calls
 */
async function getBillInfoFromVote(voteDetails: VoteDetails): Promise<BillInfo | null> {
  if (!voteDetails.bill_url) {
    return null;
  }
  
  // Extract bill number and session directly from URL
  const billNumber = extractBillNumberFromUrl(voteDetails.bill_url);
  const session = extractSessionFromUrl(voteDetails.bill_url);
  
  if (!billNumber) {
    // If we can't extract from URL, try fetching full bill details
    try {
      // Check cache first
      const cached = getCachedVoteDetails(voteDetails.bill_url);
      if (cached) {
        return {
          number: cached.number,
          legisinfo_id: cached.legisinfo_id,
          session: cached.session,
        };
      }
      
      // Fetch bill details
      const response = await axios.get(`${OPENPARLIAMENT_API_BASE}${voteDetails.bill_url}`, {
        httpsAgent,
        timeout: 15000,
      });
      
      const billData = response.data;
      
      // Cache the bill data
      cacheVoteDetails(voteDetails.bill_url, billData);
      
      return {
        number: billData.number,
        legisinfo_id: billData.legisinfo_id,
        session: billData.session,
      };
    } catch (error: any) {
      console.warn(`Could not fetch bill details for ${voteDetails.bill_url}: ${error.message}`);
      return null;
    }
  }
  
  // Return bill info extracted from URL
  // We'll match by bill_number and session, which should be sufficient
  return {
    number: billNumber,
    session: session || undefined,
    // We don't have legisinfo_id from URL, but we can match by number + session
  };
}

/**
 * Fetch all ballots from OpenParliament API
 * Only fetches votes from 2025 onwards to match the bills we have
 * Limits to a reasonable number to avoid timeouts
 */
async function fetchAllBallots(limit: number = 5000, minDate?: string): Promise<Ballot[]> {
  // If no minDate provided, get current session start date
  if (!minDate) {
    const currentSessionStartDate = await getCurrentSessionStartDate();
    minDate = currentSessionStartDate || '2025-01-01'; // Fallback
  }
  const allBallots: Ballot[] = [];
  let offset = 0;
  const batchSize = 100;
  let hasMore = true;

  console.log(`Fetching all ballots from OpenParliament (votes from ${minDate} onwards)...`);

  while (hasMore && allBallots.length < limit) {
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;
    let response: any = null;

    while (!success && retryCount < maxRetries) {
      try {
        const url = `${OPENPARLIAMENT_API_BASE}/votes/ballots/`;
        const params: any = {
          limit: batchSize,
          offset,
        };

        // Note: The ballots endpoint might not support date filtering directly
        // We'll filter by date after fetching vote details
        console.log(`Fetching ballots (offset: ${offset}, limit: ${batchSize})...`);
        
        response = await axios.get<BallotResponse>(url, {
          httpsAgent,
          params,
          timeout: 60000, // Increased timeout to 60 seconds
        });

        success = true;
      } catch (error: any) {
        if (error.response?.status === 429) {
          // Rate limited - exponential backoff
          retryCount++;
          const backoffDelay = Math.min(2000 * Math.pow(2, retryCount), 60000);
          console.warn(`Rate limited (429). Waiting ${backoffDelay/1000}s before retry ${retryCount}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        } else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          // Timeout - retry with backoff
          retryCount++;
          const backoffDelay = Math.min(2000 * Math.pow(2, retryCount), 30000);
          console.warn(`Timeout fetching ballots (offset: ${offset}). Retrying (${retryCount}/${maxRetries}) after ${backoffDelay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        } else {
          // Other error - log and break (we'll process what we have)
          console.warn(`Error fetching ballots (offset: ${offset}): ${error.message}. Continuing with ${allBallots.length} ballots fetched so far...`);
          hasMore = false;
          break;
        }
      }
    }

    if (!response && allBallots.length === 0) {
      throw new Error(`Failed to fetch ballots after ${maxRetries} retries`);
    }
    
    if (!response) {
      // We have some ballots, continue with what we have
      hasMore = false;
      break;
    }

    const ballots = response.data.objects || [];
    console.log(`  Retrieved ${ballots.length} ballots`);

    if (ballots.length === 0) {
      hasMore = false;
    } else {
      allBallots.push(...ballots);
      offset += ballots.length;

      // Check if there's more data
      if (!response.data.pagination?.next_url) {
        hasMore = false;
      }

      // Delay between requests to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  console.log(`\nTotal ballots fetched: ${allBallots.length}`);
  return allBallots;
}

/**
 * Process ballots and save votes for bills we have
 * Only processes votes from 2025 onwards
 */
async function processBallots(ballots: Ballot[], minDate?: string): Promise<void> {
  // If no minDate provided, get current session start date
  if (!minDate) {
    const currentSessionStartDate = await getCurrentSessionStartDate();
    minDate = currentSessionStartDate || '2025-01-01'; // Fallback
  }
  console.log(`\nProcessing ${ballots.length} ballots...\n`);

  // Group ballots by vote_url to fetch vote details once per vote
  const ballotsByVote = new Map<string, Ballot[]>();
  for (const ballot of ballots) {
    if (!ballotsByVote.has(ballot.vote_url)) {
      ballotsByVote.set(ballot.vote_url, []);
    }
    ballotsByVote.get(ballot.vote_url)!.push(ballot);
  }

  console.log(`Found ${ballotsByVote.size} unique votes\n`);

  let processedVotes = 0;
  let votesWithBills = 0;
  let votesWithoutBills = 0;
  let votesProcessed = 0;
  let votesSkipped = 0;
  let votesBeforeMinDate = 0;
  let errors = 0;

  // Process votes in batches
  const voteUrls = Array.from(ballotsByVote.keys());
  const batchSize = 10;

  for (let i = 0; i < voteUrls.length; i += batchSize) {
    const batch = voteUrls.slice(i, i + batchSize);

    // Process batch in parallel
    await Promise.all(batch.map(async (voteUrl) => {
      try {
        const voteBallots = ballotsByVote.get(voteUrl)!;
        
        // Fetch vote details
        const voteDetails = await getVoteDetails(voteUrl);
        if (!voteDetails || !voteDetails.date) {
          votesSkipped += voteBallots.length;
          return;
        }

        // Filter by date - only process votes from 2025 onwards
        if (voteDetails.date < minDate) {
          votesBeforeMinDate += voteBallots.length;
          return;
        }

        // Get bill info
        const billInfo = await getBillInfoFromVote(voteDetails);
        
        // Check if bill exists in our database
        if (!billInfo) {
          if (processedVotes < 5) {
            console.log(`  Vote ${voteUrl} has no bill info`);
          }
          votesWithoutBills += voteBallots.length;
          return;
        }

        const billExists = await billExistsInDB(billInfo);
        if (!billExists) {
          if (processedVotes < 5) {
            console.log(`  Vote ${voteUrl} - bill not found in DB: ${billInfo.number || billInfo.legisinfo_id || 'unknown'}`);
          }
          votesWithoutBills += voteBallots.length;
          return;
        }
        
        if (processedVotes < 5) {
          console.log(`  Vote ${voteUrl} - found bill in DB: ${billInfo.number || billInfo.legisinfo_id}`);
        }

        votesWithBills += voteBallots.length;

        // Fetch sponsor party from bill details if we have a bill URL
        let sponsorParty: string | undefined = undefined;
        if (voteDetails.bill_url) {
          try {
            // Check cache first
            const cachedBill = getCachedVoteDetails(voteDetails.bill_url);
            let billData = cachedBill;
            
            if (!billData) {
              // Fetch bill details to get sponsor
              const billResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${voteDetails.bill_url}`, {
                httpsAgent,
                timeout: 15000,
              });
              billData = billResponse.data;
              // Cache the bill data
              cacheVoteDetails(voteDetails.bill_url, billData);
            }
            
            // Get sponsor's party from bill data
            if (billData?.sponsor_politician_membership_url) {
              try {
                // Check cache for membership
                const cachedMembership = getCachedVoteDetails(billData.sponsor_politician_membership_url);
                let membershipData = cachedMembership;
                
                if (!membershipData) {
                  const membershipResponse = await axios.get(
                    `${OPENPARLIAMENT_API_BASE}${billData.sponsor_politician_membership_url}`,
                    { httpsAgent, timeout: 10000 }
                  );
                  membershipData = membershipResponse.data;
                  // Cache the membership data
                  cacheVoteDetails(billData.sponsor_politician_membership_url, membershipData);
                }
                
                sponsorParty = membershipData?.party?.short_name?.en || 
                              membershipData?.party?.name?.en;
              } catch (error) {
                // Silently fail - sponsor party will remain undefined
              }
            }
          } catch (error) {
            // Silently fail - sponsor party will remain undefined
          }
        }

        // Process each ballot for this vote
        const votesToSave: Map<number, Vote[]> = new Map();

        for (const ballot of voteBallots) {
          // Find MP by politician URL
          const mp = await findMPByPoliticianUrl(ballot.politician_url);
          if (!mp) {
            continue;
          }

          // Create vote object
          const vote: Vote = {
            id: voteUrl,
            date: voteDetails.date,
            bill_number: billInfo.number || undefined,
            motion_title: voteDetails.description?.en || voteDetails.description || 'Motion',
            vote_type: mapBallotToVoteType(ballot.ballot),
            result: mapResultToVoteResult(voteDetails.result),
            sponsor_party: sponsorParty,
          };

          // Add to MP's votes
          if (!votesToSave.has(mp.id)) {
            votesToSave.set(mp.id, []);
          }
          votesToSave.get(mp.id)!.push(vote);
        }

        // Save votes for each MP
        for (const [mpId, votes] of votesToSave.entries()) {
          await saveNewVotesToDB(mpId, votes);
          votesProcessed += votes.length;
        }

        processedVotes++;
        
        if (processedVotes % 10 === 0) {
          console.log(`  Processed ${processedVotes}/${ballotsByVote.size} votes... (${votesProcessed} votes saved)`);
        }
      } catch (error: any) {
        errors++;
        console.error(`Error processing vote ${voteUrl}:`, error.message);
      }
    }));

    // Delay between batches
    if (i + batchSize < voteUrls.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n✅ Vote sync complete!');
  console.log(`   - Votes processed: ${processedVotes}`);
  console.log(`   - Votes saved: ${votesProcessed}`);
  console.log(`   - Ballots with bills in DB: ${votesWithBills}`);
  console.log(`   - Ballots without bills in DB: ${votesWithoutBills}`);
  console.log(`   - Ballots skipped (no date/details): ${votesSkipped}`);
  console.log(`   - Ballots before ${minDate}: ${votesBeforeMinDate}`);
  console.log(`   - Errors: ${errors}`);
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('Starting vote sync from OpenParliament ballots...\n');

    // Fetch all ballots (limit to 5k to avoid timeouts)
    const ballots = await fetchAllBallots(5000);

    if (ballots.length === 0) {
      console.log('No ballots found to process.');
      return;
    }

    // Process ballots and save votes (only for current session)
    await processBallots(ballots);
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run the script
main();

