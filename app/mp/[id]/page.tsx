'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import MPProfile from '@/components/MPProfile';
import VotingHistory from '@/components/VotingHistory';
import PartyLoyaltyStats from '@/components/PartyLoyaltyStats';
import MotionBreakdown from '@/components/MotionBreakdown';
import MPExpenses from '@/components/MPExpenses';
import { getPartyColors } from '@/lib/utils/party-colors';
import type { MP, VotingRecord, PartyLoyaltyStats as PartyLoyaltyStatsType, MotionBreakdown as MotionBreakdownType } from '@/types';

interface MPStats {
  votingRecord: VotingRecord;
  partyLoyalty: PartyLoyaltyStatsType;
  motions: MotionBreakdownType;
  dataValid?: boolean;
}

export default function MPPage() {
  const params = useParams();
  const mpId = params.id as string;
  const [mp, setMp] = useState<MP | null>(null);
  const [stats, setStats] = useState<MPStats | null>(null);
  const [expenses, setExpenses] = useState<{
    total_staff_salaries: number;
    total_travel: number;
    total_hospitality: number;
    total_contracts: number;
    processedQuarters?: Array<{
      year: number;
      quarter_number: number;
      quarter: string;
    }>;
  } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingVotingHistory, setLoadingVotingHistory] = useState(true);
  const [loadingPartyLoyalty, setLoadingPartyLoyalty] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMPProfile() {
      try {
        // Fetch MP profile immediately (fast, from database)
        const response = await fetch(`/api/mp/${mpId}/profile`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch MP profile');
        }

        const data = await response.json();
        setMp(data.mp);
        setLoadingProfile(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setLoadingProfile(false);
      }
    }

    async function fetchMPStats() {
      try {
        // Fetch voting data and calculate stats (slower)
        const response = await fetch(`/api/mp/${mpId}/stats`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch MP stats');
        }

        const statsData: MPStats = await response.json();
        
        // Show voting history as soon as it's ready
        setLoadingVotingHistory(false);
        
        // Validate that all votes are categorized before showing party loyalty
        const categorizedVotes = statsData.partyLoyalty.votes_with_party + 
                                 statsData.partyLoyalty.votes_against_party + 
                                 statsData.partyLoyalty.free_votes +
                                 (statsData.partyLoyalty.abstained_paired_votes || 0);
        const allVotesCategorized = categorizedVotes === statsData.partyLoyalty.total_votes;
        
        if (allVotesCategorized && statsData.votingRecord.votes.length > 0 && statsData.dataValid !== false) {
          setStats(statsData);
          setLoadingPartyLoyalty(false);
        } else {
          console.error('Cannot display party loyalty - vote counts do not match:', {
            total: statsData.partyLoyalty.total_votes,
            categorized: categorizedVotes,
            withParty: statsData.partyLoyalty.votes_with_party,
            againstParty: statsData.partyLoyalty.votes_against_party,
            freeVotes: statsData.partyLoyalty.free_votes,
          });
          // Still set stats and stop loading to avoid infinite spinner
          setStats(statsData);
          setLoadingPartyLoyalty(false);
        }
      } catch (err) {
        console.error('Error fetching MP stats:', err);
        setLoadingVotingHistory(false);
        setLoadingPartyLoyalty(false);
      }
    }

    async function fetchMPExpenses() {
      try {
        const response = await fetch(`/api/mp/${mpId}/expenses`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch MP expenses');
        }

        const expensesData = await response.json();
        console.log('Expenses data received:', expensesData);
        setExpenses(expensesData);
        setLoadingExpenses(false);
      } catch (err) {
        console.error('Error fetching MP expenses:', err);
        setLoadingExpenses(false);
        // Set empty expenses on error so component doesn't show loading forever
        setExpenses({
          total_staff_salaries: 0,
          total_travel: 0,
          total_hospitality: 0,
          total_contracts: 0,
          processedQuarters: [],
        });
      }
    }

    if (mpId) {
      // Fetch profile first (fast)
      fetchMPProfile();
      // Fetch stats and expenses in parallel (slower)
      fetchMPStats();
      fetchMPExpenses();
    }
  }, [mpId]);

  if (loadingProfile) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 dark:border-blue-400 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading MP profile...</p>
        </div>
      </div>
    );
  }

  if (error || !mp) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#000000] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error || 'MP not found'}</p>
        </div>
      </div>
    );
  }

  const partyColors = getPartyColors(mp.party_name);

  return (
    <main className="min-h-screen bg-[#f7f7f7] dark:bg-[#000000]">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <MPProfile 
            mp={mp} 
            partyColors={partyColors}
            expenses={expenses}
            partyLoyalty={stats?.partyLoyalty}
            motions={stats?.motions}
            votingRecord={stats?.votingRecord}
          />
          
          {loadingExpenses ? (
            <div className="card">
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 dark:bg-[#0B0F14] rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 dark:bg-[#0B0F14] rounded w-full mb-2"></div>
                <div className="h-4 bg-gray-200 dark:bg-[#0B0F14] rounded w-5/6"></div>
              </div>
            </div>
          ) : expenses ? (
            <MPExpenses expenses={expenses} partyColors={partyColors} />
          ) : null}
          
          {loadingPartyLoyalty ? (
            <div className="card">
              <div className="flex flex-col items-center justify-center py-12">
                <div 
                  className="animate-spin rounded-full h-10 w-10 border-b-2 mb-4"
                  style={{ borderBottomColor: partyColors.primary }}
                ></div>
                <p className="text-gray-600 dark:text-gray-400">Calculating...</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Analyzing party loyalty statistics</p>
              </div>
            </div>
          ) : stats ? (
            <PartyLoyaltyStats 
              stats={stats.partyLoyalty} 
              partyColors={partyColors}
              votes={stats.votingRecord.votes}
            />
          ) : null}

          {stats ? (
            <MotionBreakdown motions={stats.motions} partyColors={partyColors} />
          ) : (
            <div className="card">
              <div className="flex flex-col items-center justify-center py-12">
                <div 
                  className="animate-spin rounded-full h-10 w-10 border-b-2 mb-4"
                  style={{ borderBottomColor: partyColors.primary }}
                ></div>
                <p className="text-gray-600 dark:text-gray-400">Loading proposed bills...</p>
              </div>
            </div>
          )}
          
          {loadingVotingHistory ? (
            <div className="card">
              <div className="flex flex-col items-center justify-center py-12">
                <div 
                  className="animate-spin rounded-full h-10 w-10 border-b-2 mb-4"
                  style={{ borderBottomColor: partyColors.primary }}
                ></div>
                <p className="text-gray-600 dark:text-gray-400">Loading voting history...</p>
              </div>
            </div>
          ) : stats ? (
            <VotingHistory votingRecord={stats.votingRecord} partyColors={partyColors} />
          ) : null}
        </div>
      </div>
    </main>
  );
}
