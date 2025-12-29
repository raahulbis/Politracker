/**
 * Party branding colors for Canadian political parties
 */

export interface PartyColors {
  primary: string;
  secondary?: string;
  accent?: string;
  white: string;
}

const partyColorMap: { [key: string]: PartyColors } = {
  // Liberal Party of Canada
  'liberal': {
    primary: '#D71920',
    accent: '#A4161A',
    white: '#FFFFFF',
  },
  'liberal party': {
    primary: '#D71920',
    accent: '#A4161A',
    white: '#FFFFFF',
  },
  'liberal party of canada': {
    primary: '#D71920',
    accent: '#A4161A',
    white: '#FFFFFF',
  },
  
  // Conservative Party of Canada
  'conservative': {
    primary: '#002F6C',
    secondary: '#0055A5',
    white: '#FFFFFF',
  },
  'conservative party': {
    primary: '#002F6C',
    secondary: '#0055A5',
    white: '#FFFFFF',
  },
  'conservative party of canada': {
    primary: '#002F6C',
    secondary: '#0055A5',
    white: '#FFFFFF',
  },
  
  // New Democratic Party (NDP)
  'ndp': {
    primary: '#F37021',
    accent: '#3A3A3A',
    white: '#FFFFFF',
  },
  'new democratic party': {
    primary: '#F37021',
    accent: '#3A3A3A',
    white: '#FFFFFF',
  },
  'new democratic party of canada': {
    primary: '#F37021',
    accent: '#3A3A3A',
    white: '#FFFFFF',
  },
  
  // Bloc Québécois
  'bloc québécois': {
    primary: '#008AC9',
    secondary: '#7BC6E6',
    white: '#FFFFFF',
  },
  'bloc quebecois': {
    primary: '#008AC9',
    secondary: '#7BC6E6',
    white: '#FFFFFF',
  },
  'bloc': {
    primary: '#008AC9',
    secondary: '#7BC6E6',
    white: '#FFFFFF',
  },
  
  // Green Party of Canada
  'green party': {
    primary: '#3D9B35',
    secondary: '#A6CE39',
    white: '#FFFFFF',
  },
  'green party of canada': {
    primary: '#3D9B35',
    secondary: '#A6CE39',
    white: '#FFFFFF',
  },
  'green': {
    primary: '#3D9B35',
    secondary: '#A6CE39',
    white: '#FFFFFF',
  },
};

/**
 * Get party colors based on party name
 * Returns default colors if party not found
 */
export function getPartyColors(partyName: string | null | undefined): PartyColors {
  if (!partyName) {
    return {
      primary: '#6B7280', // Default gray
      white: '#FFFFFF',
    };
  }

  const normalizedPartyName = partyName.toLowerCase().trim();
  return partyColorMap[normalizedPartyName] || {
    primary: '#6B7280', // Default gray
    white: '#FFFFFF',
  };
}



