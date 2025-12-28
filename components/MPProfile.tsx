'use client';

import { useState } from 'react';
import type { MP, PartyLoyaltyStats, MotionBreakdown, VotingRecord } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';
import { getPartyLogo } from '@/lib/utils/party-logos';
import Link from 'next/link';
import KPITile from './KPITile';

interface MPProfileProps {
  mp: MP;
  partyColors: PartyColors;
  expenses?: {
    total_staff_salaries: number;
    total_travel: number;
    total_hospitality: number;
    total_contracts: number;
  } | null;
  partyLoyalty?: PartyLoyaltyStats | null;
  motions?: MotionBreakdown | null;
  votingRecord?: VotingRecord | null;
}

export default function MPProfile({ 
  mp, 
  partyColors,
  expenses,
  partyLoyalty,
  motions,
  votingRecord
}: MPProfileProps) {
  const [emailCopied, setEmailCopied] = useState(false);
  const [phoneCopied, setPhoneCopied] = useState(false);
  const salary = mp.salary || 209800;
  const partyLogo = getPartyLogo(mp.party_name);
  
  const handleCopyEmail = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (mp.email) {
      try {
        await navigator.clipboard.writeText(mp.email);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy email:', err);
      }
    }
  };

  const handleCopyPhone = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (mp.phone) {
      try {
        await navigator.clipboard.writeText(mp.phone);
        setPhoneCopied(true);
        setTimeout(() => setPhoneCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy phone:', err);
      }
    }
  };

  // Calculate KPI values
  const totalExpenses = expenses 
    ? expenses.total_staff_salaries + expenses.total_travel + expenses.total_hospitality + expenses.total_contracts
    : 0;
  
  const partyLineVoting = partyLoyalty ? partyLoyalty.loyalty_percentage : null;
  const billsSponsored = motions ? motions.bills_sponsored : null;
  const votesRecorded = votingRecord ? votingRecord.total_votes : null;

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };
  
  return (
    <>
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/"
          className="text-gray-600 hover:text-gray-900 transition-colors text-sm inline-flex items-center gap-1"
        >
          ← Search
        </Link>
      </div>

      {/* Hero Section */}
      <div className="card">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-center lg:items-start">
          {/* Left: Photo + Name + Riding */}
          <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0 w-full lg:w-auto">
            {mp.photo_url && (
              <div className="flex-shrink-0">
                <img
                  src={mp.photo_url}
                  alt={mp.name}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded object-cover"
                />
              </div>
            )}
            
            <div className="flex-1 min-w-0 text-center lg:text-left">
              <h1 className="text-3xl font-semibold text-gray-900 break-words leading-tight mb-1">
                {mp.name}
              </h1>
              <p className="text-base text-gray-600 break-words leading-relaxed">
                {mp.district_name}
              </p>
              {partyLogo && (
                <div className="mt-1 mb-1">
                  <img
                    src={partyLogo}
                    alt={mp.party_name || 'Party logo'}
                    className="h-5 w-auto inline-block"
                  />
                </div>
              )}
              {mp.parliamentary_positions && mp.parliamentary_positions.length > 0 && (
                <div className="mt-1">
                  {mp.parliamentary_positions
                    .filter(pos => pos.title && (!pos.to_date_time || pos.to_date_time === null))
                    .map((pos, index) => (
                      <p key={index} className="text-sm text-gray-600 break-words leading-relaxed">
                        {pos.title}
                      </p>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: KPI Tiles */}
          <div className="flex-1 w-full lg:w-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-stretch">
            <KPITile
              label="Salary"
              value={formatCurrency(salary)}
              timeframe="Annual"
              tooltip="Member of Parliament base salary per year"
            />
            
            {expenses && totalExpenses > 0 && (
              <KPITile
                label="Total Spend"
                value={formatCurrency(totalExpenses)}
                timeframe="FY to date"
                tooltip="Total expenses including staff salaries, travel, hospitality, and contracts for the current fiscal year"
              />
            )}
            
            {partyLineVoting !== null && (
              <KPITile
                label="Party-line Voting"
                value={`${partyLineVoting.toFixed(1)}%`}
                timeframe="This session"
                tooltip="Percentage of votes where this MP voted with their party's position"
              />
            )}
            
            {billsSponsored !== null && (
              <KPITile
                label="Bills Sponsored"
                value={billsSponsored}
                timeframe="This session"
                tooltip="Number of bills this MP has sponsored (as primary sponsor) in the current parliamentary session"
              />
            )}
            
            {votesRecorded !== null && (
              <KPITile
                label="Votes Recorded"
                value={votesRecorded}
                timeframe="This session"
                tooltip="Total number of votes recorded for this MP in the current parliamentary session"
              />
            )}
          </div>
        </div>

        {/* Contact Information - Quiet styling */}
        {(mp.email || mp.phone || mp.url) && (
          <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-4 sm:gap-5 text-sm">
              {/* Primary: Website */}
              {mp.url && (
                <a
                  href={mp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-900 hover:text-gray-700 font-medium hover:underline transition-colors"
                >
                  Visit Website
                </a>
              )}

              {/* Secondary: Email */}
              {mp.email && (
                <div className="flex items-center gap-2 group">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600 group-hover:text-gray-900 transition-colors">
                    {mp.email}
                  </span>
                  <button
                    onClick={handleCopyEmail}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-all p-1 rounded hover:bg-gray-100 flex-shrink-0 ml-1"
                    title={emailCopied ? 'Copied!' : 'Copy email'}
                    aria-label="Copy email"
                  >
                    {emailCopied ? (
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-xs text-gray-500">Copy</span>
                    )}
                  </button>
                </div>
              )}

              {/* Secondary: Phone */}
              {mp.phone && (
                <div className="flex items-center gap-2 group">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span className="text-gray-600 group-hover:text-gray-900 transition-colors">
                    {mp.phone}
                  </span>
                  <button
                    onClick={handleCopyPhone}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-all p-1 rounded hover:bg-gray-100 flex-shrink-0 ml-1"
                    title={phoneCopied ? 'Copied!' : 'Copy phone'}
                    aria-label="Copy phone"
                  >
                    {phoneCopied ? (
                      <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className="text-xs text-gray-500">Copy</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
