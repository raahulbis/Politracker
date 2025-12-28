'use client';

import type { CommitteeMemberRole } from '@/types';
import type { PartyColors } from '@/lib/utils/party-colors';

interface MPCommitteesProps {
  committees: CommitteeMemberRole[];
  partyColors: PartyColors;
}

export default function MPCommittees({ committees, partyColors }: MPCommitteesProps) {
  if (!committees || committees.length === 0) {
    return (
      <div className="card">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">Committees</h2>
        <p className="text-gray-600">No committee memberships found for this MP.</p>
      </div>
    );
  }

  // Format date for display
  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'Present';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  // Group committees by name to show current and past roles
  const groupedCommittees = committees.reduce((acc, committee) => {
    const committeeName = committee.committee_name || 'Unknown Committee';
    if (!acc[committeeName]) {
      acc[committeeName] = [];
    }
    acc[committeeName].push(committee);
    return acc;
  }, {} as Record<string, CommitteeMemberRole[]>);

  // Sort committees alphabetically
  const sortedCommitteeNames = Object.keys(groupedCommittees).sort();

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">
        Committees
      </h2>
      
      <div className="space-y-4 sm:space-y-6">
        {sortedCommitteeNames.map((committeeName) => {
          const roles = groupedCommittees[committeeName];
          const currentRole = roles.find(role => !role.to_date_time || role.to_date_time === null);
          const pastRoles = roles.filter(role => role.to_date_time && role.to_date_time !== null);

          return (
            <div
              key={committeeName}
              className="border border-gray-100 dark:border-slate-700 rounded-xl p-4 hover:border-gray-200 dark:hover:border-slate-600 transition-colors"
            >
              <h3 className="text-base font-semibold text-gray-900 mb-3 leading-relaxed">
                {committeeName}
              </h3>
              
              {currentRole && (
                <div className="mb-3 pb-3 border-b border-gray-100">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: `${partyColors.primary}15`,
                        color: partyColors.primary,
                      }}
                    >
                      {currentRole.affiliation_role_name || 'Member'}
                    </span>
                    <span className="text-xs sm:text-sm text-gray-500">
                      {currentRole.from_date_time ? formatDate(currentRole.from_date_time) : ''} - Present
                    </span>
                  </div>
                  {currentRole.parliament_number && (
                    <p className="text-xs text-gray-500">
                      Parliament {currentRole.parliament_number}
                      {currentRole.session_number && `, Session ${currentRole.session_number}`}
                    </p>
                  )}
                </div>
              )}

              {pastRoles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Previous Roles
                  </p>
                  {pastRoles.map((role, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      <span className="font-medium">
                        {role.affiliation_role_name || 'Member'}
                      </span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-gray-500">
                        {formatDate(role.from_date_time)} - {formatDate(role.to_date_time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

