'use client';

import { useState } from 'react';
import type { MotionBreakdown as MotionBreakdownType } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';

interface MotionBreakdownProps {
  motions: MotionBreakdownType;
  partyColors: PartyColors;
}

export default function MotionBreakdown({ motions, partyColors }: MotionBreakdownProps) {
  const { motions: motionList } = motions;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Sort motions by date (most recent first)
  const sortedMotions = [...motionList].sort((a, b) => {
    const dateA = a.introduced_date ? new Date(a.introduced_date).getTime() : 0;
    const dateB = b.introduced_date ? new Date(b.introduced_date).getTime() : 0;
    return dateB - dateA; // Most recent first
  });

  const toggleRow = (motionId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(motionId)) {
      newExpanded.delete(motionId);
    } else {
      newExpanded.add(motionId);
    }
    setExpandedRows(newExpanded);
  };

  const getBadgeLabel = (motion: typeof sortedMotions[0]) => {
    if (motion.sponsor_type === 'Sponsor') {
      return 'Sponsor';
    } else if (motion.sponsor_type === 'Co-sponsor' || motion.sponsor_type === 'Seconder') {
      return 'Co-sponsor';
    }
    // Fallback - this shouldn't typically happen, but show a default
    return motion.type === 'Bill' ? 'Private member\'s bill' : 'Sponsor';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Motions & Bills
      </h2>

      {motionList.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            No motion or bill data available at this time.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            This may be due to API limitations or the MP being newly elected.
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          {sortedMotions.map((motion) => {
            const isExpanded = expandedRows.has(motion.id);
            const billCode = motion.number || '';
            const badgeLabel = getBadgeLabel(motion);
            
            return (
              <div
                key={motion.id}
                className="border-b border-gray-200 last:border-b-0"
              >
                <div className="py-4">
                  {/* Main Row */}
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Bill code + title */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3">
                        <button
                          onClick={() => toggleRow(motion.id)}
                          className="flex-shrink-0 mt-1 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                        >
                          <svg
                            className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {billCode && (
                              <span className="font-mono text-sm font-semibold text-gray-900">
                                {billCode}
                              </span>
                            )}
                            <h3 className="text-base font-semibold text-gray-900 break-words leading-relaxed">
                              {motion.title}
                            </h3>
                          </div>
                          
                          {/* Sub-row: date + topic tags */}
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-sm text-gray-600 leading-relaxed">
                            {motion.introduced_date && (
                              <span>
                                {formatDate(motion.introduced_date)}
                              </span>
                            )}
                            {motion.category && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                {motion.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Status badges + View details */}
                    <div className="flex items-start gap-3 flex-shrink-0">
                      <span 
                        className="px-2.5 py-1 rounded text-xs font-medium whitespace-nowrap border"
                        style={{
                          backgroundColor: `${partyColors.primary}08`,
                          color: partyColors.primary,
                          borderColor: `${partyColors.primary}30`,
                        }}
                      >
                        {badgeLabel}
                      </span>
                      {motion.url && (
                        <a
                          href={motion.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium hover:underline transition-colors whitespace-nowrap"
                          style={{ color: partyColors.primary }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          View details
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-4 pl-8 space-y-3">
                      {motion.description && (
                        <p className="text-sm text-gray-700 leading-relaxed">
                          {motion.description}
                        </p>
                      )}
                      {motion.status && (
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-medium text-gray-700">Status:</span>
                          <span className="text-sm text-gray-600">{motion.status}</span>
                        </div>
                      )}
                      {motion.type && (
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-medium text-gray-700">Type:</span>
                          <span className="text-sm text-gray-600">{motion.type}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
