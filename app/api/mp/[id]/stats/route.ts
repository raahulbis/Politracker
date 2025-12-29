import { NextRequest, NextResponse } from 'next/server';
import { getMPByDistrict, getMPVotingRecord } from '@/lib/db/queries';
import { getPartyLoyaltyStats, getMPMotions } from '@/lib/api/commons';
import { getCachedPartyLoyaltyStats, cachePartyLoyaltyStats } from '@/lib/api/openparliament-cache';
import { queryOne, convertPlaceholders } from '@/lib/db/database';
import { getCurrentSessionStartDate } from '@/lib/db/sessions';
import type { VotingRecord, MotionBreakdown } from '@/types';

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

    const mpIdentifier = mp.district_id || mp.district_name || mp.name;
    // Try to find MP by name first, then by name and district if that fails
    let dbMPSql = convertPlaceholders('SELECT id FROM mps WHERE name = $1 LIMIT 1');
    let dbMP = await queryOne<{ id: number }>(dbMPSql, [mp.name]);
    
    // If not found by name alone, try with district name
    if (!dbMP && mp.district_name) {
      dbMPSql = convertPlaceholders('SELECT id FROM mps WHERE name = $1 AND district_name = $2 LIMIT 1');
      dbMP = await queryOne<{ id: number }>(dbMPSql, [mp.name, mp.district_name]);
    }
    
    // Get votes from database only (no API calls)
    // Pass database ID directly to avoid unnecessary lookup
    let votingRecord = await getMPVotingRecord(mpIdentifier, mp.name, dbMP?.id);
    
    console.log(`Retrieved ${votingRecord.votes.length} votes from database for ${mp.name}`);
    
    // Fetch motions from OpenParliament
    // TODO: Add logic to only fetch new bills (similar to votes)
    // For now, always fetch latest and save to DB
    let allMotions: MotionBreakdown;
    try {
      console.log(`Fetching motions/bills from OpenParliament for ${mp.name}`);
      allMotions = await getMPMotions(mpIdentifier, mp.name);
      console.log(`Retrieved ${allMotions.motions.length} motions/bills from OpenParliament for ${mp.name}`);
    } catch (error) {
      console.error(`Error fetching motions from OpenParliament for ${mp.name}:`, error);
      if (error instanceof Error) {
        console.error(`Error details: ${error.message}`);
      }
      // Return empty motions on error
      allMotions = {
        mp_id: mpIdentifier,
        mp_name: mp.name,
        total_motions: 0,
        bills_sponsored: 0,
        bills_co_sponsored: 0,
        motions_sponsored: 0,
        motions_co_sponsored: 0,
        motions: [],
      };
    }
    
    // Filter motions to only include current session
    // If no session date is available, show all motions instead of filtering them out
    const currentSessionStartDateForMotions = await getCurrentSessionStartDate();
    const motionsFromCurrentSession = allMotions.motions.filter((motion) => {
      if (!motion.introduced_date) return false;
      // If no session date, include all motions (don't filter)
      if (!currentSessionStartDateForMotions) return true;
      return motion.introduced_date >= currentSessionStartDateForMotions;
    });
    
    // Recalculate totals for filtered motions
    const motions: MotionBreakdown = {
      ...allMotions,
      motions: motionsFromCurrentSession,
      total_motions: motionsFromCurrentSession.length,
      bills_sponsored: motionsFromCurrentSession.filter(m => m.type === 'Bill' && m.sponsor_type === 'Sponsor').length,
      bills_co_sponsored: motionsFromCurrentSession.filter(m => m.type === 'Bill' && (m.sponsor_type === 'Co-sponsor' || m.sponsor_type === 'Seconder')).length,
      motions_sponsored: motionsFromCurrentSession.filter(m => m.type === 'Motion' && m.sponsor_type === 'Sponsor').length,
      motions_co_sponsored: motionsFromCurrentSession.filter(m => m.type === 'Motion' && (m.sponsor_type === 'Co-sponsor' || m.sponsor_type === 'Seconder')).length,
    };
    
    // Add category information to motions from database
    if (motions.motions.length > 0) {
      const { getBillCategoryNames } = await import('@/lib/db/get-bill-category');
      const billNumbers = motions.motions
        .map(m => m.number)
        .filter((num): num is string => Boolean(num));
      
      if (billNumbers.length > 0) {
        const categoryMap = await getBillCategoryNames(billNumbers);
        
        // Add category to each motion
        motions.motions = motions.motions.map(motion => ({
          ...motion,
          category: motion.number ? categoryMap.get(motion.number) || undefined : undefined,
        }));
      }
    }
    
    // Save bills/motions to database (non-blocking, fire and forget)
    if (dbMP && motions.motions.length > 0) {
      import('@/lib/db/save-bills').then(({ saveBillsToDB }) => {
        saveBillsToDB(dbMP.id, motions.motions).catch(error => {
          console.error(`Error saving bills to DB for ${mp.name}:`, error);
        });
      });
    }

    // Add category information to votes
    console.log(`\n========== [MP Stats] Starting category processing for ${mp.name} ==========`);
    console.log(`[MP Stats] Total votes in record: ${votingRecord.votes.length}`);
    if (votingRecord.votes.length > 0) {
      console.log(`[MP Stats] First vote sample:`, {
        id: votingRecord.votes[0].id,
        bill_number: votingRecord.votes[0].bill_number,
        motion_title: votingRecord.votes[0].motion_title?.substring(0, 100),
      });
    }
    
    try {
      
      // Helper function to extract bill number from motion title if bill_number is missing
      const extractBillNumber = (vote: Vote): string | undefined => {
        if (vote.bill_number) {
          console.log(`[MP Stats] Vote has bill_number: ${vote.bill_number}`);
          return vote.bill_number;
        }
        // Try to extract from motion_title (e.g., "C-12, Bill C-12, ..." or "Bill C-12")
        // Match patterns like "C-12" or "S-12" at the start or after a comma/space
        const billMatch = vote.motion_title.match(/(?:^|[\s,]+)([CS]-\d+)(?:[\s,]|$)/i);
        if (billMatch) {
          console.log(`[MP Stats] Extracted bill number "${billMatch[1]}" from motion_title: "${vote.motion_title.substring(0, 80)}..."`);
          return billMatch[1];
        }
        console.log(`[MP Stats] Could not extract bill number from: "${vote.motion_title.substring(0, 80)}..."`);
        return undefined;
      };

      // Extract bill numbers from votes (from bill_number field or motion_title)
      const votesWithBillNumbers = votingRecord.votes.map(vote => ({
        ...vote,
        extracted_bill_number: extractBillNumber(vote),
      }));

      const allBillNumbers = votesWithBillNumbers.map(v => v.extracted_bill_number);
      const billNumbers = Array.from(
        new Set(
          allBillNumbers.filter((num): num is string => Boolean(num))
        )
      );

      console.log(`[MP Stats] Processing votes for ${mp.name}:`);
      console.log(`[MP Stats]   Total votes: ${votingRecord.votes.length}`);
      console.log(`[MP Stats]   Votes with bill_number field: ${votingRecord.votes.filter(v => v.bill_number).length}`);
      console.log(`[MP Stats]   Votes with extracted bill_number: ${allBillNumbers.filter(Boolean).length}`);
      console.log(`[MP Stats]   Unique bill numbers: ${billNumbers.length}`);
      if (billNumbers.length > 0) {
        console.log(`[MP Stats]   Bill numbers: ${billNumbers.slice(0, 10).join(', ')}${billNumbers.length > 10 ? '...' : ''}`);
      } else {
        console.log(`[MP Stats]   Sample motion titles:`, votingRecord.votes.slice(0, 3).map(v => v.motion_title));
      }

      if (billNumbers.length > 0) {
      const { getBillCategoryNames } = await import('@/lib/db/get-bill-category');
      const { ensureBillHasCategory } = await import('@/lib/db/categorize-bills');
      
      // First, try to get existing categories from database
      let categoryMap = await getBillCategoryNames(billNumbers);
      console.log(`[MP Stats] Found ${categoryMap.size} existing categories out of ${billNumbers.length} bills for ${mp.name}`);

      // Process votes to ensure categories exist for bills without them
      // For the first 20 votes (what's displayed), ensure categories exist
      const votesToProcess = votesWithBillNumbers.slice(0, 20);
      const billsNeedingCategories = votesToProcess
        .filter(v => v.extracted_bill_number && !categoryMap.has(v.extracted_bill_number))
        .map(v => v.extracted_bill_number!);
      
      if (billsNeedingCategories.length > 0) {
        console.log(`[MP Stats] Ensuring categories for ${billsNeedingCategories.length} bills for ${mp.name}`);
        
        const categoryPromises = billsNeedingCategories.map(async (billNumber) => {
          try {
            // Find the vote to get the title
            const vote = votesToProcess.find(v => v.extracted_bill_number === billNumber);
            if (!vote) return null;
            
            // Prefer motion_title as it has the full description, fallback to bill_title or billNumber
            // motion_title contains the full bill description which is better for categorization
            const titleForCategorization = vote.motion_title || vote.bill_title || billNumber;
            console.log(`[MP Stats] Categorizing ${billNumber} with title: "${titleForCategorization.substring(0, 100)}..."`);
            const category = await ensureBillHasCategory(billNumber, titleForCategorization);
            if (category) {
              console.log(`[MP Stats] Categorized ${billNumber} as "${category}" for ${mp.name}`);
              return { billNumber, category };
            }
            return null;
          } catch (error) {
            console.error(`[MP Stats] Error ensuring category for bill ${billNumber}:`, error);
            return null;
          }
        });

        // Wait for categories for displayed votes
        const results = await Promise.all(categoryPromises);
        results.forEach(result => {
          if (result) {
            categoryMap.set(result.billNumber, result.category);
          }
        });
      }

      // Re-fetch categories from database to get any newly categorized bills
      const updatedCategoryMap = await getBillCategoryNames(billNumbers);
      // Merge with any categories we just ensured
      updatedCategoryMap.forEach((cat, billNum) => categoryMap.set(billNum, cat));

      console.log(`[MP Stats] Final category map has ${categoryMap.size} categories for ${mp.name}`);

      // Add categories to all votes using extracted bill numbers
      votingRecord.votes = votingRecord.votes.map(vote => {
        const billNum = extractBillNumber(vote);
        const category = billNum ? categoryMap.get(billNum) : undefined;
        return {
          ...vote,
          category,
        };
      });
      
      const votesWithCategories = votingRecord.votes.filter(v => v.category).length;
      console.log(`[MP Stats] Added categories to ${votesWithCategories} votes for ${mp.name}`);
      } else {
        console.log(`[MP Stats] No bill numbers found for ${mp.name}, skipping category processing`);
      }
    } catch (error) {
      console.error(`[MP Stats] Error processing categories for ${mp.name}:`, error);
      // Continue without categories rather than failing the entire request
    }

    // Categorize bills that the MP has voted on (non-blocking, fire and forget)
    if (dbMP) {
      import('@/lib/db/categorize-bills').then(({ categorizeMPBills }) => {
        categorizeMPBills(dbMP.id).then(result => {
          console.log(`Bill categorization for ${mp.name}:`, result);
        }).catch(error => {
          console.error(`Error categorizing bills for ${mp.name}:`, error);
        });
      });
    }

    // Filter votes to current session to match the breakdown table
    // If no session date is available, show all votes instead of filtering them out
    const currentSessionStartDate = await getCurrentSessionStartDate();
    const votesFromCurrentSession = votingRecord.votes.filter((vote) => {
      if (!vote.date) return false;
      // If no session date, include all votes (don't filter)
      if (!currentSessionStartDate) return true;
      return vote.date >= currentSessionStartDate;
    });
    
    // Check cache for party loyalty stats
    let partyLoyalty;
    let cachedStats = null;
    
    if (dbMP) {
      cachedStats = await getCachedPartyLoyaltyStats(dbMP.id);
      // Check if cached stats match the filtered vote count (2025+)
      const cachedTotal = cachedStats 
        ? cachedStats.votes_with_party + cachedStats.votes_against_party + cachedStats.free_votes + (cachedStats.abstained_paired_votes || 0)
        : 0;
      if (cachedStats && cachedTotal === votesFromCurrentSession.length) {
        console.log(`Using cached party loyalty stats for ${mp.name}`);
        partyLoyalty = {
          mp_id: mpIdentifier,
          mp_name: mp.name,
          party_name: mp.party_name || 'Unknown',
          total_votes: votesFromCurrentSession.length,
          ...cachedStats,
          abstained_paired_votes: cachedStats.abstained_paired_votes || 0,
        };
      }
    }
    
    // If not cached or vote count mismatch, calculate party loyalty stats
    if (!partyLoyalty) {
      partyLoyalty = await getPartyLoyaltyStats(
        mpIdentifier,
        mp.name,
        mp.party_name || 'Unknown',
        votesFromCurrentSession
      );
      
      // Cache the calculated stats
      if (dbMP) {
        await cachePartyLoyaltyStats(dbMP.id, {
          votes_with_party: partyLoyalty.votes_with_party,
          votes_against_party: partyLoyalty.votes_against_party,
          free_votes: partyLoyalty.free_votes,
          abstained_paired_votes: partyLoyalty.abstained_paired_votes,
          loyalty_percentage: partyLoyalty.loyalty_percentage,
          opposition_percentage: partyLoyalty.opposition_percentage,
          free_vote_percentage: partyLoyalty.free_vote_percentage,
        });
      }
    }

    // Validate that all votes are categorized
    const categorizedVotes = partyLoyalty.votes_with_party + 
                             partyLoyalty.votes_against_party + 
                             partyLoyalty.free_votes +
                             partyLoyalty.abstained_paired_votes;
    const isValid = categorizedVotes === partyLoyalty.total_votes;

    // Filter votingRecord to only include votes from 2025 onwards (this session)
    votingRecord = {
      ...votingRecord,
      votes: votesFromCurrentSession,
      total_votes: votesFromCurrentSession.length,
    };

    // Debug: Log first few votes with categories
    const votesWithCategories = votingRecord.votes.filter(v => v.category).slice(0, 5);
    if (votesWithCategories.length > 0) {
      console.log(`[MP Stats] Sample votes with categories for ${mp.name}:`, 
        votesWithCategories.map(v => ({ bill: v.bill_number || 'extracted', category: v.category }))
      );
    }

    return NextResponse.json({
      votingRecord,
      partyLoyalty,
      motions,
      dataValid: isValid,
    });
  } catch (error) {
    console.error('Error fetching MP stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MP stats' },
      { status: 500 }
    );
  }
}

