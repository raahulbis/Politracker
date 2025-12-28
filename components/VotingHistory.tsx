'use client';

import { useState, useMemo } from 'react';
import type { VotingRecord } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';

interface VotingHistoryProps {
  votingRecord: VotingRecord;
  partyColors: PartyColors;
}

interface GroupedBill {
  bill_number: string;
  bill_title: string;
  category?: string;
  votes: Array<{
    id: string;
    date: string;
    motion_number?: string;
    motion_title: string;
    result: 'Agreed To' | 'Negatived' | 'Tie';
    vote_type: 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting';
  }>;
}

export default function VotingHistory({ votingRecord, partyColors }: VotingHistoryProps) {
  const { votes, total_votes } = votingRecord;
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  // Get full title for display, cleaning up bill number prefixes
  const getFullTitle = (vote: {
    bill_number?: string;
    bill_title?: string;
    motion_title: string;
  }): string => {
    // Use bill_title if available, otherwise use motion_title
    let title = vote.bill_title || vote.motion_title;
    
    // Remove common bill number prefix patterns
    // Patterns like "Bill C-12, ", "Bill S-12, ", "C-12, ", etc.
    title = title.replace(/^Bill\s+[CS]-\d+,\s*/i, ''); // "Bill C-12, " or "Bill S-12, "
    title = title.replace(/^[CS]-\d+,\s*/i, ''); // "C-12, " or "S-12, "
    
    return title.trim();
  };

  // Filter votes by search query
  const filteredVotes = useMemo(() => {
    if (!searchQuery.trim()) {
      return votes;
    }
    
    const query = searchQuery.toLowerCase();
    return votes.filter(vote => {
      const billMatch = vote.bill_number?.toLowerCase().includes(query);
      const titleMatch = vote.motion_title?.toLowerCase().includes(query);
      const billTitleMatch = vote.bill_title?.toLowerCase().includes(query);
      return billMatch || titleMatch || billTitleMatch;
    });
  }, [votes, searchQuery]);

  // Group votes by bill_number
  const groupedBills = useMemo(() => {
    const billMap = new Map<string, GroupedBill>();
    
    filteredVotes.forEach(vote => {
      // Only group votes that have a bill_number
      if (!vote.bill_number) {
        return;
      }
      
      const billKey = vote.bill_number;
      
      if (!billMap.has(billKey)) {
        billMap.set(billKey, {
          bill_number: vote.bill_number,
          bill_title: getFullTitle(vote),
          category: vote.category,
          votes: [],
        });
      }
      
      const bill = billMap.get(billKey)!;
      bill.votes.push({
        id: vote.id,
        date: vote.date,
        motion_number: vote.motion_number,
        motion_title: vote.motion_title,
        result: vote.result,
        vote_type: vote.vote_type,
      });
    });
    
    // Sort votes within each bill by date (latest first)
    billMap.forEach((bill) => {
      bill.votes.sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        return dateB - dateA; // Latest first
      });
    });
    
    // Convert to array and sort by bill number
    return Array.from(billMap.values()).sort((a, b) => {
      // Extract numeric part for sorting (e.g., "C-12" -> 12)
      const getNumericPart = (billNum: string) => {
        const match = billNum.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };
      
      // Sort by prefix first (C before S), then by number
      const aPrefix = a.bill_number.charAt(0);
      const bPrefix = b.bill_number.charAt(0);
      
      if (aPrefix !== bPrefix) {
        return aPrefix.localeCompare(bPrefix);
      }
      
      return getNumericPart(b.bill_number) - getNumericPart(a.bill_number);
    });
  }, [filteredVotes]);

  const getResultBadgeColor = (result: string) => {
    switch (result) {
      case 'Agreed To':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Negatived':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get primary label for result (user-friendly)
  const getResultLabel = (result: string): string => {
    switch (result) {
      case 'Agreed To':
        return 'Supported';
      case 'Negatived':
        return 'Opposed';
      default:
        return result;
    }
  };

  const toggleBillExpansion = (billNumber: string) => {
    const newExpanded = new Set(expandedBills);
    if (newExpanded.has(billNumber)) {
      newExpanded.delete(billNumber);
    } else {
      newExpanded.add(billNumber);
    }
    setExpandedBills(newExpanded);
  };

  return (
    <div className="card" id="voting-history">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Voting History
      </h2>

      {total_votes === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            No voting records available at this time.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            This may be due to API limitations or the MP being newly elected.
          </p>
        </div>
      ) : (
        <>
          {/* Search Bar */}
          <div className="mb-6">
            <div className="flex items-center gap-2">
              {/* Search with clear icon */}
              <div className="flex-1 min-w-[200px] relative">
                {/* Search Icon */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  id="search"
                  type="text"
                  placeholder="Bill number or keyword"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                  }}
                  className={`w-full pl-11 ${searchQuery ? 'pr-8' : 'pr-4'} py-1.5 rounded-full text-sm focus:outline-none bg-white text-gray-900 border transition-all duration-200 border-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-blue-500`}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                    aria-label="Clear search"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Results count */}
            <div className="mt-3 text-sm text-gray-600">
              Showing {filteredVotes.length} of {total_votes} votes
            </div>
          </div>

          {/* Grouped Bills */}
          <div className="space-y-6 border-t border-gray-200 pt-6">
            {groupedBills.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                No votes match your search.
              </div>
            ) : (
              groupedBills.map((bill) => {
                const isExpanded = expandedBills.has(bill.bill_number);
                const hasMultipleVotes = bill.votes.length > 1;
                const latestVote = bill.votes[0];
                const pastVotes = bill.votes.slice(1);

                return (
                  <div key={bill.bill_number} className="border-b border-gray-200 last:border-b-0 pb-6 last:pb-0">
                    {/* 1. Bill icon + Bill number + Category pill */}
                    <div className="flex items-center gap-2 mb-2">
                      <svg
                        className="w-5 h-5 text-gray-600 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-lg font-semibold text-gray-900">
                        {bill.bill_number}
                      </span>
                      {bill.category && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                          {bill.category}
                        </span>
                      )}
                    </div>

                    {/* 2. Bill Title */}
                    <h3 className="text-base font-medium text-gray-900 leading-relaxed mb-3">
                      {bill.bill_title}
                    </h3>

                    {/* 3. Last vote details + Status pill */}
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        {latestVote.motion_number && (
                          <span className="text-sm text-gray-600 mr-2">
                            Motion {latestVote.motion_number}
                          </span>
                        )}
                        <span className="text-sm text-gray-600">
                          {latestVote.motion_title}
                        </span>
                      </div>
                      {/* Result pill */}
                      <span 
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getResultBadgeColor(latestVote.result)}`}
                      >
                        {getResultLabel(latestVote.result)}
                      </span>
                    </div>

                    {/* 4. Past votes expand button (only if multiple votes) */}
                    {hasMultipleVotes && (
                      <button
                        onClick={() => toggleBillExpansion(bill.bill_number)}
                        className="text-sm font-medium text-gray-600 hover:text-gray-900 hover:underline transition-colors flex items-center gap-1"
                      >
                        {isExpanded ? 'Hide' : 'Show'} past votes ({pastVotes.length})
                        <svg
                          className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}

                    {/* Past votes subsection (only if multiple votes and expanded) */}
                    {hasMultipleVotes && isExpanded && (
                      <div className="mt-4 ml-7 space-y-3 border-l-2 border-gray-200 pl-4">
                        {pastVotes.map((vote) => (
                          <div
                            key={vote.id}
                            className="flex items-start justify-between gap-4 py-2"
                          >
                            <div className="flex-1 min-w-0">
                              {vote.motion_number && (
                                <span className="text-sm text-gray-600 mr-2">
                                  Motion {vote.motion_number}
                                </span>
                              )}
                              <span className="text-sm text-gray-600">
                                {vote.motion_title}
                              </span>
                            </div>
                            {/* Result pill */}
                            <span 
                              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getResultBadgeColor(vote.result)}`}
                            >
                              {getResultLabel(vote.result)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
