'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getPartyColors } from '@/lib/utils/party-colors';
import ThemeToggle from '@/components/ThemeToggle';

interface BillData {
  bill: {
    id: number;
    bill_number: string;
    title: string;
    introduced_date: string | null;
    status_code: string | null;
    status: string | null;
    law: boolean | null;
    session: string | null;
    sponsor_politician: string | null;
    sponsor_party: string | null;
    category_name: string | null;
  };
  mpVotes: Array<{
    mp_id: number;
    mp_name: string;
    party_name: string | null;
    district_name: string;
    photo_url: string | null;
    vote_type: 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting';
    vote_date: string;
    motion_title: string | null;
  }>;
}

type VoteType = 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting';

export default function BillPage() {
  const params = useParams();
  const router = useRouter();
  const billNumber = params.id as string;
  const [data, setData] = useState<BillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedParties, setCollapsedParties] = useState<Set<string>>(new Set());
  const [legisinfoData, setLegisinfoData] = useState<any>(null);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [webReferencesCollapsed, setWebReferencesCollapsed] = useState(true);

  useEffect(() => {
    const fetchBillData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/bill/${encodeURIComponent(billNumber)}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Bill not found');
          } else {
            setError('Failed to load bill data');
          }
          return;
        }
        
        const result = await response.json();
        setData(result);
        
        // Fetch LEGISinfo data if we have a session (do this regardless of votes)
        if (result.bill?.session) {
          // Fetch in background - don't block on this
          fetch(
            `/api/bill/${encodeURIComponent(billNumber)}/legisinfo?session=${encodeURIComponent(result.bill.session)}`
          )
            .then((legisinfoResponse) => {
              if (legisinfoResponse.ok) {
                return legisinfoResponse.json();
              }
              return null;
            })
            .then((legisinfoResult) => {
              if (legisinfoResult) {
                setLegisinfoData(legisinfoResult);
              }
            })
            .catch((err) => {
              // Silently fail - LEGISinfo data is optional
              console.warn('Failed to fetch LEGISinfo data:', err);
            });
        }
      } catch (err) {
        console.error('Error fetching bill data:', err);
        setError('Failed to load bill data');
      } finally {
        setLoading(false);
      }
    };

    if (billNumber) {
      fetchBillData();
    }
  }, [billNumber]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getStatusBadge = (bill: BillData['bill']) => {
    if (bill.law === true) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
          Law
        </span>
      );
    }
    
    if (bill.status_code === 'RoyalAssentGiven') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
          Royal Assent
        </span>
      );
    }
    
    if (bill.status_code) {
      const statusText = bill.status_code
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/^./, str => str.toUpperCase());
      
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200">
          {statusText}
        </span>
      );
    }
    
    if (bill.status) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200">
          {bill.status}
        </span>
      );
    }
    
    return null;
  };

  // Group MPs by vote type, then by party
  const groupedByVote = (data: BillData['mpVotes']) => {
    const grouped: Record<VoteType, Record<string, typeof data>> = {
      'Yea': {},
      'Nay': {},
      'Paired': {},
      'Abstained': {},
      'Not Voting': {},
    };

    data.forEach((mp) => {
      const voteType = mp.vote_type;
      const party = mp.party_name || 'Independent';
      
      if (!grouped[voteType][party]) {
        grouped[voteType][party] = [];
      }
      grouped[voteType][party].push(mp);
    });

    return grouped;
  };

  const getVoteTypeLabel = (voteType: VoteType) => {
    switch (voteType) {
      case 'Yea':
        return 'Voted For';
      case 'Nay':
        return 'Voted Against';
      case 'Paired':
        return 'Paired';
      case 'Abstained':
        return 'Abstained';
      case 'Not Voting':
        return 'Did Not Vote';
    }
  };

  const getVoteTypeColor = (voteType: VoteType) => {
    switch (voteType) {
      case 'Yea':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700';
      case 'Nay':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700';
      case 'Paired':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700';
      case 'Abstained':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600';
      case 'Not Voting':
        return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600';
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-end mb-4">
              <ThemeToggle />
            </div>
            <div className="card">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-2/3 mb-8"></div>
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
                  <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 dark:bg-slate-900">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-end mb-4">
              <ThemeToggle />
            </div>
            <div className="card">
              <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400 mb-4">{error || 'Bill not found'}</p>
                <Link
                  href="/"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  ← Back to home
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const { bill, mpVotes } = data;
  
  // Filter MPs by search query
  const filteredMpVotes = searchQuery.trim()
    ? mpVotes.filter((mp) => {
        const query = searchQuery.toLowerCase();
        return (
          mp.mp_name.toLowerCase().includes(query) ||
          mp.district_name.toLowerCase().includes(query)
        );
      })
    : mpVotes;
  
  const grouped = groupedByVote(filteredMpVotes);

  // Construct LEGISinfo URL
  const billUrl = bill.session && bill.bill_number
    ? `https://www.parl.ca/legisinfo/en/bill/${bill.session}/${bill.bill_number.toLowerCase()}`
    : null;

  // Order vote types for display
  const voteTypeOrder: VoteType[] = ['Yea', 'Nay', 'Paired', 'Abstained', 'Not Voting'];
  
  // Toggle party collapse
  const toggleParty = (voteType: VoteType, partyName: string) => {
    const key = `${voteType}-${partyName}`;
    setCollapsedParties((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  
  const isPartyCollapsed = (voteType: VoteType, partyName: string) => {
    const key = `${voteType}-${partyName}`;
    return collapsedParties.has(key);
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center mb-4">
            <Link
              href="/"
              className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              ← Back to home
            </Link>
            <ThemeToggle />
          </div>

          {/* Bill Header */}
          <div className="card">
            <div className="mb-6">
              {/* Bill Number with Icon and LEGISinfo Link */}
              <div className="flex items-center gap-3 mb-3">
                <svg className="w-8 h-8 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex-1">
                  {bill.bill_number}
                </h1>
                {billUrl && (
                  <a
                    href={billUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-medium text-sm whitespace-nowrap"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Read on LEGISinfo
                  </a>
                )}
              </div>
              
              {/* Bill Title */}
              <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-6 leading-relaxed">
                {bill.title}
              </h2>
              
              {/* Bill Status - Prominent Display */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</span>
                  {getStatusBadge(bill)}
                </div>
              </div>
              
              {/* Bill Context/Metadata */}
              <div className="space-y-2 mb-6">
                {bill.category_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Category:</span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                      {bill.category_name}
                    </span>
                  </div>
                )}
                
                {(bill.sponsor_politician || bill.sponsor_party) && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sponsor:</span>
                    {bill.sponsor_politician && (
                      <span className="text-sm text-gray-900 dark:text-gray-100">
                        {bill.sponsor_politician}
                      </span>
                    )}
                    {bill.sponsor_party && (
                      <>
                        {bill.sponsor_politician && <span className="text-gray-400 dark:text-gray-500">•</span>}
                        {(() => {
                          const partyColors = getPartyColors(bill.sponsor_party);
                          return (
                            <span 
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium"
                              style={{
                                backgroundColor: `${partyColors.primary}15`,
                                color: partyColors.primary
                              }}
                            >
                              {bill.sponsor_party}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </div>
                )}
                
                {bill.introduced_date && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Introduced:</span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {formatDate(bill.introduced_date)}
                    </span>
                  </div>
                )}
                
                {bill.session && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Session:</span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {bill.session}
                    </span>
                  </div>
                )}
              </div>

              {/* Notes Section - Collapsible */}
              {legisinfoData?.NotesEn && (
                <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => setNotesCollapsed(!notesCollapsed)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Notes
                    </h3>
                    <svg
                      className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${notesCollapsed ? '' : 'rotate-180'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!notesCollapsed && (
                    <div 
                      className="mt-3 text-sm text-gray-700 dark:text-gray-300 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ol]:list-decimal [&_ol]:ml-6 [&_li]:mb-1"
                      dangerouslySetInnerHTML={{ __html: legisinfoData.NotesEn }}
                    />
                  )}
                </div>
              )}

              {/* Web References Section - Collapsible */}
              {legisinfoData?.WebReferences && Array.isArray(legisinfoData.WebReferences) && legisinfoData.WebReferences.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => setWebReferencesCollapsed(!webReferencesCollapsed)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      Web References
                    </h3>
                    <svg
                      className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${webReferencesCollapsed ? '' : 'rotate-180'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {!webReferencesCollapsed && (
                    <div className="mt-3 space-y-2">
                      {legisinfoData.WebReferences.map((ref: any, index: number) => (
                        <div key={index} className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            {ref.UrlEn || ref.Url ? (
                              <a
                                href={ref.UrlEn || ref.Url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline text-sm"
                              >
                                {ref.TitleEn || ref.Title || 'Web Reference'}
                              </a>
                            ) : (
                              <span className="text-sm text-gray-700 dark:text-gray-300">
                                {ref.TitleEn || ref.Title || 'Web Reference'}
                              </span>
                            )}
                            {ref.WebReferenceTypeNameEn && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                ({ref.WebReferenceTypeNameEn})
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* MP Votes Grid */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
              MP Voting Stances
            </h3>

            {/* Search Field */}
            {mpVotes.length > 0 && (
              <div className="mb-6">
                <div className="relative">
                  {/* Search Icon */}
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
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
                    type="text"
                    placeholder="Search by MP name or district"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-11 ${searchQuery ? 'pr-8' : 'pr-4'} py-1.5 rounded-full text-sm focus:outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 border transition-all duration-200 border-gray-300 dark:border-slate-600 focus:border-gray-300 dark:focus:border-slate-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400`}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors"
                      aria-label="Clear search"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {mpVotes.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No votes recorded for this bill.</p>
            ) : filteredMpVotes.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">No MPs match your search.</p>
            ) : (
              <div className="space-y-8">
                {voteTypeOrder.map((voteType) => {
                  const parties = grouped[voteType];
                  const partyNames = Object.keys(parties).sort();
                  
                  if (partyNames.length === 0) return null;

                  return (
                    <div key={voteType} className="space-y-4">
                      <div className="flex items-center gap-3">
                        <h4 className={`text-base font-semibold px-3 py-1 rounded border ${getVoteTypeColor(voteType)}`}>
                          {getVoteTypeLabel(voteType)} ({partyNames.reduce((sum, party) => sum + parties[party].length, 0)})
                        </h4>
                      </div>

                      {/* Group by party */}
                      {partyNames.map((partyName) => {
                        const mps = parties[partyName];
                        const partyColors = getPartyColors(partyName);
                        const isCollapsed = isPartyCollapsed(voteType, partyName);
                        
                        return (
                          <div key={partyName} className="space-y-2">
                            {/* Party Header - Fully colored and clickable */}
                            <button
                              onClick={() => toggleParty(voteType, partyName)}
                              className="w-full px-4 py-2 rounded-lg transition-all hover:opacity-90"
                              style={{
                                backgroundColor: partyColors.primary,
                                color: partyColors.white || '#FFFFFF'
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">
                                    {partyName || 'Independent'}
                                  </span>
                                  <svg
                                    className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                                <span className="text-xs opacity-90">
                                  {mps.length} {mps.length === 1 ? 'MP' : 'MPs'}
                                </span>
                              </div>
                            </button>

                            {/* MPs Grid - Collapsible */}
                            {!isCollapsed && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 ml-4">
                                {mps.map((mp) => (
                                  <Link
                                    key={mp.mp_id}
                                    href={`/mp/${encodeURIComponent(mp.district_name)}`}
                                    className="px-3 py-2 rounded border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                                  >
                                    {mp.photo_url && (
                                      <img
                                        src={mp.photo_url}
                                        alt={mp.mp_name}
                                        className="w-10 h-10 rounded object-cover flex-shrink-0"
                                        onError={(e) => {
                                          // Hide image if it fails to load
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {mp.mp_name}
                                      </div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        {mp.district_name}
                                      </div>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

