import type { Vote, VotingRecord, Motion, MotionBreakdown, PartyLoyaltyStats } from '@/types';
import { getMPVotingRecord as getOpenParliamentVotes, getMPMotions as getOpenParliamentMotions } from './openparliament';

/**
 * Get voting record for an MP from OpenParliament API
 */
export async function getMPVotingRecord(mpId: string, mpName: string): Promise<VotingRecord> {
  // Use OpenParliament API to fetch votes
  return await getOpenParliamentVotes(mpName);
}

/**
 * Normalize party names for comparison
 */
function normalizePartyNameForComparison(partyName: string): string {
  return partyName.toLowerCase().trim();
}

/**
 * Check if two party names match (handles variations)
 */
function partiesMatch(party1: string | undefined, party2: string | undefined): boolean {
  if (!party1 || !party2) return false;
  
  const normalized1 = normalizePartyNameForComparison(party1);
  const normalized2 = normalizePartyNameForComparison(party2);
  
  // Exact match
  if (normalized1 === normalized2) return true;
  
  // Check for common variations
  const party1Lower = normalized1;
  const party2Lower = normalized2;
  
  // Liberal variations
  if ((party1Lower.includes('liberal') && party2Lower.includes('liberal')) ||
      (party1Lower === 'lib' && party2Lower.includes('liberal'))) return true;
  
  // Conservative variations
  if ((party1Lower.includes('conservative') && party2Lower.includes('conservative')) ||
      (party1Lower === 'cpc' && party2Lower.includes('conservative'))) return true;
  
  // NDP variations
  if ((party1Lower.includes('ndp') || party1Lower.includes('new democratic')) &&
      (party2Lower.includes('ndp') || party2Lower.includes('new democratic'))) return true;
  
  // Bloc variations
  if ((party1Lower.includes('bloc') || party1Lower.includes('quebecois')) &&
      (party2Lower.includes('bloc') || party2Lower.includes('quebecois'))) return true;
  
  // Green variations
  if (party1Lower.includes('green') && party2Lower.includes('green')) return true;
  
  return false;
}

/**
 * Normalize party name to one of the 5 major parties for filtering
 */
function normalizeToMajorParty(partyName: string | undefined): string | null {
  if (!partyName) return null;
  const lower = partyName.toLowerCase().trim();
  
  // Liberal variations
  if (lower.includes('liberal') || lower === 'lib' || lower === 'lpc') return 'Liberal';
  
  // Conservative variations
  if (lower.includes('conservative') || lower === 'cpc' || lower === 'con' || lower === 'pc') return 'Conservative';
  
  // Bloc Québécois variations
  if (lower.includes('bloc') || lower.includes('quebecois') || lower === 'bq') return 'Bloc Québécois';
  
  // NDP variations
  if (lower.includes('ndp') || lower.includes('new democratic') || lower === 'npd') return 'NDP';
  
  // Green variations
  if (lower.includes('green') || lower === 'gpc' || lower === 'gp') return 'Green Party';
  
  return null;
}

/**
 * Calculate party loyalty statistics based on bill sponsor
 * Logic:
 * - If bill proposed by same party and MP votes yes -> Party-line vote
 * - If bill proposed by same party and MP votes no -> Break with party
 * - If bill proposed by different party and MP votes yes -> Independent vote
 * - Only counts votes that have both bill_number and sponsor_party
 * - Only counts votes on bills sponsored by the 5 major parties (to match breakdown table)
 * - Votes without sponsor info or Nay votes on other party bills are excluded
 */
