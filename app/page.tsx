'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import SearchForm from '@/components/SearchForm';
import ThemeToggle from '@/components/ThemeToggle';
import type { MP } from '@/types';
import { getPartyColors } from '@/lib/utils/party-colors';

interface Stats {
  mpsPerParty: Array<{ party_name: string; count: number }>;
  expensesByParty: Array<{ party_name: string; total_expenses: number }>;
  biggestSpender: {
    id: number;
    name: string;
    party_name: string | null;
    district_name: string;
    total_expenses: number;
  } | null;
  processedQuarters?: Array<{
    year: number;
    quarter_number: number;
    quarter: string;
  }>;
  salariesByParty: Array<{ party_name: string; total_salary: number }>;
  highestPaid: {
    id: number;
    name: string;
    party_name: string | null;
    district_name: string;
    salary: number;
  } | null;
  billStats: {
    total_bills: number;
    passed_bills: number;
    law_bills: number;
    outside_order_precedence: number;
    at_house: number;
    at_senate: number;
    still_in_reading: number;
  };
  recentBills: Array<{
    bill_number: string;
    title: string;
    introduced_date: string;
    status_code: string | null;
    status: string | null;
    law: boolean | null;
    session: string | null;
    sponsor_politician: string | null;
    sponsor_party: string | null;
    category_name: string | null;
  }>;
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Format processed quarters information for fiscal year display
  const formatProcessedQuarters = (quarters?: Array<{ year: number; quarter_number: number; quarter: string }>) => {
    if (!quarters || quarters.length === 0) {
      return null;
    }

    // Group by fiscal year (April to March)
    // Fiscal year is the year that contains Q4 (Jan-Mar)
    const fiscalYearMap = new Map<string, Set<number>>();
    
    quarters.forEach((q) => {
      // Canadian fiscal year runs from April 1 to March 31
      // Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
      // If quarter is 1-3, fiscal year is year-(year+1)
      // If quarter is 4, fiscal year is (year-1)-year
      let fiscalYearKey: string;
      if (q.quarter_number === 4) {
        // Q4 is Jan-Mar, so it belongs to the previous fiscal year
        fiscalYearKey = `${q.year - 1}-${q.year}`;
      } else {
        // Q1-Q3 belong to the fiscal year starting in this year
        fiscalYearKey = `${q.year}-${q.year + 1}`;
      }
      
      if (!fiscalYearMap.has(fiscalYearKey)) {
        fiscalYearMap.set(fiscalYearKey, new Set());
      }
      fiscalYearMap.get(fiscalYearKey)!.add(q.quarter_number);
    });

    // Format the output
    const fiscalYearEntries = Array.from(fiscalYearMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    return fiscalYearEntries.map(([fiscalYear, quarters]) => {
      const quarterList = Array.from(quarters)
        .sort((a, b) => a - b)
        .map(q => `Q${q}`)
        .join(', ');
      return `FY ${fiscalYear}: ${quarterList}`;
    }).join('; ');
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch statistics:', err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  const handleSearch = async (query: string, isNameSearch: boolean) => {
    setLoading(true);
    setError(null);

    try {
      const searchParam = isNameSearch ? 'name' : 'postalCode';
      const response = await fetch(`/api/mp/search?${searchParam}=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to find MP');
      }

      const data = await response.json();
      
      // Handle multiple results (name search can return multiple MPs)
      if (data.results && Array.isArray(data.results)) {
        // If multiple results, navigate to the first one
        // In the future, we could show a selection UI
        if (data.results.length > 0) {
          const mp = data.results[0];
          const mpId = mp.district_name 
            ? encodeURIComponent(mp.district_name)
            : mp.district_id 
            ? mp.district_id 
            : encodeURIComponent(mp.name);
          router.push(`/mp/${mpId}`);
        } else {
          throw new Error('No MPs found');
        }
      } else {
        // Single result (either from postal code or single name match)
        const mp: MP = data;
        const mpId = mp.district_name 
          ? encodeURIComponent(mp.district_name)
          : mp.district_id 
          ? mp.district_id 
          : encodeURIComponent(mp.name);
        router.push(`/mp/${mpId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6">
          <div className="flex justify-end mb-4">
            <ThemeToggle />
          </div>
          
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              PoliTracker
            </h1>
            <p className="text-lg sm:text-xl text-gray-700 dark:text-gray-300 mb-8">
              See what your MP voted on, sponsored, and spent—fast.
            </p>
            
            <div className="max-w-2xl mx-auto">
              <SearchForm onSearch={handleSearch} loading={loading} />
              
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Try: K1A 0A6 or Mark Carney
              </p>
              
              {error && (
                <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-800 dark:text-red-300">{error}</p>
                </div>
              )}
            </div>
          </div>

          {!loadingStats && stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <StatsCard
                title="MPs per Party"
                content={
                  <div className="space-y-2">
                    {stats.mpsPerParty.map((party) => {
                      const partyColors = getPartyColors(party.party_name);
                      const maxCount = Math.max(...stats.mpsPerParty.map(p => p.count));
                      const percentage = (party.count / maxCount) * 100;
                      return (
                        <div key={party.party_name} className="relative flex justify-between items-center py-1 px-2 -mx-2 rounded">
                          {/* Micro bar background */}
                          <div 
                            className="absolute inset-0 rounded"
                            style={{ 
                              backgroundColor: `${partyColors.primary}10`,
                              width: `${percentage}%`,
                            }}
                          />
                          <span 
                            className="relative inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium z-10"
                            style={{ 
                              backgroundColor: `${partyColors.primary}15`,
                              color: partyColors.primary
                            }}
                          >
                            {party.party_name}
                          </span>
                          <span className="relative text-sm font-semibold text-gray-900 dark:text-gray-100 z-10">
                            {party.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                }
              />
              <StatsCard
                title={
                  <div>
                    <span>Total Expenses by Party</span>
                    {stats.processedQuarters && formatProcessedQuarters(stats.processedQuarters) && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-2 font-normal">
                        (to date - {formatProcessedQuarters(stats.processedQuarters)})
                      </span>
                    )}
                  </div>
                }
                content={
                  <div className="space-y-2">
                    {stats.expensesByParty.map((party) => {
                      const partyColors = getPartyColors(party.party_name);
                      const maxExpenses = Math.max(...stats.expensesByParty.map(p => p.total_expenses));
                      const percentage = (party.total_expenses / maxExpenses) * 100;
                      const { display, full } = formatCurrencyAbbreviated(party.total_expenses);
                      return (
                        <div key={party.party_name} className="relative flex justify-between items-center py-1 px-2 -mx-2 rounded">
                          {/* Micro bar background */}
                          <div 
                            className="absolute inset-0 rounded"
                            style={{ 
                              backgroundColor: `${partyColors.primary}10`,
                              width: `${percentage}%`,
                            }}
                          />
                          <span 
                            className="relative inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium z-10"
                            style={{ 
                              backgroundColor: `${partyColors.primary}15`,
                              color: partyColors.primary
                            }}
                          >
                            {party.party_name}
                          </span>
                          <span 
                            className="relative text-sm font-semibold text-gray-900 dark:text-gray-100 z-10 cursor-help"
                            title={full}
                          >
                            {display}
                          </span>
                        </div>
                      );
                    })}
                    {stats.expensesByParty.length > 0 && (
                      <>
                        <div className="border-t border-gray-300 dark:border-slate-600 my-2"></div>
                        <div className="flex justify-between items-center pt-1.5 px-2 -mx-2 rounded bg-gray-50 dark:bg-slate-700/50">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Total Expenses (All Parties)</span>
                          {(() => {
                            const total = stats.expensesByParty.reduce((sum, party) => sum + party.total_expenses, 0);
                            const { display, full } = formatCurrencyAbbreviated(total);
                            return (
                              <span 
                                className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-help"
                                title={full}
                              >
                                {display}
                              </span>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                }
              />
              <StatsCard
                title="MP Salaries by Party"
                content={
                  <div className="space-y-2">
                    {stats.salariesByParty.map((party) => {
                      const partyColors = getPartyColors(party.party_name);
                      const maxSalary = Math.max(...stats.salariesByParty.map(p => p.total_salary));
                      const percentage = (party.total_salary / maxSalary) * 100;
                      const { display, full } = formatCurrencyAbbreviated(party.total_salary);
                      return (
                        <div key={party.party_name} className="relative flex justify-between items-center py-1 px-2 -mx-2 rounded">
                          {/* Micro bar background */}
                          <div 
                            className="absolute inset-0 rounded"
                            style={{ 
                              backgroundColor: `${partyColors.primary}10`,
                              width: `${percentage}%`,
                            }}
                          />
                          <span 
                            className="relative inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium z-10"
                            style={{ 
                              backgroundColor: `${partyColors.primary}15`,
                              color: partyColors.primary
                            }}
                          >
                            {party.party_name}
                          </span>
                          <span 
                            className="relative text-sm font-semibold text-gray-900 dark:text-gray-100 z-10 cursor-help"
                            title={full}
                          >
                            {display}
                          </span>
                        </div>
                      );
                    })}
                    {stats.salariesByParty.length > 0 && (
                      <>
                        <div className="border-t border-gray-300 dark:border-slate-600 my-2"></div>
                        <div className="flex justify-between items-center pt-1.5 px-2 -mx-2 rounded bg-gray-50 dark:bg-slate-700/50">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Total Salaries (All Parties)</span>
                          {(() => {
                            const total = stats.salariesByParty.reduce((sum, party) => sum + party.total_salary, 0);
                            const { display, full } = formatCurrencyAbbreviated(total);
                            return (
                              <span 
                                className="text-sm font-bold text-gray-900 dark:text-gray-100 cursor-help"
                                title={full}
                              >
                                {display}
                              </span>
                            );
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                }
              />
            </div>
          )}

          {!loadingStats && stats && (
            <div className="card">
              {/* Bills This Session Stats */}
              <div className="mb-8">
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Bills This Session
                </h3>
                <BillStatsContent stats={stats.billStats} />
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 dark:border-slate-700 my-8"></div>

              {/* Recent Activity */}
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-6">
                  Recent Activity
                </h3>
                <RecentBillsContent bills={stats.recentBills} />
              </div>
            </div>
          )}

          {loadingStats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="card">
                  <div className="animate-pulse">
                    <div className="h-6 bg-gray-200 dark:bg-slate-700 rounded w-1/2 mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
                      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded"></div>
                      <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 mt-12">
        <div className="container mx-auto px-3 sm:px-4 py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © {new Date().getFullYear()} PoliTracker
              </p>
              <a
                href="https://buymeacoffee.com/raahulbis"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors hover:opacity-90"
                style={{ backgroundColor: '#FFDD00', color: '#000' }}
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M18.5 3H6c-1.1 0-2 .9-2 2v5.71c0 3.83 2.95 7.18 6.78 7.29 3.96.12 7.22-3.06 7.22-7v-1h.5c1.38 0 2.5-1.12 2.5-2.5S19.88 3 18.5 3zM16 5v3H6V5h10zm2.5 5H18V5h.5c.28 0 .5.22.5.5s-.22.5-.5.5zM4 19h16v2H4v-2z"/>
                </svg>
                Buy me a coffee
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md border border-gray-200 dark:border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {description}
      </p>
    </div>
  );
}

function StatsCard({ title, content }: { title: string | React.ReactNode; content: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-[15px] font-semibold text-gray-900 dark:text-gray-100 mb-6">
        {title}
      </h3>
      {content}
    </div>
  );
}

// Helper function to format currency with abbreviations (M for millions, K for thousands)
function formatCurrencyAbbreviated(amount: number): { display: string; full: string } {
  const full = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  
  if (amount >= 1000000) {
    const display = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(amount);
    return { display, full };
  } else if (amount >= 1000) {
    const display = new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: 'compact',
      compactDisplay: 'short',
    }).format(amount);
    return { display, full };
  }
  
  return { display: full, full };
}

function BiggestSpenderContent({ 
  spender 
}: { 
  spender: {
    id: number;
    name: string;
    party_name: string | null;
    district_name: string;
    total_expenses: number;
  }
}) {
  const partyColors = getPartyColors(spender.party_name);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-300">Name</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{spender.name}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-300">District</span>
        <span className="text-sm text-gray-900 dark:text-gray-100">{spender.district_name}</span>
      </div>
      {spender.party_name && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700 dark:text-gray-300">Party</span>
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ 
              backgroundColor: `${partyColors.primary}15`,
              color: partyColors.primary
            }}
          >
            {spender.party_name}
          </span>
        </div>
      )}
      <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Expenses</span>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(spender.total_expenses)}
        </span>
      </div>
    </div>
  );
}

function HighestPaidContent({ 
  mp 
}: { 
  mp: {
    id: number;
    name: string;
    party_name: string | null;
    district_name: string;
    salary: number;
  }
}) {
  const partyColors = getPartyColors(mp.party_name);
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-300">Name</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{mp.name}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-700 dark:text-gray-300">District</span>
        <span className="text-sm text-gray-900 dark:text-gray-100">{mp.district_name}</span>
      </div>
      {mp.party_name && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-700 dark:text-gray-300">Party</span>
          <span 
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ 
              backgroundColor: `${partyColors.primary}15`,
              color: partyColors.primary
            }}
          >
            {mp.party_name}
          </span>
        </div>
      )}
        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-slate-700">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Salary</span>
        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {new Intl.NumberFormat('en-CA', {
            style: 'currency',
            currency: 'CAD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(mp.salary)}
        </span>
      </div>
    </div>
  );
}

function BillStatsContent({ 
  stats 
}: { 
  stats: {
    total_bills: number;
    passed_bills: number;
    law_bills: number;
    outside_order_precedence: number;
    at_house: number;
    at_senate: number;
    still_in_reading: number;
  }
}) {
  const atHousePercentage = stats.total_bills > 0 
    ? (stats.at_house / stats.total_bills) * 100
    : 0;
  const atSenatePercentage = stats.total_bills > 0 
    ? (stats.at_senate / stats.total_bills) * 100
    : 0;
  const stillInReadingPercentage = stats.total_bills > 0 
    ? (stats.still_in_reading / stats.total_bills) * 100
    : 0;
  const outsideOrderPrecedencePercentage = stats.total_bills > 0 
    ? (stats.outside_order_precedence / stats.total_bills) * 100
    : 0;
  const lawPercentage = stats.total_bills > 0 
    ? (stats.law_bills / stats.total_bills) * 100
    : 0;
  
  return (
    <div className="space-y-3">
      {/* Big number */}
      <div>
        <div className="text-[28px] font-bold text-gray-900 dark:text-gray-100">{stats.total_bills}</div>
      </div>
      
      {/* Stacked bar */}
      <div className="space-y-3">
        <div className="flex-1">
          <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded overflow-hidden flex">
            {/* Outside Order Precedence */}
            {outsideOrderPrecedencePercentage > 0 && (
              <div 
                className="h-full flex-shrink-0"
                style={{ width: `${outsideOrderPrecedencePercentage}%`, backgroundColor: '#94A3B8' }}
              />
            )}
            {/* At House */}
            {atHousePercentage > 0 && (
              <div 
                className="h-full flex-shrink-0"
                style={{ width: `${atHousePercentage}%`, backgroundColor: '#2563EB' }}
              />
            )}
            {/* At Senate */}
            {atSenatePercentage > 0 && (
              <div 
                className="h-full flex-shrink-0"
                style={{ width: `${atSenatePercentage}%`, backgroundColor: '#7C3AED' }}
              />
            )}
            {/* Became Law */}
            {lawPercentage > 0 && (
              <div 
                className="h-full flex-shrink-0"
                style={{ width: `${lawPercentage}%`, backgroundColor: '#16A34A' }}
              />
            )}
            {/* Pro Forma (other statuses) */}
            {stillInReadingPercentage > 0 && (
              <div 
                className="h-full flex-shrink-0"
                style={{ width: `${stillInReadingPercentage}%`, backgroundColor: '#F59E0B' }}
              />
            )}
          </div>
        </div>
        
        {/* Legend rows: 3-column grid (label left, count right, % right muted) */}
        <div className="space-y-2 text-sm">
          {/* Outside Order of Precedence */}
          {stats.outside_order_precedence > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#94A3B8' }}></div>
                <span className="text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  Outside Order of Precedence
                  <span 
                    className="text-gray-400 dark:text-gray-500 cursor-help"
                    title="Bills not selected to be debated in the House (Order of Precedence)."
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                  </span>
                </span>
              </div>
              <span className="text-gray-900 dark:text-gray-100 font-medium text-right">{stats.outside_order_precedence}</span>
              <span className="text-gray-500 dark:text-gray-400 text-right w-12">{outsideOrderPrecedencePercentage.toFixed(1)}%</span>
            </div>
          )}
          
          {/* At House */}
          {stats.at_house > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#2563EB' }}></div>
                <span className="text-gray-700 dark:text-gray-300">At House</span>
              </div>
              <span className="text-gray-900 dark:text-gray-100 font-medium text-right">{stats.at_house}</span>
              <span className="text-gray-500 dark:text-gray-400 text-right w-12">{atHousePercentage.toFixed(1)}%</span>
            </div>
          )}
          
          {/* At Senate */}
          {stats.at_senate > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#7C3AED' }}></div>
                <span className="text-gray-700 dark:text-gray-300">At Senate</span>
              </div>
              <span className="text-gray-900 dark:text-gray-100 font-medium text-right">{stats.at_senate}</span>
              <span className="text-gray-500 dark:text-gray-400 text-right w-12">{atSenatePercentage.toFixed(1)}%</span>
            </div>
          )}
          
          {/* Became law */}
          {stats.law_bills > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#16A34A' }}></div>
                <span className="text-gray-700 dark:text-gray-300">Became law</span>
              </div>
              <span className="text-gray-900 dark:text-gray-100 font-medium text-right">{stats.law_bills}</span>
              <span className="text-gray-500 dark:text-gray-400 text-right w-12">{lawPercentage.toFixed(1)}%</span>
            </div>
          )}
          
          {/* Pro Forma */}
          {stats.still_in_reading > 0 && (
            <div className="grid grid-cols-[1fr_auto_auto] gap-4 items-center">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#F59E0B' }}></div>
                <span className="text-gray-700 dark:text-gray-300">Pro Forma</span>
              </div>
              <span className="text-gray-900 dark:text-gray-100 font-medium text-right">{stats.still_in_reading}</span>
              <span className="text-gray-500 dark:text-gray-400 text-right w-12">{stillInReadingPercentage.toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentBillsContent({ 
  bills 
}: { 
  bills: Array<{
    bill_number: string;
    title: string;
    introduced_date: string;
    status_code: string | null;
    status: string | null;
    law: boolean | null;
    session: string | null;
    sponsor_politician: string | null;
    sponsor_party: string | null;
    category_name: string | null;
  }>
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Filter states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get unique categories
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    bills.forEach(bill => {
      if (bill.category_name) {
        categorySet.add(bill.category_name);
      }
    });
    return Array.from(categorySet).sort();
  }, [bills]);

  // Get unique statuses for filter
  const statuses = useMemo(() => {
    const statusSet = new Set<string>();
    bills.forEach(bill => {
      if (bill.law === true) {
        statusSet.add('Law');
      } else if (bill.status_code === 'RoyalAssentGiven') {
        statusSet.add('Royal Assent');
      } else if (bill.status_code) {
        const statusText = bill.status_code
          .replace(/([A-Z])/g, ' $1')
          .trim()
          .replace(/^./, str => str.toUpperCase());
        statusSet.add(statusText);
      }
    });
    return Array.from(statusSet).sort();
  }, [bills]);

  // Get unique parties for filter
  const parties = useMemo(() => {
    const partySet = new Set<string>();
    bills.forEach(bill => {
      if (bill.sponsor_party) {
        partySet.add(bill.sponsor_party);
      }
    });
    return Array.from(partySet).sort();
  }, [bills]);

  // Filter bills
  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      // Category filter
      if (selectedCategory !== 'all' && bill.category_name !== selectedCategory) {
        return false;
      }
      
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'Law' && bill.law !== true) {
          return false;
        } else if (statusFilter === 'Royal Assent' && bill.status_code !== 'RoyalAssentGiven') {
          return false;
        } else if (statusFilter !== 'Law' && statusFilter !== 'Royal Assent') {
          const billStatusText = bill.status_code
            ? bill.status_code.replace(/([A-Z])/g, ' $1').trim().replace(/^./, str => str.toUpperCase())
            : '';
          if (billStatusText !== statusFilter) {
            return false;
          }
        }
      }
      
      // Party filter
      if (partyFilter !== 'all' && bill.sponsor_party !== partyFilter) {
        return false;
      }
      
      // Search filter (bill number or title)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const billMatch = bill.bill_number?.toLowerCase().includes(query);
        const titleMatch = bill.title?.toLowerCase().includes(query);
        if (!billMatch && !titleMatch) {
          return false;
        }
      }
      
      return true;
    });
  }, [bills, selectedCategory, statusFilter, partyFilter, searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredBills.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedBills = filteredBills.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  // Check if any filters are active
  const hasActiveFilters = selectedCategory !== 'all' || statusFilter !== 'all' || partyFilter !== 'all' || searchQuery.trim() !== '';

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategory('all');
    setStatusFilter('all');
    setPartyFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-CA', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusBadge = (bill: {
    status_code: string | null;
    status: string | null;
    law: boolean | null;
  }) => {
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
    
    // Format status code to be more readable
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
      // Truncate long status text
      const statusText = bill.status.length > 40 
        ? bill.status.substring(0, 40) + '...'
        : bill.status;
      
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200">
          {statusText}
        </span>
      );
    }
    
    return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400">
          Unknown
        </span>
    );
  };

  if (bills.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">No recent bills found.</p>
    );
  }

