// MP and Electoral District Types
export interface ElectoralDistrict {
  name: string;
  district_id: string;
  boundary_set_url?: string;
}

export interface CommitteeMemberRole {
  parliament_number?: number;
  session_number?: number;
  affiliation_role_name?: string;
  committee_name?: string;
  from_date_time?: string;
  to_date_time?: string | null;
}

export interface ParliamentaryAssociationRole {
  association_member_role_type?: string;
  title?: string;
  organization?: string;
}

export interface ParliamentaryPositionRole {
  title?: string;
  from_date_time?: string;
  to_date_time?: string | null;
}

export interface MP {
  id?: number;
  name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  photo_url?: string;
  party_name?: string;
  district_name: string;
  district_id?: string;
  elected_office: string;
  url?: string;
  source_url?: string;
  personal_url?: string;
  gender?: 'M' | 'F';
  committees?: CommitteeMemberRole[];
  associations?: ParliamentaryAssociationRole[];
  parliamentary_positions?: ParliamentaryPositionRole[];
  salary?: number;
  offices?: Array<{
    postal?: string;
    tel?: string;
    fax?: string;
    type?: string;
  }>;
  extra?: {
    [key: string]: any;
  };
}

// Voting Record Types
export interface Vote {
  id: string;
  date: string;
  bill_id?: number; // Foreign key to bills_motions table
  bill_number?: string;
  bill_title?: string;
  motion_title: string;
  vote_type: 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting';
  result: 'Agreed To' | 'Negatived' | 'Tie';
  party_position?: 'For' | 'Against' | 'Free Vote'; // Legacy field, kept for backward compatibility
  sponsor_party?: string; // Party that sponsored/introduced the bill
  category?: string; // Policy category name (e.g., "Economy & Finance")
}

export interface VotingRecord {
  mp_id: string;
  mp_name: string;
  total_votes: number;
  votes: Vote[];
}

// Party Loyalty Types
export interface PartyLoyaltyStats {
  mp_id: string;
  mp_name: string;
  party_name: string;
  total_votes: number;
  votes_with_party: number;
  votes_against_party: number;
  free_votes: number;
  abstained_paired_votes: number;
  loyalty_percentage: number;
  opposition_percentage: number;
  free_vote_percentage: number;
}

// Motion/Sponsorship Types
export interface Motion {
  id: string;
  number: string;
  title: string;
  type: 'Bill' | 'Motion' | 'Petition' | 'Question';
  status: string;
  introduced_date: string;
  sponsor_type: 'Sponsor' | 'Co-sponsor' | 'Seconder';
  description?: string;
  sponsor_party?: string; // Party name of the sponsor
  category?: string; // Policy category name (e.g., "Economy & Finance")
  url?: string;
}

export interface MotionBreakdown {
  mp_id: string;
  mp_name: string;
  total_motions: number;
  bills_sponsored: number;
  bills_co_sponsored: number;
  motions_sponsored: number;
  motions_co_sponsored: number;
  motions: Motion[];
}

// API Response Types (for House of Commons Open Data)
export interface CommonsAPIResponse {
  [key: string]: any;
}

