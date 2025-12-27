'use client';

import { useState, useMemo } from 'react';
import type { VotingRecord } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';

interface VotingHistoryProps {
  votingRecord: VotingRecord;
  partyColors: PartyColors;
}

export default function VotingHistory({ votingRecord, partyColors }: VotingHistoryProps) {
  const { votes, total_votes } = votingRecord;
  const itemsPerPage = 5;
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedVotes, setExpandedVotes] = useState<Set<string>>(new Set());
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'Yea' | 'Nay'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    votes.forEach(vote => {
      if (vote.category) {
        categorySet.add(vote.category);
      }
    });
    return Array.from(categorySet).sort();
  }, [votes]);

  // Filter votes
  const filteredVotes = useMemo(() => {
    return votes.filter(vote => {
      // Category filter
      if (selectedCategory !== 'all' && vote.category !== selectedCategory) {
        return false;
      }
      
      // Result filter (Yea/Nay)
      if (resultFilter !== 'all' && vote.vote_type !== resultFilter) {
        return false;
      }
      
      // Search filter (bill number or keyword)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const billMatch = vote.bill_number?.toLowerCase().includes(query);
        const titleMatch = vote.motion_title?.toLowerCase().includes(query);
        const billTitleMatch = vote.bill_title?.toLowerCase().includes(query);
        if (!billMatch && !titleMatch && !billTitleMatch) {
          return false;
        }
      }
      
      return true;
    });
  }, [votes, selectedCategory, resultFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredVotes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedVotes = filteredVotes.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = selectedCategory !== 'all' || resultFilter !== 'all' || searchQuery.trim() !== '';

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategory('all');
    setResultFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const toggleExpand = (voteId: string) => {
    const newExpanded = new Set(expandedVotes);
    if (newExpanded.has(voteId)) {
      newExpanded.delete(voteId);
    } else {
      newExpanded.add(voteId);
    }
    setExpandedVotes(newExpanded);
  };

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

  // Get secondary label for result (parliamentary jargon for tooltip)
  const getResultTooltip = (result: string): string => {
    return result; // Returns "Agreed To" or "Negatived"
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

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
          {/* Compact Filter Bar - search first, then category/result */}
          <div className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
              {/* Search with clear icon - macOS Spotlight style (FIRST) */}
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
                    handleFilterChange();
                  }}
                  className={`w-full pl-11 ${searchQuery ? 'pr-8' : 'pr-4'} py-1.5 rounded-full text-sm focus:outline-none bg-white text-gray-900 border transition-all duration-200 border-gray-300 focus:border-gray-300 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-blue-500`}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      handleFilterChange();
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

              {/* Category Dropdown - Pill style */}
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  handleFilterChange();
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
              >
                <option value="all">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>

              {/* Vote Result Filter - Pill style */}
              <select
                id="result-filter"
                value={resultFilter}
                onChange={(e) => {
                  setResultFilter(e.target.value as 'all' | 'Yea' | 'Nay');
                  handleFilterChange();
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:border-blue-500 bg-white appearance-none cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
              >
                <option value="all">All Votes</option>
                <option value="Yea">Yea</option>
                <option value="Nay">Nay</option>
              </select>

              {/* Clear filters button - only shows when filters are active */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Results count */}
            <div className="mt-3 text-sm text-gray-600">
              Showing {filteredVotes.length} of {total_votes} votes
            </div>
          </div>

          {/* Feed Items */}
          <div className="space-y-0 border-t border-gray-200">
            {paginatedVotes.length === 0 ? (
              <div className="py-12 text-center text-gray-500">
                No votes match your filters.
              </div>
            ) : (
              paginatedVotes.map((vote) => {
                const isExpanded = expandedVotes.has(vote.id);
                const fullTitle = getFullTitle(vote);
                const resultLabel = getResultLabel(vote.result);
                const resultTooltip = getResultTooltip(vote.result);
                const hasContext = vote.motion_title || (vote.bill_title && vote.bill_title !== fullTitle);
                
                return (
                  <div
                    key={vote.id}
                    className="py-3 px-4 -mx-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors group"
                  >
                    {/* Line 1: Bill number + Title + Result pill */}
                    <div className="flex items-start justify-between gap-4 mb-1.5">
                      <div className="flex-1 min-w-0">
                        {vote.bill_number && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-gray-900 flex-shrink-0">
                              {vote.bill_number}
                            </span>
                          </div>
                        )}
                        <h3 className="text-[15px] font-medium text-gray-900 line-clamp-2 leading-relaxed">
                          {fullTitle}
                        </h3>
                      </div>
                      {/* Result pill */}
                      <span 
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getResultBadgeColor(vote.result)}`}
                        title={resultTooltip}
                      >
                        {resultLabel}
                      </span>
                    </div>

                    {/* Line 2: Date • Category (muted) */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 mb-2">
                      <span>{formatDate(vote.date)}</span>
                      {vote.category && (
                        <>
                          <span>•</span>
                          <span>{vote.category}</span>
                        </>
                      )}
                    </div>

                    {/* Line 3: Show context toggle (only when available) */}
                    {hasContext && (
                      <button
                        onClick={() => toggleExpand(vote.id)}
                        className="text-sm font-medium hover:underline transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100"
                        style={{ color: partyColors.primary }}
                      >
                        {isExpanded ? 'Hide context' : 'Show context'}
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

                    {/* Expanded Context */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        {vote.motion_title && (
                          <p className="text-sm text-gray-700 leading-relaxed">
                            <span className="font-medium">Motion:</span> {vote.motion_title}
                          </p>
                        )}
                        {vote.bill_title && vote.bill_title !== fullTitle && (
                          <p className="text-sm text-gray-600 mt-2">
                            <span className="font-medium">Bill Title:</span> {vote.bill_title}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Modern Pagination */}
          {totalPages > 1 && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === 1
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === totalPages
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                        : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
