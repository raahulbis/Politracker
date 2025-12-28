'use client';

import { useState } from 'react';
import type { PartyLoyaltyStats as PartyLoyaltyStatsType, Vote } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';
import { getPartyLogo } from '@/lib/utils/party-logos';
import Image from 'next/image';
import DonutChart from './DonutChart';

interface PartyLoyaltyStatsProps {
  stats: PartyLoyaltyStatsType;
  partyColors: PartyColors;
  votes?: Vote[]; // Optional votes array for sponsor party breakdown
}

export default function PartyLoyaltyStats({ stats, partyColors, votes = [] }: PartyLoyaltyStatsProps) {
  const [isTableExpanded, setIsTableExpanded] = useState(false);

  // Calculate voting breakdown by sponsor party
  const getSponsorPartyBreakdown = () => {
    const partyAbbreviations: Record<string, string> = {
      'Liberal': 'LIB',
      'Liberal Party': 'LIB',
      'Liberal Party of Canada': 'LIB',
      'Conservative': 'CON',
      'Conservative Party': 'CON',
      'Conservative Party of Canada': 'CON',
      'Bloc Québécois': 'BLOC',
      'Bloc': 'BLOC',
      'NDP': 'NDP',
      'New Democratic Party': 'NDP',
      'New Democratic Party of Canada': 'NDP',
      'Green Party': 'GREEN',
      'Green Party of Canada': 'GREEN',
    };

    const normalizePartyName = (partyName: string | undefined): string | null => {
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
    };

    const breakdown: Record<string, { yea: number; nay: number; total: number; partyName: string }> = {};

    // Filter votes to only include those from 2025 onwards
    const votesFrom2025 = votes.filter((vote) => {
      if (!vote.date) return false;
      const voteDate = new Date(vote.date);
      return voteDate.getFullYear() >= 2025;
    });

    votesFrom2025.forEach((vote) => {
      if (vote.bill_number && vote.sponsor_party) {
        const normalizedParty = normalizePartyName(vote.sponsor_party);
        if (normalizedParty && ['Liberal', 'Conservative', 'Bloc Québécois', 'NDP', 'Green Party'].includes(normalizedParty)) {
          if (!breakdown[normalizedParty]) {
            breakdown[normalizedParty] = { yea: 0, nay: 0, total: 0, partyName: normalizedParty };
          }
          
          if (vote.vote_type === 'Yea') {
            breakdown[normalizedParty].yea++;
            breakdown[normalizedParty].total++;
          } else if (vote.vote_type === 'Nay') {
            breakdown[normalizedParty].nay++;
            breakdown[normalizedParty].total++;
          }
        }
      }
    });

    // Return in specific order: LIB, BLOC, CON, GREEN, NDP
    const order = ['Liberal', 'Bloc Québécois', 'Conservative', 'Green Party', 'NDP'];
    return order.map(party => ({
      party,
      abbreviation: partyAbbreviations[party] || party,
      yea: breakdown[party]?.yea || 0,
      nay: breakdown[party]?.nay || 0,
      total: breakdown[party]?.total || 0,
      partyName: party,
    }));
  };

  const sponsorBreakdown = getSponsorPartyBreakdown();
  
  // Count votes with sponsor_party data (only from 2025 onwards)
  const votesFrom2025 = votes.filter(v => {
    if (!v.date) return false;
    const voteDate = new Date(v.date);
    return voteDate.getFullYear() >= 2025;
  });
  const votesWithSponsor = votesFrom2025.filter(v => v.bill_number && v.sponsor_party).length;
  const totalBillVotes = votesFrom2025.filter(v => v.bill_number).length;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
        Party Loyalty
      </h2>

      <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
        {/* Left: Donut Chart */}
        <div className="flex-shrink-0">
          <div className="flex flex-col items-center">
            <DonutChart
              percentage={stats.loyalty_percentage}
              size={140}
              strokeWidth={10}
              color={partyColors.primary}
            />
            <p className="text-base text-gray-900 dark:text-white leading-relaxed mt-4 text-center">
              Votes with party: <span className="font-semibold">{stats.loyalty_percentage.toFixed(0)}%</span>
            </p>
          </div>
        </div>

        {/* Right: 3 Stat Lines */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-300">Party-line votes</span>
            <span className="text-xl font-semibold text-gray-900 dark:text-white">{stats.votes_with_party}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-300">Breaks with party</span>
            <span className="text-xl font-semibold text-gray-900 dark:text-white">{stats.votes_against_party}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600 dark:text-gray-300">Independent votes</span>
            <span className="text-xl font-semibold text-gray-900 dark:text-white">{stats.free_votes}</span>
          </div>
        </div>
      </div>

      {/* Collapsible Sponsor Party Breakdown Table */}
      {totalBillVotes > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
            <button
              onClick={() => setIsTableExpanded(!isTableExpanded)}
              className="w-full flex items-center justify-between text-left text-sm font-semibold text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              style={{ color: isTableExpanded ? partyColors.primary : undefined }}
            >
              <span>Votes by sponsor party</span>
              <svg
                className={`w-5 h-5 transform transition-transform ${isTableExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {isTableExpanded && (
              <div className="mt-4">
                {votesWithSponsor === 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                    Sponsor party information not available for votes. Votes may need to be re-fetched to include sponsor data.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-slate-700">
                            <th className="text-left py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Party</th>
                            <th className="text-right py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Yea</th>
                            <th className="text-right py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Nay</th>
                            <th className="text-right py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sponsorBreakdown.map((item) => {
                            const yeaPercent = item.total > 0 ? (item.yea / item.total * 100).toFixed(1) : '0.0';
                            const nayPercent = item.total > 0 ? (item.nay / item.total * 100).toFixed(1) : '0.0';
                            const logo = getPartyLogo(item.party);
                            
                            return (
                              <tr 
                                key={item.party} 
                                className={`border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${item.total === 0 ? 'opacity-50' : ''}`}
                              >
                                <td className="py-2 px-2">
                                  <div className="flex items-center gap-2">
                                    {logo && (
                                      <Image
                                        src={logo}
                                        alt={item.party}
                                        width={20}
                                        height={20}
                                        className="rounded-sm flex-shrink-0"
                                      />
                                    )}
                                    <span className="font-medium text-gray-900 dark:text-white">{item.abbreviation}</span>
                                  </div>
                                </td>
                                <td className="text-right py-2 px-2">
                                  <div className="flex flex-col items-end">
                                    <span className={`font-semibold ${item.total > 0 ? 'text-green-700 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                      {item.yea}
                                    </span>
                                    {item.total > 0 && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{yeaPercent}%</span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right py-2 px-2">
                                  <div className="flex flex-col items-end">
                                    <span className={`font-semibold ${item.total > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                      {item.nay}
                                    </span>
                                    {item.total > 0 && (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{nayPercent}%</span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right py-2 px-2">
                                  <span className={`font-semibold ${item.total > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                                    {item.total}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {votesWithSponsor < totalBillVotes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
                        Note: {totalBillVotes - votesWithSponsor} bill vote(s) missing sponsor party information
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