export async function getPartyLoyaltyStats(
  mpId: string,
  mpName: string,
  partyName: string,
  votes: Vote[]
): Promise<PartyLoyaltyStats> {
  let votesWithParty = 0;
  let votesAgainstParty = 0;
  let freeVotes = 0;
  let abstainedPairedVotes = 0;
  let excludedVotes = 0;

  // Normalize MP's party name to major party format
  const mpMajorParty = normalizeToMajorParty(partyName);

  // Debug: Track vote breakdown for debugging
  const debugBreakdown: Record<string, { yea: number; nay: number; abstained: number }> = {};

  votes.forEach((vote) => {
    // Only categorize votes that have a bill and sponsor party
    if (vote.bill_number && vote.sponsor_party) {
      // Only count votes on bills sponsored by the 5 major parties (matching breakdown table)
      const sponsorMajorParty = normalizeToMajorParty(vote.sponsor_party);
      if (!sponsorMajorParty) {
        // Not a major party - exclude from calculation
        excludedVotes++;
        return;
      }

      // Track breakdown for debugging
      if (!debugBreakdown[sponsorMajorParty]) {
        debugBreakdown[sponsorMajorParty] = { yea: 0, nay: 0, abstained: 0 };
      }

      const isSameParty = mpMajorParty && sponsorMajorParty === mpMajorParty;
      const isAbstainedOrPaired = vote.vote_type === 'Paired' || vote.vote_type === 'Abstained' || vote.vote_type === 'Not Voting';
      
      if (isAbstainedOrPaired) {
        // Abstained/paired votes regardless of party
        abstainedPairedVotes++;
        debugBreakdown[sponsorMajorParty].abstained++;
      } else if (isSameParty) {
        // Bill was proposed by the same party
        if (vote.vote_type === 'Yea') {
          // Same party, voted yes -> Party-line vote
          votesWithParty++;
          debugBreakdown[sponsorMajorParty].yea++;
        } else if (vote.vote_type === 'Nay') {
          // Same party, voted no -> Break with party
          votesAgainstParty++;
          debugBreakdown[sponsorMajorParty].nay++;
        }
      } else {
        // Bill was proposed by a different party
        if (vote.vote_type === 'Yea') {
          // Different party, voted yes -> Independent vote
          freeVotes++;
          debugBreakdown[sponsorMajorParty].yea++;
        } else if (vote.vote_type === 'Nay') {
          // Different party, voted no -> Exclude from calculation
          excludedVotes++;
          debugBreakdown[sponsorMajorParty].nay++;
        }
      }
    } else {
      // No bill number or sponsor party - exclude from calculation
      excludedVotes++;
    }
  });

  // Debug logging for Etobicoke Centre (Yvan Baker)
  if (mpName.includes('Baker') || mpName.includes('Yvan')) {
    console.log(`[Party Loyalty Debug] ${mpName}:`);
    console.log(`  MP Party Name: "${partyName}"`);
    console.log(`  MP Major Party: "${mpMajorParty}"`);
    console.log(`  Votes with party: ${votesWithParty}`);
    console.log(`  Votes against party: ${votesAgainstParty}`);
    console.log(`  Independent votes: ${freeVotes}`);
    console.log(`  Abstained/paired: ${abstainedPairedVotes}`);
    console.log(`  Breakdown by sponsor party:`, debugBreakdown);
    
    // Show first few votes for debugging
    const sampleVotes = votes.filter(v => v.bill_number && v.sponsor_party).slice(0, 5);
    console.log(`  Sample votes:`, sampleVotes.map(v => ({
      date: v.date,
      vote_type: v.vote_type,
      sponsor_party: v.sponsor_party,
      normalized: normalizeToMajorParty(v.sponsor_party),
      isSameParty: mpMajorParty && normalizeToMajorParty(v.sponsor_party) === mpMajorParty
    })));
  }

  // Total votes used in calculation (only votes with sponsor info that we categorize)
  const totalVotes = votesWithParty + votesAgainstParty + freeVotes + abstainedPairedVotes;

  // Log validation warnings if there are many excluded votes
  if (excludedVotes > 0 && excludedVotes > votes.length * 0.1) {
    console.warn(`[Party Loyalty] ${mpName}: ${excludedVotes} votes (${(excludedVotes/votes.length*100).toFixed(1)}%) excluded from calculation (no sponsor info or Nay on other party bills)`);
  }

  return {
    mp_id: mpId,
    mp_name: mpName,
    party_name: partyName,
    total_votes: totalVotes,
    votes_with_party: votesWithParty,
    votes_against_party: votesAgainstParty,
    free_votes: freeVotes,
    abstained_paired_votes: abstainedPairedVotes,
    loyalty_percentage: totalVotes > 0 ? (votesWithParty / totalVotes) * 100 : 0,
    opposition_percentage: totalVotes > 0 ? (votesAgainstParty / totalVotes) * 100 : 0,
    free_vote_percentage: totalVotes > 0 ? (freeVotes / totalVotes) * 100 : 0,
  };
}

/**
 * Get motions/sponsorships for an MP from OpenParliament API
 */
export async function getMPMotions(mpId: string, mpName: string): Promise<MotionBreakdown> {
  // Use OpenParliament API to fetch bills/motions
  return await getOpenParliamentMotions(mpName);
}

