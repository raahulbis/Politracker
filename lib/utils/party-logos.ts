/**
 * Party logo paths - using local PNG files
 * Logos are stored in /public/images/party-logos/
 * Downloaded from Wikimedia Commons
 */

export const PARTY_LOGOS: Record<string, string> = {
  'Liberal': '/images/party-logos/liberal.png',
  'Liberal Party': '/images/party-logos/liberal.png',
  'Liberal Party of Canada': '/images/party-logos/liberal.png',
  
  'Conservative': '/images/party-logos/conservative.png',
  'Conservative Party': '/images/party-logos/conservative.png',
  'Conservative Party of Canada': '/images/party-logos/conservative.png',
  
  'NDP': '/images/party-logos/ndp.png',
  'New Democratic Party': '/images/party-logos/ndp.png',
  'New Democratic Party of Canada': '/images/party-logos/ndp.png',
  
  'Bloc Québécois': '/images/party-logos/bloc-quebecois.png',
  'Bloc': '/images/party-logos/bloc-quebecois.png',
  
  'Green Party': '/images/party-logos/green-party.png',
  'Green Party of Canada': '/images/party-logos/green-party.png',
};

/**
 * Normalize party name for logo lookup (handles variations)
 */
function normalizePartyNameForLogo(partyName: string): string {
  const normalized = partyName.trim();
  
  // Check for exact match first
  if (PARTY_LOGOS[normalized]) {
    return normalized;
  }
  
  // Handle common variations
  const lower = normalized.toLowerCase();
  
  if (lower.includes('liberal') || lower === 'lib') {
    return 'Liberal';
  }
  if (lower.includes('conservative') || lower === 'cpc') {
    return 'Conservative';
  }
  if (lower.includes('ndp') || lower.includes('new democratic')) {
    return 'NDP';
  }
  if (lower.includes('bloc') || lower.includes('quebecois')) {
    return 'Bloc Québécois';
  }
  if (lower.includes('green')) {
    return 'Green Party';
  }
  
  return normalized;
}

/**
 * Get party logo URL for a given party name
 * Handles variations in party name formatting
 */
export function getPartyLogo(partyName: string | null | undefined): string | null {
  if (!partyName) {
    return null;
  }
  
  const normalized = normalizePartyNameForLogo(partyName);
  return PARTY_LOGOS[normalized] || null;
}

