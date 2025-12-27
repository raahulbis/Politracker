import axios from 'axios';
import * as https from 'https';
import { transaction, convertPlaceholders, queryAll, queryOne, closeDatabase } from '../lib/db/database';
import { cacheVoteDetails, getCachedVoteDetails } from '../lib/api/openparliament-cache';

const OPENPARLIAMENT_API_BASE = 'https://api.openparliament.ca';

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

/**
 * Get sponsor party from bill details
 */
async function getSponsorPartyFromBill(billNumber: string, session?: string): Promise<string | null> {
  try {
    // First, try to get sponsor_politician from database
    const billSql = convertPlaceholders(`
      SELECT sponsor_politician, sponsor_politician_membership, session
      FROM bills_motions 
      WHERE bill_number = $1
      ${session ? 'AND session = $2' : ''}
      LIMIT 1
    `);
    
    const billParams = session ? [billNumber, session] : [billNumber];
    const bill = await queryOne<{
      sponsor_politician: string | null;
      sponsor_politician_membership: string | null;
      session: string | null;
    }>(billSql, billParams);
    
    // Use session from database if available
    const billSession = bill?.session || session;
    
    if (bill?.sponsor_politician_membership) {
      // We have the membership URL in the database, fetch it
      try {
        const cachedMembership = getCachedVoteDetails(bill.sponsor_politician_membership);
        let membershipData = cachedMembership;
        
        if (!membershipData) {
          const membershipResponse = await axios.get(
            `${OPENPARLIAMENT_API_BASE}${bill.sponsor_politician_membership}`,
            { httpsAgent, timeout: 10000 }
          );
          membershipData = membershipResponse.data;
          cacheVoteDetails(bill.sponsor_politician_membership, membershipData);
        }
        
        const sponsorParty = membershipData?.party?.short_name?.en || 
                           membershipData?.party?.name?.en;
        if (sponsorParty) {
          return sponsorParty;
        }
      } catch (error) {
        console.warn(`Error fetching membership for ${bill.sponsor_politician_membership}:`, error);
      }
    }
    
    // If not in database, try to fetch from API using bill number
    // Try with session first, then without
    const sessionsToTry = billSession ? [billSession] : ['45-1', '44-1', '43-2', '43-1'];
    
    for (const trySession of sessionsToTry) {
      const billUrl = `/bills/${trySession}/${billNumber}/`;
      try {
        const cachedBill = getCachedVoteDetails(billUrl);
        let billData = cachedBill;
        
        if (!billData) {
          const billResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${billUrl}`, {
            httpsAgent,
            timeout: 15000,
          });
          billData = billResponse.data;
          cacheVoteDetails(billUrl, billData);
        }
        
        // Get sponsor's party from bill data
        if (billData?.sponsor_politician_membership_url) {
          try {
            const cachedMembership = getCachedVoteDetails(billData.sponsor_politician_membership_url);
            let membershipData = cachedMembership;
            
            if (!membershipData) {
              const membershipResponse = await axios.get(
                `${OPENPARLIAMENT_API_BASE}${billData.sponsor_politician_membership_url}`,
                { httpsAgent, timeout: 10000 }
              );
              membershipData = membershipResponse.data;
              cacheVoteDetails(billData.sponsor_politician_membership_url, membershipData);
            }
            
            const sponsorParty = membershipData?.party?.short_name?.en || 
                               membershipData?.party?.name?.en;
            if (sponsorParty) {
              return sponsorParty;
            }
          } catch (error) {
            // Continue to next session
            continue;
          }
        }
      } catch (error: any) {
        // If 404, try next session; otherwise continue
        if (error.response?.status === 404) {
          continue;
        }
        // For other errors, continue to next session
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.warn(`Error getting sponsor party for bill ${billNumber}:`, error);
    return null;
  }
}

/**
 * Backfill sponsor_party for votes
 */
async function backfillSponsorParty() {
  console.log('Starting sponsor_party backfill...\n');

  // Get current session start date
  const currentSessionStartDate = await getCurrentSessionStartDate();
  if (!currentSessionStartDate) {
    console.error('No current session found. Cannot backfill sponsor_party.');
    return;
  }

  // Get all votes that need sponsor_party (have bill_number but no sponsor_party)
  // Join with bills_motions to get sponsor_politician_membership directly
  const votesSql = convertPlaceholders(`
    SELECT DISTINCT v.vote_id, v.bill_number, b.session, b.sponsor_politician_membership, v.date
    FROM votes v
    LEFT JOIN bills_motions b ON v.bill_number = b.bill_number AND b.session IS NOT NULL
    WHERE v.bill_number IS NOT NULL 
      AND (v.sponsor_party IS NULL OR v.sponsor_party = '')
      AND v.date >= $1
    ORDER BY v.date DESC
    LIMIT 5000
  `);

  const votes = await queryAll<{
    vote_id: string;
    bill_number: string;
    session: string | null;
    sponsor_politician_membership: string | null;
  }>(votesSql, [currentSessionStartDate]);

  console.log(`Found ${votes.length} votes needing sponsor_party\n`);

  if (votes.length === 0) {
    console.log('No votes need sponsor_party backfill.');
    return;
  }

  // Group votes by vote_id to fetch sponsor party once per vote
  const votesByVoteId = new Map<string, Array<{ 
    bill_number: string; 
    session: string | null;
    sponsor_politician_membership: string | null;
  }>>();
  
  for (const vote of votes) {
    if (!votesByVoteId.has(vote.vote_id)) {
      votesByVoteId.set(vote.vote_id, []);
    }
    votesByVoteId.get(vote.vote_id)!.push({
      bill_number: vote.bill_number,
      session: vote.session,
      sponsor_politician_membership: vote.sponsor_politician_membership,
    });
  }

  console.log(`Processing ${votesByVoteId.size} unique votes...\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let processedVotes = 0;

  // Process votes in batches
  const voteIds = Array.from(votesByVoteId.keys());
  const batchSize = 10;

  for (let i = 0; i < voteIds.length; i += batchSize) {
    const batch = voteIds.slice(i, i + batchSize);

    await Promise.all(batch.map(async (voteId) => {
      try {
        const voteInfo = votesByVoteId.get(voteId)!;
        const billNumber = voteInfo[0].bill_number;
        const session = voteInfo[0].session;
        const membershipUrl = voteInfo[0].sponsor_politician_membership;

        // Get sponsor party - try multiple methods
        let sponsorParty: string | null = null;
        
        // Method 1: Use membership URL from database (fastest)
        if (membershipUrl) {
          try {
            if (processedVotes < 3) {
              console.log(`  Using membership URL from DB: ${membershipUrl} for bill ${billNumber}`);
            }
            // Always fetch fresh from API (cache might have empty objects)
            const membershipResponse = await axios.get(
              `${OPENPARLIAMENT_API_BASE}${membershipUrl}`,
              { httpsAgent, timeout: 10000 }
            );
            const membershipData = membershipResponse.data;
            
            // Cache it for future use
            cacheVoteDetails(membershipUrl, membershipData);
            
            if (processedVotes < 3) {
              console.log(`  Membership data keys:`, Object.keys(membershipData || {}));
              console.log(`  Membership data sample:`, JSON.stringify(membershipData, null, 2).substring(0, 800));
            }
            
            // Try different possible field names for party
            sponsorParty = membershipData?.party?.short_name?.en || 
                         membershipData?.party?.name?.en ||
                         membershipData?.party_name?.short_name?.en ||
                         membershipData?.party_name?.name?.en ||
                         membershipData?.party_name ||
                         (membershipData?.party && typeof membershipData.party === 'string' ? membershipData.party : null) ||
                         null;
            
            if (processedVotes < 3) {
              console.log(`  Found sponsor party: ${sponsorParty}`);
            }
          } catch (error: any) {
            if (processedVotes < 3) {
              console.log(`  Error fetching membership ${membershipUrl}:`, error.message);
            }
            // Continue to next method
          }
        } else if (processedVotes < 3) {
          console.log(`  No membership URL in DB for bill ${billNumber} (session: ${session})`);
        }
        
        // Method 2: Try to get from vote details (vote has bill_url)
        if (!sponsorParty) {
          try {
            const cachedVote = getCachedVoteDetails(voteId);
            let voteData = cachedVote;
            
            if (!voteData) {
              const voteResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${voteId}`, {
                httpsAgent,
                timeout: 15000,
              });
              voteData = voteResponse.data;
              cacheVoteDetails(voteId, voteData);
            }
            
            // Get bill_url from vote details
            let billUrl = voteData?.bill_url;
            
            // Method 3: If no bill_url in vote, construct it from session and bill number
            if (!billUrl && session && billNumber) {
              billUrl = `/bills/${session}/${billNumber}/`;
            }
            
            if (billUrl) {
              // Fetch bill details
              const cachedBill = getCachedVoteDetails(billUrl);
              let billData = cachedBill;
              
              if (!billData) {
                const billResponse = await axios.get(`${OPENPARLIAMENT_API_BASE}${billUrl}`, {
                  httpsAgent,
                  timeout: 15000,
                });
                billData = billResponse.data;
                cacheVoteDetails(billUrl, billData);
              }
              
              // Get sponsor's party from bill data
              if (billData?.sponsor_politician_membership_url) {
                const cachedMembership = getCachedVoteDetails(billData.sponsor_politician_membership_url);
                let membershipData = cachedMembership;
                
                if (!membershipData) {
                  const membershipResponse = await axios.get(
                    `${OPENPARLIAMENT_API_BASE}${billData.sponsor_politician_membership_url}`,
                    { httpsAgent, timeout: 10000 }
                  );
                  membershipData = membershipResponse.data;
                  cacheVoteDetails(billData.sponsor_politician_membership_url, membershipData);
                }
                
                sponsorParty = membershipData?.party?.short_name?.en || 
                             membershipData?.party?.name?.en || null;
              }
            }
          } catch (error: any) {
            // Continue to fallback method
          }
        }
        
        // Method 4: Fallback - try to get from database or API using bill number
        if (!sponsorParty) {
          sponsorParty = await getSponsorPartyFromBill(billNumber, session || undefined);
        }

        if (sponsorParty) {
          // Update all votes with this vote_id
          await transaction(async (client) => {
            const updateSql = convertPlaceholders(`
              UPDATE votes 
              SET sponsor_party = $1, updated_at = CURRENT_TIMESTAMP
              WHERE vote_id = $2
                AND (sponsor_party IS NULL OR sponsor_party = '')
            `);
            
            const result = await client.query(updateSql, [sponsorParty, voteId]);
            updated += result.rowCount || 0;
          });

          processedVotes++;
          
          if (processedVotes % 10 === 0) {
            console.log(`  Processed ${processedVotes}/${voteIds.length} votes... (${updated} votes updated)`);
          }
        } else {
          notFound += voteInfo.length;
          if (processedVotes < 5) {
            console.log(`  Could not find sponsor party for vote ${voteId} (bill: ${billNumber})`);
          }
        }
      } catch (error: any) {
        errors++;
        console.error(`Error processing vote ${voteId}:`, error.message);
      }
    }));

    // Delay between batches to avoid rate limiting
    if (i + batchSize < voteIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n✅ Sponsor party backfill complete!');
  console.log(`   - Votes updated: ${updated}`);
  console.log(`   - Votes not found: ${notFound}`);
  console.log(`   - Errors: ${errors}`);
}

/**
 * Main function
 */
async function main() {
  try {
    await backfillSponsorParty();
  } catch (error: any) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Run the script
main();

