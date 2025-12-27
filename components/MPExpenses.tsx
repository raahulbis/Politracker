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
    },
    {
      label: 'Travel',
      value: expenses.total_travel,
      description: 'Total travel expenses across all quarters',
    },
    {
      label: 'Hospitality',
      value: expenses.total_hospitality,
      description: 'Total hospitality expenses across all quarters',
    },
    {
      label: 'Contracts',
      value: expenses.total_contracts,
      description: 'Total contract expenses across all quarters',
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
        <button
          onClick={() => setViewMode(viewMode === 'chart' ? 'table' : 'chart')}
          className="text-sm font-medium hover:underline transition-colors"
          style={{ color: partyColors.primary }}
        >
          {viewMode === 'chart' ? 'View table' : 'View chart'}
        </button>
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
                  className="h-full bg-gray-300 group-hover:bg-gray-400 transition-colors rounded"
                  style={{
                    width: `${item.percentage}%`,
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
                  className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  }`}
                  style={{
                    backgroundColor: undefined, // Will use hover state
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = `${partyColors.primary}08`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#F9FAFB';
                  }}
                >
                  <td className="py-2.5 px-4 text-sm text-gray-700 leading-relaxed">
                    {item.label}
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
