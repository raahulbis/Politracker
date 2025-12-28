'use client';

import { useState } from 'react';
import type { PartyColors } from '@/lib/utils/party-colors';

interface MPExpenses {
  total_staff_salaries: number;
  total_travel: number;
  total_hospitality: number;
  total_contracts: number;
  processedQuarters?: Array<{
    year: number;
    quarter_number: number;
    quarter: string;
  }>;
}

interface MPExpensesProps {
  expenses: MPExpenses;
  partyColors: PartyColors;
}

export default function MPExpenses({ expenses, partyColors }: MPExpensesProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const expenseItems = [
    {
      label: 'Staff Salaries',
      value: expenses.total_staff_salaries,
      description: 'Total staff salary expenses across all quarters',
      color: '#3B82F6', // Blue - professional, stable
      colorLight: '#DBEAFE', // Light blue for backgrounds
    },
    {
      label: 'Travel',
      value: expenses.total_travel,
      description: 'Total travel expenses across all quarters',
      color: '#14B8A6', // Teal - movement, fresh
      colorLight: '#CCFBF1', // Light teal for backgrounds
    },
    {
      label: 'Hospitality',
      value: expenses.total_hospitality,
      description: 'Total hospitality expenses across all quarters',
      color: '#F59E0B', // Amber - warm, social
      colorLight: '#FEF3C7', // Light amber for backgrounds
    },
    {
      label: 'Contracts',
      value: expenses.total_contracts,
      description: 'Total contract expenses across all quarters',
      color: '#8B5CF6', // Purple - business, formal
      colorLight: '#EDE9FE', // Light purple for backgrounds
    },
  ];

  const totalExpenses = expenseItems.reduce((sum, item) => sum + item.value, 0);

  // Calculate percentages
  const expenseItemsWithPercentage = expenseItems.map(item => ({
    ...item,
    percentage: totalExpenses > 0 ? (item.value / totalExpenses) * 100 : 0,
  }));

  // Format timeframe as pill: FY 2026–2027 • Q1–Q2
  const formatTimeframePill = () => {
    if (!expenses.processedQuarters || expenses.processedQuarters.length === 0) {
      return null;
    }

    // Group by fiscal year (April to March)
    const fiscalYearMap = new Map<string, Set<number>>();
    
    expenses.processedQuarters.forEach((q) => {
      // Canadian fiscal year runs from April 1 to March 31
      // Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
      let fiscalYearKey: string;
      if (q.quarter_number === 4) {
        fiscalYearKey = `${q.year - 1}-${q.year}`;
      } else {
        fiscalYearKey = `${q.year}-${q.year + 1}`;
      }
      
      if (!fiscalYearMap.has(fiscalYearKey)) {
        fiscalYearMap.set(fiscalYearKey, new Set());
      }
      fiscalYearMap.get(fiscalYearKey)!.add(q.quarter_number);
    });

    // Get the most recent fiscal year
    const fiscalYearEntries = Array.from(fiscalYearMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0])); // Most recent first
    
    if (fiscalYearEntries.length === 0) return null;

    const [fiscalYear, quarters] = fiscalYearEntries[0];
    const quarterList = Array.from(quarters)
      .sort((a, b) => a - b)
      .map(q => `Q${q}`)
      .join('–');
    
    return `FY ${fiscalYear} • ${quarterList}`;
  };

  const timeframePill = formatTimeframePill();

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
          {timeframePill && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
              {timeframePill}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode('chart')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'chart'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Chart view"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span>Chart</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Table view"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span>Table</span>
          </button>
        </div>
      </div>

      {viewMode === 'chart' ? (
        /* Bar Chart View */
        <div className="space-y-4">
          {expenseItemsWithPercentage.map((item) => (
            <div key={item.label} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-700">{item.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(item.value)}
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-8 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full transition-all rounded"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
          {/* Total */}
          <div className="pt-4 mt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-gray-900">Total Expenses</span>
              <span className="text-base font-semibold text-gray-900 tabular-nums">
                {formatCurrency(totalExpenses)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Table View */
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-4 text-sm font-semibold text-gray-700">Category</th>
                <th className="text-right py-2.5 px-4 text-sm font-semibold text-gray-700">Amount</th>
                <th className="text-right py-2.5 px-4 text-sm font-semibold text-gray-700">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {expenseItemsWithPercentage.map((item, index) => (
                <tr
                  key={item.label}
                  className="border-b border-gray-200 transition-colors"
                  style={{
                    backgroundColor: index % 2 === 0 ? 'white' : item.colorLight,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = item.colorLight;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : item.colorLight;
                  }}
                >
                  <td className="py-2.5 px-4 text-sm text-gray-700 leading-relaxed">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.label}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right text-sm font-semibold text-gray-900 tabular-nums">
                    {formatCurrency(item.value)}
                  </td>
                  <td className="py-2.5 px-4 text-right text-sm text-gray-600 tabular-nums">
                    {item.percentage.toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td className="py-3 px-4 text-base font-semibold text-gray-900">Total Expenses</td>
                <td className="py-3 px-4 text-right text-base font-semibold text-gray-900 tabular-nums" colSpan={2}>
                  {formatCurrency(totalExpenses)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
