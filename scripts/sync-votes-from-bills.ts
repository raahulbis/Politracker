import axios from 'axios';
import * as https from 'https';
import { queryAll, queryOne, transaction, convertPlaceholders, closeDatabase } from '../lib/db/database';
import { saveNewVotesToDB } from '../lib/db/save-votes';
import { getCachedVoteDetails, cacheVoteDetails } from '../lib/api/openparliament-cache';
import { getCurrentSession } from '../lib/db/sessions';
import type { Vote } from '@/types';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

interface OpenParliamentVote {
  url: string;
  date?: string;
  description?: {
    en?: string;
    fr?: string;
  };
  result?: string;
  bill_url?: string;
}

interface OpenParliamentVoteResponse {
  objects: OpenParliamentVote[];
  pagination?: {
    next_url?: string;
  };
}

interface BillDetails {
  vote_urls?: string[]; // Array of vote URLs for this bill
  [key: string]: any;
}

interface VoteDetails {
  date: string;
  description?: {
    en?: string;
    fr?: string;
  };
  result?: string;
  bill_url?: string;
  related?: {
    ballots_url?: string; // URL to fetch ballots for this vote
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
 * Format: firstname-lastname (e.g., "ziad-aboultaif" -> "Ziad Aboultaif")
 */
function slugToName(slug: string): string {
  // Remove /politicians/ prefix and trailing slash
  const cleanSlug = slug.replace(/^\/politicians\//, '').replace(/\/$/, '');
  
  // Split by hyphens - format is firstname-lastname
  const parts = cleanSlug.split('-');
  if (parts.length < 2) {
    // Fallback: just capitalize each word
    return parts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // First part(s) is first name, last part is last name
  // Handle cases like "fares-al-soud" where last name has multiple parts
  // Typically: firstname-lastname or firstname-lastname-part2
  // We'll assume the last part is always the last name, rest is first name
  const firstName = parts.slice(0, -1).join('-');
  const lastName = parts[parts.length - 1];
  
  // Return as "FirstName LastName"
  const capitalizedFirstName = firstName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const capitalizedLastName = lastName.charAt(0).toUpperCase() + lastName.slice(1);
  
  return `${capitalizedFirstName} ${capitalizedLastName}`;
}

/**
 * Get MP ID from database by name (with improved matching using LIKE patterns)
 */
async function getMPIdByName(mpName: string): Promise<number | null> {
  if (!mpName || typeof mpName !== 'string') {
    return null;
  }

  // Try exact name match first
  const sql = convertPlaceholders('SELECT id FROM mps WHERE name = $1 LIMIT 1');
  let result = await queryOne<{ id: number }>(sql, [mpName]);
  
  if (result) {
    return result.id;
  }
  
  // Try case-insensitive exact match
  const sqlCaseInsensitive = convertPlaceholders('SELECT id FROM mps WHERE LOWER(name) = LOWER($1) LIMIT 1');
  result = await queryOne<{ id: number }>(sqlCaseInsensitive, [mpName]);
  
  if (result) {
    return result.id;
  }
  
  // Try LIKE match (handles honorifics like "Right Hon." and variations)
  // Match if the name contains the search name (handles "Right Hon. John Smith" matching "John Smith")
  const sqlLike = convertPlaceholders('SELECT id FROM mps WHERE LOWER(name) LIKE LOWER($1) LIMIT 1');
  result = await queryOne<{ id: number }>(sqlLike, [`%${mpName}%`]);
  
  if (result) {
    return result.id;
  }
  
  // Also try matching if the search name contains the DB name (handles reverse case)
  // Extract just the name part (remove common honorifics)
  const nameWithoutHonorifics = mpName
    .replace(/^(Right\s+)?(Hon\.?\s+)?/i, '')
    .replace(/^(Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+|Dr\.?\s+)/i, '')
    .trim();
  
  if (nameWithoutHonorifics !== mpName) {
    const sqlNameOnly = convertPlaceholders('SELECT id FROM mps WHERE LOWER(name) LIKE LOWER($1) LIMIT 1');
    result = await queryOne<{ id: number }>(sqlNameOnly, [`%${nameWithoutHonorifics}%`]);
    
    if (result) {
      return result.id;
    }
  }
  
  // Try matching by first and last name with LIKE (handles hyphens and variations)
  const nameParts = mpName.trim().split(/\s+/);
  if (nameParts.length >= 2) {
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ');
    
    // Try exact match first
    const sqlNameParts = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)
      LIMIT 1
    `);
    result = await queryOne<{ id: number }>(sqlNameParts, [firstName, lastName]);
    
    if (result) {
      return result.id;
    }
    
    // Try LIKE match for first and last name (handles hyphens like "Mary-Jane" vs "Mary Jane")
    // Use more precise matching: match if normalized names contain the search terms
    const firstNameNormalized = firstName.replace(/-/g, ' ').trim();
    const lastNameNormalized = lastName.replace(/-/g, ' ').trim();
    
    const sqlNameLike = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(REPLACE(REPLACE(first_name, '-', ' '), '  ', ' ')) LIKE LOWER($1) 
        AND LOWER(REPLACE(REPLACE(last_name, '-', ' '), '  ', ' ')) LIKE LOWER($2)
      LIMIT 1
    `);
    result = await queryOne<{ id: number }>(sqlNameLike, [`%${firstNameNormalized}%`, `%${lastNameNormalized}%`]);
    
    if (result) {
      return result.id;
    }
  }
  
  return null;
}

/**
 * Get MP ID from database by politician URL
 * Format: firstname-lastname (e.g., "/politicians/ziad-aboultaif/" or "ziad-aboultaif")
 * Uses LIKE patterns to handle hyphens and variations
 */
async function getMPIdByPoliticianUrl(politicianUrl: string): Promise<number | null> {
  if (!politicianUrl) {
    return null;
  }
  
  // Remove /politicians/ prefix and trailing slash
  const cleanSlug = politicianUrl.replace(/^\/politicians\//, '').replace(/\/$/, '');
  
  // Split by hyphens - format is firstname-lastname
  const parts = cleanSlug.split('-');
  if (parts.length < 2) {
    // Fallback: try converting to name and matching
    const name = slugToName(politicianUrl);
    return await getMPIdByName(name);
  }
  
  // First part(s) is first name, last part is last name
  // Handle cases like "fares-al-soud" where last name has multiple parts
  const firstName = parts.slice(0, -1).join('-').toLowerCase();
  const lastName = parts[parts.length - 1].toLowerCase();
  
  // If first_name or last_name columns are empty, try matching by full name only
  // First check if we have any MPs with first_name/last_name populated
  const hasNameColumnsSql = convertPlaceholders(`
    SELECT COUNT(*) as count 
    FROM mps 
    WHERE first_name IS NOT NULL AND last_name IS NOT NULL
    LIMIT 1
  `);
  const hasNameColumns = await queryOne<{ count: number }>(hasNameColumnsSql, []);
  const hasNames = hasNameColumns && parseInt(hasNameColumns.count.toString(), 10) > 0;
  
  if (hasNames) {
    // Try exact matching by last_name and first_name first
    const sqlDirect = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(last_name) = $1 AND LOWER(first_name) = $2
      LIMIT 1
    `);
    let result = await queryOne<{ id: number }>(sqlDirect, [lastName, firstName]);
    
    if (result) {
      return result.id;
    }
    
    // Try LIKE matching with normalized names (handles hyphens like "Mary-Jane" vs "Mary Jane")
    // Replace hyphens with spaces and normalize multiple spaces
    const firstNameNormalized = firstName.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const lastNameNormalized = lastName.replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    
    const sqlLike = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(REPLACE(REPLACE(last_name, '-', ' '), '  ', ' ')) LIKE LOWER($1) 
        AND LOWER(REPLACE(REPLACE(first_name, '-', ' '), '  ', ' ')) LIKE LOWER($2)
      LIMIT 1
    `);
    result = await queryOne<{ id: number }>(sqlLike, [`%${lastNameNormalized}%`, `%${firstNameNormalized}%`]);
    
    if (result) {
      return result.id;
    }
    
    // Try matching last name exactly and first name with LIKE (handles variations in first name)
    const sqlLastNameExact = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(last_name) = $1 
        AND LOWER(REPLACE(REPLACE(first_name, '-', ' '), '  ', ' ')) LIKE LOWER($2)
      LIMIT 1
    `);
    result = await queryOne<{ id: number }>(sqlLastNameExact, [lastName, `%${firstNameNormalized}%`]);
    
    if (result) {
      return result.id;
    }
    
    // Try matching first name exactly and last name with LIKE
    const sqlFirstNameExact = convertPlaceholders(`
      SELECT id FROM mps 
      WHERE LOWER(REPLACE(REPLACE(last_name, '-', ' '), '  ', ' ')) LIKE LOWER($1)
        AND LOWER(first_name) = $2
      LIMIT 1
    `);
    result = await queryOne<{ id: number }>(sqlFirstNameExact, [`%${lastNameNormalized}%`, firstName]);
    
    if (result) {
      return result.id;
    }
  }
  
  // Fallback: convert to name format and try name matching (handles honorifics and cases where first_name/last_name aren't populated)
  const name = slugToName(politicianUrl);
  return await getMPIdByName(name);
}

/**
 * Fetch bill details and get vote_urls array
 */
async function fetchBillDetails(billNumber: string, billUrl: string | undefined): Promise<BillDetails | null> {
  // Try to construct bill URL if not provided
  let searchUrl = billUrl;
  if (!searchUrl && billNumber) {
    // Try to find bill URL from database
    const billSql = convertPlaceholders(`
      SELECT session 
      FROM bills_motions 
      WHERE bill_number = $1 
      LIMIT 1
    `);
    const billRow = await queryOne<{ session: string | null }>(billSql, [billNumber]);
    if (billRow?.session) {
      // Construct bill URL: /bills/{session}/{bill_number}/
      searchUrl = `/bills/${billRow.session}/${billNumber}/`;
    }
  }

  if (!searchUrl) {
    // No bill URL found
    return null;
  }

  try {
    const response = await axios.get<BillDetails>(`${OPENPARLIAMENT_API_BASE}${searchUrl}`, {
      httpsAgent,
      timeout: 30000, // Increased timeout
    });
    // Delay after bill details fetch
    await new Promise(resolve => setTimeout(resolve, 1500));
    return response.data;
  } catch (error: any) {
    // Error fetching bill details
    return null;
  }
}

/**
 * Fetch vote details for a single vote URL
 */
async function fetchVoteDetails(voteUrl: string): Promise<VoteDetails | null> {
  try {
    const voteResponse = await axios.get<VoteDetails>(`${OPENPARLIAMENT_API_BASE}${voteUrl}`, {
      httpsAgent,
      timeout: 30000, // Increased timeout
    });
    // Delay after vote details fetch
    await new Promise(resolve => setTimeout(resolve, 1500));
    return voteResponse.data;
  } catch (error: any) {
    // Error fetching vote details
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

  // Construct full URL if needed
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
            timeout: 30000, // Increased timeout
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
        continue; // Retry
        } else if (error.response?.status === 404) {
          hasMoreBallots = false;
        } else {
          // Error fetching ballots
          hasMoreBallots = false;
        }
      }
    }

  return ballots;
}


/**
 * Get sponsor party from bill
 */
async function getSponsorPartyFromBill(billId: number): Promise<string | undefined> {
  const sql = convertPlaceholders(`
    SELECT sponsor_politician 
    FROM bills_motions 
    WHERE id = $1
  `);
  const bill = await queryOne<{ sponsor_politician: string | null }>(sql, [billId]);
  
  if (bill?.sponsor_politician) {
    // Get party from MP table
    const mpSql = convertPlaceholders(`
      SELECT party_name 
      FROM mps 
      WHERE name = $1 
      LIMIT 1
    `);
    const mp = await queryOne<{ party_name: string | null }>(mpSql, [bill.sponsor_politician]);
    return mp?.party_name || undefined;
  }
  
  return undefined;
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
 * Sync votes for all bills in database
 */
async function syncVotesFromBills() {
  // Get current session number to filter votes
  const currentSession = await getCurrentSession();
  const currentSessionNumber = currentSession?.session_number || null;
  
  if (!currentSessionNumber) {
    console.error('❌ No current session found. Cannot sync votes.');
    console.error('   Please set is_current = true for a session in the sessions table.');
    await closeDatabase();
    process.exit(1);
  }

  // Get all bills from database (or filter to specific bill for testing)
  const testBillNumber = process.env.TEST_BILL || null; // Set TEST_BILL=C-18 to test a specific bill
  const billsSql = convertPlaceholders(`
    SELECT 
      id,
      bill_number,
      session,
      legisinfo_id
    FROM bills_motions
    WHERE bill_number IS NOT NULL
      ${testBillNumber ? 'AND bill_number = $1' : ''}
    ORDER BY introduced_date DESC
  `);
  const bills = await queryAll<{
    id: number;
    bill_number: string;
    session: string | null;
    legisinfo_id: number | null;
  }>(billsSql, testBillNumber ? [testBillNumber] : []);

  let totalVotesProcessed = 0;
  let totalVotesSaved = 0;
  let totalErrors = 0;
  let billsWithVotes = 0;
  let billsWithoutVotes = 0;
  let totalBallotsProcessed = 0;
  let totalMPsFound = 0;
  let totalMPsNotFound = 0;

  const batchSize = 5; // Process bills in small batches to avoid rate limiting

  for (let i = 0; i < bills.length; i += batchSize) {
    const batch = bills.slice(i, i + batchSize);

    for (const bill of batch) {
      try {
        console.log(`Processing ${bill.bill_number}`);

        // Construct bill URL
        const billUrl = bill.session ? `/bills/${bill.session}/${bill.bill_number}/` : null;

        // Step 1: Fetch bill details to get vote_urls
        const billDetails = await fetchBillDetails(bill.bill_number, billUrl || undefined);
        
        if (!billDetails) {
          // Debug: Log why bill details weren't fetched
          console.log(`DEBUG: Could not fetch bill details for ${bill.bill_number}`);
          billsWithoutVotes++;
          continue;
        }

        const voteUrls = billDetails.vote_urls || [];
        
        if (voteUrls.length === 0) {
          // Debug: Log if vote_urls is empty
          console.log(`DEBUG: No vote_urls found for ${bill.bill_number}. Bill details keys: ${Object.keys(billDetails).join(', ')}`);
          billsWithoutVotes++;
          continue;
        }

        // Filter to current session
        const validVoteUrls = currentSessionNumber
          ? voteUrls.filter(url => url.startsWith(`/votes/${currentSessionNumber}-`))
          : voteUrls;

        if (validVoteUrls.length === 0) {
          // Debug: Log if all votes were filtered out
          console.log(`DEBUG: All ${voteUrls.length} vote URLs filtered out for ${bill.bill_number} (current session: ${currentSessionNumber})`);
          console.log(`DEBUG: Sample vote URLs: ${voteUrls.slice(0, 3).join(', ')}`);
          billsWithoutVotes++;
          continue;
        }

        console.log(`Found the following vote urls ${validVoteUrls.join(', ')}`);

        // Get sponsor party from bill (once, reuse for all votes)
        const sponsorParty = await getSponsorPartyFromBill(bill.id);

        // Step 2: Process each vote URL sequentially (one at a time)
        let billVotesSaved = 0;
        let billVotesProcessed = 0;

        for (let voteIdx = 0; voteIdx < validVoteUrls.length; voteIdx++) {
          const voteUrl = validVoteUrls[voteIdx];
          
          // Check if we already have votes for this vote URL (vote round)
          // Each vote URL represents a voting round: /votes/{session}-{number}/{vote_round}/
          // We track by vote_id to prevent processing the same voting round twice
          // But a bill can have multiple voting rounds (multiple vote URLs)
          const existingVoteSql = convertPlaceholders(`
            SELECT COUNT(*) as count 
            FROM votes 
            WHERE vote_id = $1
          `);
          const existingVote = await queryOne<{ count: number }>(existingVoteSql, [voteUrl]);
          const existingVoteCount = parseInt(existingVote?.count?.toString() || '0', 10);
          
          if (existingVoteCount > 0) {
            // Skip this vote round - already processed
            // The ON CONFLICT constraint (vote_id, mp_id) will also prevent duplicates
            // but checking here avoids unnecessary API calls
            continue;
          }
          
          console.log(`Hitting ${voteUrl}`);
          
          try {
            // Step 3: Fetch vote details
            const voteDetails = await fetchVoteDetails(voteUrl);
            
            if (!voteDetails || !voteDetails.date) {
              continue;
            }

            // Step 4: Get ballots_url from vote details
            const ballotsUrl = voteDetails.related?.ballots_url;

            if (!ballotsUrl) {
              continue;
            }

            console.log(`Found ${ballotsUrl}`);

            // Step 5: Fetch ballots
            console.log(`Processing`);
            const ballots = await fetchBallots(ballotsUrl);
            
            if (ballots.length === 0) {
              console.log(`0 amount of MPs updated`);
              console.log(`Processed`);
              continue;
            }

            // Debug: Show first ballot to see structure
            if (ballots.length > 0) {
              console.log(`DEBUG: Found ${ballots.length} ballots. First ballot:`, JSON.stringify(ballots[0]));
            }

            // Extract parliament and session from vote URL
            const sessionMatch = voteUrl.match(/\/votes\/(\d+)-(\d+)\//);
            const parliamentNumber = sessionMatch ? parseInt(sessionMatch[1], 10) : null;
            const sessionNumber = sessionMatch ? parseInt(sessionMatch[2], 10) : null;

            // Process all ballots for this vote and save immediately
            const votesToSave: Array<{ mpId: number; vote: Vote }> = [];
            let matchedCount = 0;
            let unmatchedCount = 0;

            for (const ballot of ballots) {
              totalBallotsProcessed++;
              
              // Try to find MP - prioritize politician_url since that's what's available
              let mpId: number | null = null;
              
              // Try politician_url first (this is the primary identifier from the API)
              if (ballot.politician_url) {
                mpId = await getMPIdByPoliticianUrl(ballot.politician_url);
                if (!mpId && unmatchedCount < 3) {
                  console.log(`DEBUG: Could not match politician_url: ${ballot.politician_url}`);
                }
              }
              
              // Fallback: try politician_name if URL didn't work and name is available
              if (!mpId && ballot.politician_name) {
                mpId = await getMPIdByName(ballot.politician_name);
                if (!mpId && unmatchedCount < 3) {
                  console.log(`DEBUG: Could not match politician_name: ${ballot.politician_name}`);
                }
              }
              
              if (!mpId) {
                totalMPsNotFound++;
                unmatchedCount++;
                continue;
              }
              
              matchedCount++;
              
              totalMPsFound++;

              // Get MP's party for party position calculation
              const mpPartySql = convertPlaceholders('SELECT party_name FROM mps WHERE id = $1');
              const mpPartyRow = await queryOne<{ party_name: string | null }>(mpPartySql, [mpId]);
              const mpParty = mpPartyRow?.party_name || null;

              // Determine party position
              const partyPosition = getPartyPosition(voteDetails, mpParty);

              // Create vote object
              const voteObj: Vote = {
                id: voteUrl,
                date: voteDetails.date,
                bill_id: bill.id, // We know the bill_id
                bill_number: bill.bill_number,
                bill_title: undefined, // Will be filled from bill master table via JOIN
                motion_title: voteDetails.description?.en || voteDetails.description || 'Motion',
                vote_type: mapBallotToVoteType(ballot.ballot),
                result: mapResultToVoteResult(voteDetails.result),
                party_position: partyPosition,
                sponsor_party: sponsorParty,
              };

              votesToSave.push({ mpId, vote: voteObj });
            }

            // Save all votes for this vote immediately (before moving to next vote)
            if (votesToSave.length > 0) {
              await transaction(async (client) => {
                const insertVoteSql = convertPlaceholders(`
                  INSERT INTO votes (
                    vote_id, mp_id, bill_id, date, bill_number, bill_title,
                    motion_title, vote_type, result, party_position, sponsor_party,
                    parliament_number, session_number, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
                  ON CONFLICT (vote_id, mp_id) DO UPDATE SET
                    bill_id = EXCLUDED.bill_id,
                    updated_at = CURRENT_TIMESTAMP
                `);

                for (const { mpId, vote } of votesToSave) {
                  try {
                    const result = await client.query(insertVoteSql, [
                      vote.id,
                      mpId,
                      bill.id, // Use the bill_id we already know
                      vote.date,
                      vote.bill_number || null,
                      vote.bill_title || null,
                      vote.motion_title || 'Motion',
                      vote.vote_type,
                      vote.result,
                      vote.party_position || null,
                      vote.sponsor_party || null,
                      parliamentNumber,
                      sessionNumber
                    ]);
                    
                    if (result.rowCount && result.rowCount > 0) {
                      billVotesSaved++;
                    }
                  } catch (error: any) {
                    // Skip duplicates (ON CONFLICT handles this, but log other errors)
                    if (!error.message?.includes('duplicate') && !error.code?.includes('23505')) {
                      totalErrors++;
                    }
                  }
                }
              });

              console.log(`${votesToSave.length} amount of MPs updated`);
              console.log(`Processed`);
              billVotesProcessed++;
            } else {
              // No MPs found - ballots were fetched but no matches
              console.log(`0 amount of MPs updated`);
              console.log(`Processed`);
            }

            // Delay between votes to avoid rate limiting (increased)
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error: any) {
            totalErrors++;
          }
        }

        if (billVotesSaved > 0) {
          totalVotesSaved += billVotesSaved;
          billsWithVotes++;
          totalVotesProcessed += validVoteUrls.length;
        }

        // Delay between bills (increased)
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        totalErrors++;
      }
    }

    // Delay between batches
    if (i + batchSize < bills.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await closeDatabase();
}

// Run the script
if (require.main === module) {
  syncVotesFromBills().catch(error => {
    process.exit(1);
  });
}

export { syncVotesFromBills };

