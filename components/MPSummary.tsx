'use client';

import type { MP, VotingRecord, PartyLoyaltyStats, MotionBreakdown } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';

interface MPSummaryProps {
  mp: MP;
  expenses: {
    total_staff_salaries: number;
    total_travel: number;
    total_hospitality: number;
    total_contracts: number;
  };
  partyLoyalty: PartyLoyaltyStats;
  motions: MotionBreakdown;
  votingRecord: VotingRecord;
  partyColors: PartyColors;
}

export default function MPSummary({ 
  mp, 
  expenses, 
  partyLoyalty, 
  motions, 
  votingRecord,
  partyColors 
}: MPSummaryProps) {
  const salary = mp.salary || 209800;
  const totalExpenses = expenses.total_staff_salaries + 
                       expenses.total_travel + 
                       expenses.total_hospitality + 
                       expenses.total_contracts;
  
  const totalBills = motions.bills_sponsored + motions.bills_co_sponsored;
  const totalMotions = motions.motions_sponsored + motions.motions_co_sponsored;
  
  // Calculate top 3 categories from bills they voted "Yea" on
  // Count unique bills per category (not total votes)
  const categoryBills = new Map<string, Set<string>>();
  
  votingRecord.votes.forEach((vote) => {
    if (vote.vote_type === 'Yea' && vote.category) {
      // Use bill_number if available, otherwise use motion_title as identifier
      const billIdentifier = vote.bill_number || vote.motion_title;
      
      if (!categoryBills.has(vote.category)) {
        categoryBills.set(vote.category, new Set());
      }
      categoryBills.get(vote.category)!.add(billIdentifier);
    }
  });

  // Convert to array and sort by count (descending), take top 3
  const topCategories = Array.from(categoryBills.entries())
    .map(([category, bills]) => ({ category, count: bills.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(item => item.category);

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-CA', { 
      style: 'currency', 
      currency: 'CAD', 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    });
  };

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
          Summary
        </h2>
        <div className="group relative">
          <svg
            className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 hover:text-gray-600 cursor-help transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="Information"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
            Summary of your MP for this current session of parliament
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="space-y-4 text-sm sm:text-base text-gray-700">
        <p>
          This MP earns: <span className="font-semibold text-gray-900">{formatCurrency(salary)}</span> per year from your federal taxes
        </p>
        
        <p>
          This MP has spent so far: <span className="font-semibold text-gray-900">{formatCurrency(totalExpenses)}</span> of your tax money on Staff, Travel, Hospitality and Contracts
        </p>
        
        <p>
          This MP votes with their party: <span className="font-semibold text-gray-900">{partyLoyalty.loyalty_percentage.toFixed(1)}%</span>
        </p>
        
        <p>
          This MP has pushed forward: <span className="font-semibold text-gray-900">{totalBills}</span> bills and <span className="font-semibold text-gray-900">{totalMotions}</span> motions
        </p>
        
        {topCategories.length > 0 ? (
          <p>
            They have voted for changes in: <span className="font-semibold text-gray-900">{topCategories.join(', ')}</span>
          </p>
        ) : (
          <p>
            They have voted for changes in: <span className="text-gray-500 italic">No categorized votes available</span>
          </p>
        )}
      </div>
    </div>
  );
}