  return (
    <>
      {/* Compact Filter Bar */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown - Pill style */}
          <select
            id="bill-category-filter"
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              handleFilterChange();
            }}
            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>

          {/* Status Filter - Pill style */}
          <select
            id="bill-status-filter"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              handleFilterChange();
            }}
            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
          >
            <option value="all">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

          {/* Party Filter - Pill style */}
          <select
            id="bill-party-filter"
            value={partyFilter}
            onChange={(e) => {
              setPartyFilter(e.target.value);
              handleFilterChange();
            }}
            className="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
          >
            <option value="all">All Parties</option>
            {parties.map(party => (
              <option key={party} value={party}>{party}</option>
            ))}
          </select>

          {/* Search with clear icon - macOS Spotlight style */}
          <div className="flex-1 min-w-[200px] relative">
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
              id="bill-search"
              type="text"
              placeholder="Bill number or keyword"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                handleFilterChange();
              }}
              className={`w-full pl-11 ${searchQuery ? 'pr-8' : 'pr-4'} py-1.5 rounded-full text-sm focus:outline-none bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 border transition-all duration-200 border-gray-300 dark:border-slate-600 focus:border-gray-300 dark:focus:border-slate-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400`}
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  handleFilterChange();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none transition-colors"
                aria-label="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Clear Button - only shows when filters are active */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border border-gray-300 dark:border-slate-600 rounded-full hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Bills Feed */}
      <div className="space-y-0">
        {paginatedBills.length === 0 ? (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400">
            No bills match your filters.
          </div>
        ) : (
          paginatedBills.map((bill) => {
            // Construct LEGISinfo URL: https://www.parl.ca/legisinfo/en/bill/{session}/{bill_number}
            // Bill number needs to be lowercase in URL
            const billUrl = bill.session && bill.bill_number
              ? `https://www.parl.ca/legisinfo/en/bill/${bill.session}/${bill.bill_number.toLowerCase()}`
              : null;

            return (
              <div 
                key={`${bill.bill_number}-${bill.introduced_date}`}
                className="py-3 px-4 -mx-4 border-b border-gray-200 dark:border-slate-700 last:border-b-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors group"
                onClick={(e) => {
                  // Only navigate if not clicking on the Read button
                  if (billUrl && !(e.target as HTMLElement).closest('a')) {
                    window.open(billUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && billUrl && !(e.target as HTMLElement).closest('a')) {
                    e.preventDefault();
                    window.open(billUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
                role={billUrl ? "button" : undefined}
                tabIndex={billUrl ? 0 : undefined}
              >
                {/* Line 1: Bill number + Title (1-2 lines) + Read button */}
                <div className="flex items-start justify-between gap-4 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">
                        {bill.bill_number}
                      </span>
                    </div>
                    <h3 className="text-[15px] font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-relaxed">
                      {bill.title}
                    </h3>
                  </div>
                  {billUrl && (
                    <a
                      href={billUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-medium text-sm flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Read →
                    </a>
                  )}
                </div>

                {/* Line 2: Status pill • Category pills • Party pill • Date • Session */}
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600 dark:text-gray-400">
                  {getStatusBadge(bill)}
                  {bill.category_name && (
                    <>
                      <span>•</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                        {bill.category_name}
                      </span>
                    </>
                  )}
                  {bill.sponsor_party && (
                    <>
                      <span>•</span>
                      {(() => {
                        const partyColors = getPartyColors(bill.sponsor_party);
                        return (
                          <span 
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
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
                  <span>•</span>
                  <span>{formatDate(bill.introduced_date)}</span>
                  {bill.session && (
                    <>
                      <span>•</span>
                      <span>{bill.session}</span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Left: Page info */}
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Page {currentPage} of {totalPages}
              </div>

              {/* Middle: Show selector */}
              <div className="flex items-center gap-2">
                <label htmlFor="page-size" className="text-sm text-gray-600 dark:text-gray-400">
                  Show:
                </label>
                <select
                  id="page-size"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 appearance-none cursor-pointer"
                style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2rem' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            {/* Right: Previous/Next buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 ${
                  currentPage === 1
                    ? 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-50'
                    : 'bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-600 hover:border-gray-400 dark:hover:border-slate-500'
                }`}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                }`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

