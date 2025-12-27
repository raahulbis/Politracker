import axios from 'axios';
import * as https from 'https';
import type { Vote, VotingRecord, Motion, MotionBreakdown } from '@/types';
import { cacheVoteDetails, getCachedVoteDetails, cacheMPVotes, getCachedMPVotes } from './openparliament-cache';
import { getDatabase } from '@/lib/db/database';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
// In production, always verify SSL certificates for security
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

/**
 * Convert MP name to OpenParliament slug
 * e.g., "Justin Trudeau" -> "justin-trudeau"
 */
function nameToSlug(name: string | null | undefined): string {
  if (!name) {
    console.warn('nameToSlug called with undefined/null name');
    return '';
  }
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-'); // Replace multiple hyphens with single
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
 * Handles variations like "Liberal", "Liberal Party of Canada", etc.
 */
function normalizePartyName(partyName: string | null | undefined): string {
  if (!partyName || typeof partyName !== 'string') {
    return '';
  }
  const normalized = partyName.toLowerCase().trim();
  
  // Map common party name variations
  if (normalized.includes('liberal')) return 'liberal';
  if (normalized.includes('conservative')) return 'conservative';
  if (normalized.includes('new democratic') || normalized.includes('ndp')) return 'ndp';
  if (normalized.includes('bloc') || normalized.includes('québécois')) return 'bloc';
  if (normalized.includes('green')) return 'green';
  
  return normalized;
}

/**
 * Fetch voting record for an MP from OpenParliament
 */
export async function getMPVotingRecord(mpName: string, limit: number = 500): Promise<VotingRecord> {
  try {
    // Validate mpName
    if (!mpName || typeof mpName !== 'string' || mpName.trim().length === 0) {
      console.error(`[OpenParliament] Invalid MP name provided: ${mpName}`);
      return {
        mp_id: '',
        mp_name: mpName || 'Unknown',
        total_votes: 0,
        votes: [],
      };
    }

    const slug = nameToSlug(mpName);
    
    if (!slug) {
      console.error(`[OpenParliament] Could not generate slug for MP name: "${mpName}"`);
      return {
        mp_id: '',
        mp_name: mpName,
        total_votes: 0,
        votes: [],
      };
    }
    
    console.log(`[OpenParliament] Fetching votes for MP: "${mpName}" -> slug: "${slug}"`);
    
    // Fetch ballots (individual votes) for the MP
    let allBallots: any[] = [];
    let offset = 0;
    const batchSize = 100;

    while (offset < limit) {
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      let response: any = null;
      
      while (!success && retryCount < maxRetries) {
        try {
          const apiUrl = `${OPENPARLIAMENT_API_BASE}/votes/ballots/`;
          const params = {
            politician: slug,
            limit: Math.min(batchSize, limit - offset),
            offset,
          };
          console.log(`[OpenParliament] API call: ${apiUrl}?politician=${slug}&limit=${params.limit}&offset=${offset}`);
          
          response = await axios.get(apiUrl, {
            httpsAgent,
            params,
            timeout: 20000,
          });
          success = true;
          
          console.log(`[OpenParliament] API response status: ${response.status}, ballots returned: ${response.data?.objects?.length || 0}`);
        } catch (error: any) {
          if (error.response?.status === 429) {
            // Rate limited - exponential backoff
            retryCount++;
            const backoffDelay = Math.min(2000 * Math.pow(2, retryCount), 60000); // Max 60 seconds
            console.warn(`Rate limited (429) fetching ballots for ${mpName}. Waiting ${backoffDelay/1000}s before retry ${retryCount}/${maxRetries}...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else if (error.response?.status === 404) {
            // 404 means the politician slug doesn't exist
            console.warn(`[OpenParliament] Politician "${slug}" not found (404) for MP "${mpName}". The name might not match OpenParliament's records.`);
            // Return empty record instead of throwing
            return {
              mp_id: slug,
              mp_name: mpName,
              total_votes: 0,
              votes: [],
            };
          } else {
            // Log other errors before throwing
            console.error(`[OpenParliament] Error fetching ballots for ${mpName} (slug: ${slug}):`, {
              status: error.response?.status,
              statusText: error.response?.statusText,
              message: error.message,
              url: error.config?.url,
            });
            // Other error - throw it
            throw error;
          }
        }
      }
      
      if (!response) {
        console.error(`Failed to fetch ballots for ${mpName} after ${maxRetries} retries`);
        break;
      }

      const ballots = response.data.objects || [];
      console.log(`[OpenParliament] Retrieved ${ballots.length} ballots for ${mpName} (offset: ${offset})`);
      
      if (ballots.length === 0) {
        console.log(`[OpenParliament] No more ballots found for ${mpName} at offset ${offset}`);
        break;
      }

      allBallots.push(...ballots);
      offset += ballots.length;

      // Check if there's more data
      if (!response.data.pagination?.next_url || offset >= limit) break;
      
      // Delay between ballot fetches to avoid rate limiting (increased to 1 second)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Fetch vote details for each ballot to get full information
    // Use a cache to avoid fetching the same vote multiple times
    const voteDetailsCache = new Map<string, any>();
    const uniqueVoteUrls = new Set<string>();
    
    // Collect unique vote URLs
    allBallots.forEach(ballot => {
      uniqueVoteUrls.add(ballot.vote_url);
    });

    // Fetch vote details one at a time - check cache first to minimize API calls
    const voteUrlArray = Array.from(uniqueVoteUrls).slice(0, limit);
    
    // Check cache first for all vote URLs
    const uncachedVoteUrls: string[] = [];
    for (const voteUrl of voteUrlArray) {
      const cached = getCachedVoteDetails(voteUrl);
      if (cached) {
        voteDetailsCache.set(voteUrl, cached);
      } else {
        uncachedVoteUrls.push(voteUrl);
      }
    }

    console.log(`Using ${voteUrlArray.length - uncachedVoteUrls.length} cached vote details, fetching ${uncachedVoteUrls.length} new ones`);
    
    // Fetch vote details one at a time with retry logic for timeouts and rate limits
    for (let i = 0; i < uncachedVoteUrls.length; i++) {
      const voteUrl = uncachedVoteUrls[i];
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      
      while (!success && retryCount < maxRetries) {
        try {
          const voteResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${voteUrl}`, {
            httpsAgent,
            timeout: 20000,
          });
          const voteData = voteResponse.data;
          voteDetailsCache.set(voteUrl, voteData);
          // Cache the vote details for future use
          cacheVoteDetails(voteUrl, voteData);
          success = true;
        } catch (error: any) {
          const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
          const isRateLimit = error.response?.status === 429;
          
          if (isTimeout || isRateLimit) {
            // Retry on timeout or rate limit
            retryCount++;
            const backoffDelay = Math.min(2000 * Math.pow(2, retryCount - 1), 30000); // Max 30 seconds
            if (isTimeout) {
              console.warn(`Timeout fetching ${voteUrl}. Retrying (${retryCount}/${maxRetries}) after ${backoffDelay/1000}s...`);
            } else {
              console.warn(`Rate limited (429) for ${voteUrl}. Waiting ${backoffDelay/1000}s before retry ${retryCount}/${maxRetries}...`);
            }
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
          } else {
            // Other error - log and skip
            console.error(`Error fetching vote details for ${voteUrl}:`, error.message);
            success = true; // Move on to next vote
          }
        }
      }
      
      if (!success) {
        console.error(`Failed to fetch vote details for ${voteUrl} after ${maxRetries} retries`);
      }
      
      // Delay between requests to avoid rate limiting and reduce load (increased to 1 second)
      if (i < uncachedVoteUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between requests
      }
    }

    // Map ballots to votes using cached vote details
    // Get MP's party from database instead of API (we already have it stored)
    // This avoids an extra API call
    const { queryOne, convertPlaceholders } = await import('@/lib/db/database');
    const sql = convertPlaceholders('SELECT id, party_name FROM mps WHERE name = $1 LIMIT 1');
    const dbMPInfo = await queryOne<{ id: number; party_name: string | null }>(sql, [mpName]);
    let mpParty: string | null = dbMPInfo?.party_name || null;

    const votes: Vote[] = [];
    for (const ballot of allBallots.slice(0, limit)) {
      const voteData = voteDetailsCache.get(ballot.vote_url);
      
      if (voteData) {
        const billNumber = voteData.bill_url 
          ? voteData.bill_url.match(/\/([CS]-\d+)\//)?.[1] 
          : undefined;

        // Fetch sponsor party and bill data if we have a bill URL
        // We'll reuse this bill data later if we need to get the date
        let sponsorParty: string | undefined = undefined;
        let billData: any = null;
        if (voteData.bill_url) {
          try {
            // Check cache first for bill details
            const cachedBill = await getCachedVoteDetails(voteData.bill_url);
            billData = cachedBill;
            
            if (!billData) {
              // Fetch bill details to get sponsor and date
              const billResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${voteData.bill_url}`, {
                httpsAgent,
                timeout: 10000,
              });
              billData = billResponse.data;
              // Cache the bill data
              await cacheVoteDetails(voteData.bill_url, billData);
            }
            
            // Get sponsor's party from bill data
            if (billData?.sponsor_politician_membership_url) {
              try {
                const membershipResponse = await axios.get(
                  `${OPENPARLIAMENT_API_BASE}${billData.sponsor_politician_membership_url}`,
                  { httpsAgent, timeout: 10000 }
                );
                sponsorParty = membershipResponse.data.party?.short_name?.en || 
                              membershipResponse.data.party?.name?.en;
              } catch (error) {
                // Silently fail - sponsor party will remain undefined
              }
            }
          } catch (error) {
            // Silently fail - sponsor party will remain undefined
            // This avoids slowing down vote fetching if bill details can't be retrieved
          }
        }

        // Determine party position from party_votes array
        // party_position should indicate the party's position on the motion (For/Against)
        // The getPartyLoyaltyStats function will then compare MP's vote with party position
        let partyPosition: 'For' | 'Against' | 'Free Vote' | undefined = undefined;
        if (mpParty && voteData.party_votes && Array.isArray(voteData.party_votes)) {
          const normalizedMpParty = normalizePartyName(mpParty);
          
          // Only proceed if we have a valid normalized party name
          if (normalizedMpParty) {
            // Try to find the party vote - check multiple variations
            let partyVote = voteData.party_votes.find((pv: any) => {
              if (!pv || !pv.party) return false;
              const partyShortName = pv.party?.short_name?.en || pv.party?.short_name || '';
              const partyFullName = pv.party?.name?.en || pv.party?.name || '';
              const normalizedShort = normalizePartyName(partyShortName);
              const normalizedFull = normalizePartyName(partyFullName);
              
              // Only do string operations if we have valid normalized strings
              if (!normalizedShort && !normalizedFull) return false;
              
              return normalizedShort === normalizedMpParty ||
                     normalizedFull === normalizedMpParty ||
                     // Additional checks for common variations (only if strings are non-empty)
                     (normalizedMpParty && normalizedMpParty.includes('green') && (normalizedShort?.includes('green') || normalizedFull?.includes('green'))) ||
                     (normalizedMpParty && normalizedMpParty.includes('liberal') && (normalizedShort?.includes('liberal') || normalizedFull?.includes('liberal'))) ||
                     (normalizedMpParty && normalizedMpParty.includes('conservative') && (normalizedShort?.includes('conservative') || normalizedFull?.includes('conservative'))) ||
                     (normalizedMpParty && normalizedMpParty.includes('ndp') && (normalizedShort?.includes('ndp') || normalizedShort?.includes('new democratic') || normalizedFull?.includes('ndp') || normalizedFull?.includes('new democratic'))) ||
                     (normalizedMpParty && normalizedMpParty.includes('bloc') && (normalizedShort?.includes('bloc') || normalizedFull?.includes('bloc')));
            });
            
            if (partyVote) {
            // party_position represents the party's position on the motion
            // "For" means party voted Yes/Yea, "Against" means party voted No/Nay
            // Note: For small parties (like Green Party with 1-2 MPs), the party vote
            // might always match the MP's vote, but we still record it correctly
            
            // Normalize the vote value to handle all variations (case-insensitive)
            const normalizedVote = (partyVote.vote || '').toLowerCase().trim();
            
            // Check for all affirmative vote variations: yes, yea, yay
            if (normalizedVote === 'yes' || normalizedVote === 'yea' || normalizedVote === 'yay') {
              partyPosition = 'For';
            } 
            // Check for all negative vote variations: no, nay
            else if (normalizedVote === 'no' || normalizedVote === 'nay') {
              partyPosition = 'Against';
            } 
            // If party vote is unclear (e.g., "Paired", "Abstained", empty), treat as free vote
            else {
              partyPosition = 'Free Vote';
            }
            
            // Additional validation: Check if party vote seems inconsistent
            // For small parties, if yea + nay = 1, the party position might just reflect the single MP
            const totalPartyVotes = (partyVote.yea || 0) + (partyVote.nay || 0);
            if (totalPartyVotes === 1 && process.env.NODE_ENV === 'development') {
              // This is likely a single-MP party, so party position will always match MP vote
              // This is expected behavior but worth noting
            }
          } else {
            // Party not found in party_votes - this could mean:
            // 1. It's a free vote (no party position)
            // 2. The party name doesn't match
            // 3. The party didn't vote (very rare)
            // For now, mark as free vote but log for debugging
            if (process.env.NODE_ENV === 'development' && voteData.party_votes.length > 0) {
              const availableParties = voteData.party_votes.map((pv: any) => 
                pv.party?.short_name?.en || pv.party?.name?.en || 'Unknown'
              ).join(', ');
              console.log(`[DEBUG] Party "${mpParty}" not found in party_votes. Available: ${availableParties}`);
            }
            partyPosition = 'Free Vote';
          }
          } else {
            // normalizedMpParty is empty - treat as free vote
            partyPosition = 'Free Vote';
          }
        } else if (!voteData.party_votes || !Array.isArray(voteData.party_votes) || voteData.party_votes.length === 0) {
          // No party votes data available - treat as free vote
          partyPosition = 'Free Vote';
        }

        // Get vote date - check multiple possible fields in voteData
        let voteDate = voteData.date || 
                      voteData.vote_date || 
                      voteData.time || 
                      voteData.timestamp ||
                      voteData.created ||
                      null;
        
        // If date is missing, try to get it from the bill data we already fetched
        if ((!voteDate || typeof voteDate !== 'string' || voteDate.trim().length === 0) && billData) {
          // Try to get date from bill - check various date fields
          voteDate = billData?.introduced || 
                    billData?.introduced_date || 
                    billData?.date ||
                    billData?.first_reading?.date ||
                    null;
          
          if (voteDate) {
            console.log(`Using bill date for vote ${ballot.vote_url}: ${voteDate}`);
          }
        }
        
        // If still no date and we have a bill number, check database
        if ((!voteDate || typeof voteDate !== 'string' || voteDate.trim().length === 0) && billNumber) {
          try {
            const { queryOne, convertPlaceholders } = await import('@/lib/db/database');
            const billDateSql = convertPlaceholders(`
              SELECT introduced_date 
              FROM bills_motions 
              WHERE bill_number = $1 
              LIMIT 1
            `);
            const billRow = await queryOne<{ introduced_date: string | null }>(billDateSql, [billNumber]);
            if (billRow?.introduced_date) {
              voteDate = billRow.introduced_date;
              console.log(`Using database bill date for vote ${ballot.vote_url}: ${voteDate}`);
            }
          } catch (error) {
            // Silently fail
          }
        }
        
        // Last resort: Try to extract date from vote URL or use session start date
        if (!voteDate || typeof voteDate !== 'string' || voteDate.trim().length === 0) {
          try {
            // Extract session from vote URL (e.g., /votes/45-1/1/ -> session 45-1)
            const sessionMatch = ballot.vote_url.match(/\/votes\/(\d+)-(\d+)\//);
            if (sessionMatch) {
              const parliamentNumber = parseInt(sessionMatch[1], 10);
              const sessionNumber = parseInt(sessionMatch[2], 10);
              
              // Try to get session start date from database
              const { queryOne, convertPlaceholders } = await import('@/lib/db/database');
              const sessionDateSql = convertPlaceholders(`
                SELECT start_date 
                FROM sessions 
                WHERE session_number = $1 
                ORDER BY start_date DESC
                LIMIT 1
              `);
              const sessionRow = await queryOne<{ start_date: string | null }>(sessionDateSql, [sessionNumber]);
              if (sessionRow?.start_date) {
                voteDate = sessionRow.start_date;
                console.log(`Using session start date for vote ${ballot.vote_url}: ${voteDate}`);
              }
            }
          } catch (error) {
            // Silently fail
          }
        }
        
        // Only add vote if we have a valid date (required by database)
        if (voteDate && typeof voteDate === 'string' && voteDate.trim().length > 0) {
          votes.push({
            id: ballot.vote_url,
            date: voteDate,
            bill_number: billNumber,
            bill_title: billNumber ? `${billNumber}` : undefined,
            motion_title: voteData.description?.en || voteData.description || 'Motion',
            vote_type: mapBallotToVoteType(ballot.ballot),
            result: mapResultToVoteResult(voteData.result),
            party_position: partyPosition,
            sponsor_party: sponsorParty,
          });
        } else {
          // Log voteData structure for debugging
          console.warn(`Skipping vote ${ballot.vote_url} - could not determine date (bill: ${billNumber || 'none'})`);
          if (process.env.NODE_ENV === 'development') {
            console.warn(`  Vote data keys:`, Object.keys(voteData || {}));
            console.warn(`  Vote data sample:`, JSON.stringify(voteData).substring(0, 200));
          }
        }
      } else {
        // Fallback if vote details couldn't be fetched - skip it (can't save without date)
        console.warn(`Skipping vote ${ballot.vote_url} - vote details not available`);
      }
    }

    // Sort by date descending
    votes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    console.log(`[OpenParliament] Successfully processed ${votes.length} votes for ${mpName} (from ${allBallots.length} ballots)`);

    // Cache the votes for this MP (reuse dbMPInfo from above)
    if (dbMPInfo) {
      cacheMPVotes(dbMPInfo.id, votes);
    }

    return {
      mp_id: slug,
      mp_name: mpName,
      total_votes: votes.length,
      votes,
    };
  } catch (error: any) {
    console.error(`[OpenParliament] Error fetching voting record from OpenParliament for ${mpName}:`, error.message);
    if (error.response) {
      console.error(`[OpenParliament] Response status: ${error.response.status}, statusText: ${error.response.statusText}`);
      console.error(`[OpenParliament] Response data:`, error.response.data);
    }
    if (error.config) {
      console.error(`[OpenParliament] Request URL: ${error.config.url}`);
      console.error(`[OpenParliament] Request params:`, error.config.params);
    }
    // Return empty record on error
    return {
      mp_id: nameToSlug(mpName),
      mp_name: mpName,
      total_votes: 0,
      votes: [],
    };
  }
}

/**
 * Fetch bills/motions sponsored by an MP from OpenParliament
 */
export async function getMPMotions(mpName: string, limit: number = 100): Promise<MotionBreakdown> {
  try {
    // Validate mpName
    if (!mpName || typeof mpName !== 'string' || mpName.trim().length === 0) {
      console.error(`[OpenParliament] Invalid MP name provided for motions: ${mpName}`);
      return {
        mp_id: '',
        mp_name: mpName || 'Unknown',
        total_motions: 0,
        bills_sponsored: 0,
        bills_co_sponsored: 0,
        motions_sponsored: 0,
        motions_co_sponsored: 0,
        motions: [],
      };
    }

    const slug = nameToSlug(mpName);
    
    if (!slug) {
      console.error(`[OpenParliament] Could not generate slug for MP name (motions): "${mpName}"`);
      return {
        mp_id: '',
        mp_name: mpName,
        total_motions: 0,
        bills_sponsored: 0,
        bills_co_sponsored: 0,
        motions_sponsored: 0,
        motions_co_sponsored: 0,
        motions: [],
      };
    }
    
    console.log(`[OpenParliament] Fetching motions for MP: "${mpName}" -> slug: "${slug}"`);
    
    // Fetch sponsored bills
    let allBills: any[] = [];
    let offset = 0;
    const batchSize = 50;

    while (offset < limit) {
      const response = await axios.get(`${OPENPARLIAMENT_API_BASE}/bills/`, {
        httpsAgent,
        params: {
          sponsor_politician: slug,
          limit: Math.min(batchSize, limit - offset),
          offset,
        },
        timeout: 15000,
      });

      const bills = response.data.objects || [];
      if (bills.length === 0) break;

      allBills.push(...bills);
      offset += bills.length;

      if (!response.data.pagination?.next_url || offset >= limit) break;
    }

    // Convert to Motion format
    // Fetch bill details including sponsor party information
    const motions: Motion[] = await Promise.all(
      allBills.map(async (bill) => {
        try {
          // Fetch full bill details for status and other info
          const billResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${bill.url}`, {
            httpsAgent,
            timeout: 10000,
          });

          const billData = billResponse.data;
          
          // Fetch sponsor's membership to get their party
          let sponsorParty: string | undefined;
          if (billData.sponsor_politician_membership_url) {
            try {
              const membershipResponse = await axios.get(
                `${OPENPARLIAMENT_API_BASE}${billData.sponsor_politician_membership_url}`,
                { httpsAgent, timeout: 10000 }
              );
              sponsorParty = membershipResponse.data.party?.short_name?.en || 
                            membershipResponse.data.party?.name?.en;
            } catch (error) {
              console.error(`Error fetching sponsor membership for ${bill.url}:`, error);
            }
          }
          
          return {
            id: bill.url,
            number: bill.number || '',
            title: bill.name?.en || bill.name || bill.short_title?.en || 'Untitled',
            type: 'Bill' as const,
            status: billData.status?.en || billData.status_code || 'Unknown',
            introduced_date: bill.introduced || '',
            sponsor_type: 'Sponsor' as const,
            description: sponsorParty 
              ? `${bill.name?.en || bill.short_title?.en || 'Untitled'} (Sponsored by ${sponsorParty})`
              : bill.name?.en || bill.short_title?.en,
            sponsor_party: sponsorParty, // Store sponsor party separately
            url: `https://openparliament.ca${bill.url}`,
          };
        } catch (error) {
          console.error(`Error fetching bill details for ${bill.url}:`, error);
          return {
            id: bill.url,
            number: bill.number || '',
            title: bill.name?.en || bill.name || 'Untitled',
            type: 'Bill' as const,
            status: 'Unknown',
            introduced_date: bill.introduced || '',
            sponsor_type: 'Sponsor' as const,
            sponsor_party: undefined, // No party info available on error
            url: `https://openparliament.ca${bill.url}`,
          };
        }
      })
    );

    // Count bills sponsored (all are sponsors since we filtered by sponsor_politician)
    const billsSponsored = motions.length;
    const billsCoSponsored = 0; // OpenParliament API doesn't distinguish co-sponsors easily
    const motionsSponsored = 0; // We're only fetching bills, not motions
    const motionsCoSponsored = 0;

    return {
      mp_id: slug,
      mp_name: mpName,
      total_motions: motions.length,
      bills_sponsored: billsSponsored,
      bills_co_sponsored: billsCoSponsored,
      motions_sponsored: motionsSponsored,
      motions_co_sponsored: motionsCoSponsored,
      motions,
    };
  } catch (error: any) {
    console.error('Error fetching motions from OpenParliament:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
    return {
      mp_id: nameToSlug(mpName),
      mp_name: mpName,
      total_motions: 0,
      bills_sponsored: 0,
      bills_co_sponsored: 0,
      motions_sponsored: 0,
      motions_co_sponsored: 0,
      motions: [],
    };
  }
}

