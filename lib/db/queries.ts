import { queryOne, queryAll, queryRun, convertPlaceholders } from './database';
import type { MP, Vote, VotingRecord, CommitteeMemberRole } from '@/types';
import { normalizePostalCode } from '@/lib/utils/postal-code';

/**
 * Get postal code from cache (if not expired)
 */
export async function getPostalCodeFromCache(postalCode: string): Promise<{ district_name: string; fed_boundary_id?: string } | null> {
  const normalized = normalizePostalCode(postalCode);
  
  const sql = convertPlaceholders(`
    SELECT district_name, fed_boundary_id, expires_at
    FROM postal_code_cache
    WHERE postal_code = ? AND expires_at > NOW()
    LIMIT 1
  `);
  
  const cached = await queryOne<{ district_name: string; fed_boundary_id?: string; expires_at: string }>(sql, [normalized]);

  if (cached) {
    return {
      district_name: cached.district_name,
      fed_boundary_id: cached.fed_boundary_id,
    };
  }

  return null;
}

/**
 * Store postal code in cache with TTL (default 30 days)
 */
export async function cachePostalCode(
  postalCode: string,
  districtName: string,
  fedBoundaryId?: string,
  source: string = 'represent',
  ttlDays: number = 30
): Promise<void> {
  const normalized = normalizePostalCode(postalCode);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const sql = convertPlaceholders(`
    INSERT INTO postal_code_cache 
    (postal_code, district_name, fed_boundary_id, source, fetched_at, expires_at)
    VALUES (?, ?, ?, ?, NOW(), ?)
    ON CONFLICT (postal_code) DO UPDATE SET
      district_name = EXCLUDED.district_name,
      fed_boundary_id = EXCLUDED.fed_boundary_id,
      source = EXCLUDED.source,
      fetched_at = EXCLUDED.fetched_at,
      expires_at = EXCLUDED.expires_at
  `);
  
  await queryRun(sql, [normalized, districtName, fedBoundaryId || null, source, expiresAt.toISOString()]);
}

/**
 * Get MP by PersonId (external_id from Represent API)
 */
export async function getMPByPersonId(personId: string): Promise<MP | null> {
  const sql = convertPlaceholders('SELECT * FROM mps WHERE district_id = $1 LIMIT 1');
  const result = await queryOne<any>(sql, [personId]);
  return result ? mapMPFromDB(result) : null;
}

/**
 * Get MP by postal code from local database
 * This checks cache first, then falls back to manual mappings
 */
export async function getMPByPostalCode(postalCode: string): Promise<MP | null> {
  const normalized = normalizePostalCode(postalCode);

  // Step 1: Check cache first
  const cached = await getPostalCodeFromCache(normalized);
  if (cached) {
    // Find MP by district name from cache
    const sql = convertPlaceholders('SELECT * FROM mps WHERE district_name = $1 LIMIT 1');
    const result = await queryOne<any>(sql, [cached.district_name]);

    if (result) {
      return mapMPFromDB(result);
    }
  }

  // Step 2: Fall back to manual postal_code_mappings (backward compatibility)
  // First try to match by mp_id
  let sql = convertPlaceholders(`
    SELECT m.* 
    FROM mps m
    INNER JOIN postal_code_mappings pcm ON m.id = pcm.mp_id
    WHERE pcm.postal_code = $1
    LIMIT 1
  `);
  let result = await queryOne<any>(sql, [normalized]);

  // If no match by mp_id, try matching by district_name
  if (!result) {
    sql = convertPlaceholders(`
      SELECT m.* 
      FROM mps m
      INNER JOIN postal_code_mappings pcm ON m.district_name = pcm.district_name
      WHERE pcm.postal_code = $1
      LIMIT 1
    `);
    result = await queryOne<any>(sql, [normalized]);
  }

  if (!result) {
    return null;
  }

  return mapMPFromDB(result);
}

/**
 * Get MP by district name or ID
 */
export async function getMPByDistrict(districtIdentifier: string): Promise<MP | null> {
  const decoded = decodeURIComponent(districtIdentifier);

  // Try district_name first
  let sql = convertPlaceholders('SELECT * FROM mps WHERE district_name = $1 LIMIT 1');
  let result = await queryOne<any>(sql, [decoded]);

  if (result) {
    return mapMPFromDB(result);
  }

  // Try district_id
  sql = convertPlaceholders('SELECT * FROM mps WHERE district_id = $1 LIMIT 1');
  result = await queryOne<any>(sql, [decoded]);

  if (result) {
    return mapMPFromDB(result);
  }

  // Try name
  sql = convertPlaceholders('SELECT * FROM mps WHERE name = $1 LIMIT 1');
  result = await queryOne<any>(sql, [decoded]);

  if (result) {
    return mapMPFromDB(result);
  }

  return null;
}

/**
 * Get MP by name
 */
export async function getMPByName(name: string): Promise<MP | null> {
  const sql = convertPlaceholders(`SELECT * FROM mps WHERE name = $1 OR (first_name || ' ' || last_name) = $2 LIMIT 1`);
  const result = await queryOne<any>(sql, [name, name]);
  return result ? mapMPFromDB(result) : null;
}

/**
 * Search MPs by name using LIKE pattern matching
 * Returns all MPs whose name matches the pattern (case-insensitive)
 */
export async function searchMPsByName(searchTerm: string): Promise<MP[]> {
  const pattern = `%${searchTerm}%`;
  
  const sql = convertPlaceholders(`
    SELECT * FROM mps 
    WHERE 
      LOWER(name) LIKE LOWER($1) OR
      LOWER(first_name || ' ' || last_name) LIKE LOWER($2) OR
      LOWER(first_name) LIKE LOWER($3) OR
      LOWER(last_name) LIKE LOWER($4)
    ORDER BY name
    LIMIT 50
  `);
  
  const results = await queryAll<any>(sql, [pattern, pattern, pattern, pattern]);
  return results.map((row) => mapMPFromDB(row));
}

/**
 * Get voting record for an MP from database (historical votes)
 * Merges with latest votes from OpenParliament if needed
 * @param mpId - MP identifier (district_id, district_name, or name)
 * @param mpName - MP name
 * @param dbMPId - Optional: MP database ID (if already known, skips lookup)
 */
export async function getMPVotingRecord(mpId: string, mpName: string, dbMPId?: number): Promise<VotingRecord> {
  let dbMPIdToUse: number | null = null;

  // If database ID is provided, use it directly
  if (dbMPId) {
    dbMPIdToUse = dbMPId;
  } else {
    // Otherwise, find MP by name or district
    const mp = await getMPByDistrict(mpId) || await getMPByName(mpName);
    if (!mp) {
      return {
        mp_id: mpId,
        mp_name: mpName,
        total_votes: 0,
        votes: [],
      };
    }

    const sql = convertPlaceholders('SELECT id FROM mps WHERE name = $1 AND district_name = $2');
    const dbMP = await queryOne<{ id: number }>(sql, [mp.name, mp.district_name]);

    if (!dbMP) {
      return {
        mp_id: mpId,
        mp_name: mpName,
        total_votes: 0,
        votes: [],
      };
    }

    dbMPIdToUse = dbMP.id;
  }

  // Get current session start date
  // If no session date, return all votes (don't filter by date)
  const { getCurrentSessionStartDate } = await import('./sessions');
  const currentSessionStartDate = await getCurrentSessionStartDate();
  
  // Query votes with JOIN to bills_motions table for consistent bill data
  // Only filter by date if a session date is set
  let votesSql: string;
  let votesParams: any[];
  
  if (currentSessionStartDate) {
    votesSql = convertPlaceholders(`
      SELECT 
        v.vote_id,
        v.id,
        v.date,
        v.motion_title,
        v.vote_type,
        v.result,
        v.party_position,
        v.sponsor_party,
        v.bill_number,
        -- Bill data from master table (preferred)
        b.id as bill_id,
        b.bill_number as bill_bill_number,
        b.motion_number as bill_motion_number,
        b.title as bill_title,
        b.legisinfo_id as bill_legisinfo_id,
        b.status_code as bill_status_code,
        b.law as bill_law,
        b.sponsor_politician as bill_sponsor_politician,
        b.sponsor_party as bill_sponsor_party,
        b.session as bill_session,
        -- Fallback to denormalized data if bill not found
        COALESCE(b.title, v.bill_title) as final_bill_title,
        COALESCE(b.bill_number, v.bill_number) as final_bill_number,
        COALESCE(b.motion_number, NULL) as final_motion_number,
        -- Get sponsor party from bill (prefer b.sponsor_party, then lookup from MP, then from vote)
        COALESCE(
          b.sponsor_party,
          (SELECT party_name FROM mps WHERE name = b.sponsor_politician LIMIT 1),
          v.sponsor_party
        ) as final_sponsor_party,
        -- Get category from bill if available
        bc.name as bill_category
      FROM votes v
      LEFT JOIN bills_motions b ON v.bill_id = b.id
      LEFT JOIN bill_policy_categories bc ON b.policy_category_id = bc.id
      WHERE v.mp_id = $1 AND v.date >= $2
      ORDER BY v.date DESC
      LIMIT 5000
    `);
    votesParams = [dbMPIdToUse, currentSessionStartDate];
  } else {
    // No session date set - return all votes
    votesSql = convertPlaceholders(`
      SELECT 
        v.vote_id,
        v.id,
        v.date,
        v.motion_title,
        v.vote_type,
        v.result,
        v.party_position,
        v.sponsor_party,
        v.bill_number,
        -- Bill data from master table (preferred)
        b.id as bill_id,
        b.bill_number as bill_bill_number,
        b.motion_number as bill_motion_number,
        b.title as bill_title,
        b.legisinfo_id as bill_legisinfo_id,
        b.status_code as bill_status_code,
        b.law as bill_law,
        b.sponsor_politician as bill_sponsor_politician,
        b.sponsor_party as bill_sponsor_party,
        b.session as bill_session,
        -- Fallback to denormalized data if bill not found
        COALESCE(b.title, v.bill_title) as final_bill_title,
        COALESCE(b.bill_number, v.bill_number) as final_bill_number,
        COALESCE(b.motion_number, NULL) as final_motion_number,
        -- Get sponsor party from bill (prefer b.sponsor_party, then lookup from MP, then from vote)
        COALESCE(
          b.sponsor_party,
          (SELECT party_name FROM mps WHERE name = b.sponsor_politician LIMIT 1),
          v.sponsor_party
        ) as final_sponsor_party,
        -- Get category from bill if available
        bc.name as bill_category
      FROM votes v
      LEFT JOIN bills_motions b ON v.bill_id = b.id
      LEFT JOIN bill_policy_categories bc ON b.policy_category_id = bc.id
      WHERE v.mp_id = $1
      ORDER BY v.date DESC
      LIMIT 5000
    `);
    votesParams = [dbMPIdToUse];
  }
  
  const votes = await queryAll<any>(votesSql, votesParams);

  return {
    mp_id: mpId,
    mp_name: mpName,
    total_votes: votes.length,
    votes: votes.map((v) => ({
      id: v.vote_id || v.id.toString(),
      date: v.date,
      bill_number: v.final_bill_number || v.bill_number,
      bill_title: v.final_bill_title || v.bill_title,
      motion_title: v.motion_title,
      motion_number: v.final_motion_number || undefined,
      vote_type: v.vote_type as 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting',
      result: v.result as 'Agreed To' | 'Negatived' | 'Tie',
      party_position: v.party_position as 'For' | 'Against' | 'Free Vote' | undefined,
      sponsor_party: v.final_sponsor_party || v.sponsor_party as string | undefined,
      category: v.bill_category as string | undefined,
    })),
  };
}

/**
 * Get bill details and all MPs with their last vote for a specific bill
 * Returns bill info and array of MPs with their last voting stance
 */
export async function getBillWithMPVotes(billNumber: string): Promise<{
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
  } | null;
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
}> {
  // First, get the bill details using the same query pattern as Recent Activity
  // This gets the latest version of the bill by ID (in case there are duplicates)
  let bill: any = null;
  try {
    const billSql = convertPlaceholders(`
      SELECT 
        bm.id,
        bm.bill_number,
        bm.title,
        bm.introduced_date,
        bm.status_code,
        bm.status,
        bm.law,
        bm.session,
        bm.sponsor_politician,
        COALESCE(
          bm.sponsor_party,
          (SELECT party_name FROM mps WHERE name = bm.sponsor_politician LIMIT 1)
        ) as sponsor_party,
        bpc.name as category_name
      FROM bills_motions bm
      LEFT JOIN bill_policy_categories bpc ON bm.policy_category_id = bpc.id
      INNER JOIN (
        SELECT bill_number, MAX(id) as max_id
        FROM bills_motions
        WHERE bill_number = ?
        GROUP BY bill_number
      ) latest ON bm.bill_number = latest.bill_number AND bm.id = latest.max_id
      WHERE bm.bill_number = ?
      LIMIT 1
    `);
    
    bill = await queryOne<any>(billSql, [billNumber, billNumber]);
  } catch (error) {
    console.error(`[getBillWithMPVotes] Error fetching bill ${billNumber}:`, error);
    return { bill: null, mpVotes: [] };
  }
  
  if (!bill) {
    console.log(`[getBillWithMPVotes] Bill ${billNumber} not found in database`);
    return { bill: null, mpVotes: [] };
  }
  
  console.log(`[getBillWithMPVotes] Found bill ${billNumber} (id: ${bill.id})`);
  
  // Get bill_id - use the bill we found
  const billId = bill.id;
  
  // Use two separate queries for simplicity
  // Query 1: Check if votes exist
  // Query 2: Get latest vote per MP with MP details
  let mpVotes: any[] = [];
  
  try {
    // First query: Check if there are any votes for this bill
    const checkVotesSql = convertPlaceholders(`
      SELECT COUNT(*) as count
      FROM votes v
      WHERE v.bill_id = ? OR v.bill_number = ?
    `);
    
    const voteCheck = await queryOne<{ count: string }>(checkVotesSql, [billId, billNumber]);
    const voteCount = voteCheck ? parseInt(voteCheck.count, 10) : 0;
    
    if (voteCount === 0) {
      console.log(`[getBillWithMPVotes] No votes found for bill ${billNumber}`);
    } else {
      // Second query: Get the latest vote per MP using window function
      // Use a simpler approach that's more reliable
      try {
        const latestVotesSql = convertPlaceholders(`
          SELECT 
            m.id as mp_id,
            m.name as mp_name,
            m.party_name,
            m.district_name,
            m.photo_url,
            v.vote_type,
            v.date as vote_date,
            v.motion_title
          FROM (
            SELECT 
              v2.mp_id,
              v2.vote_type,
              v2.date,
              v2.motion_title,
              ROW_NUMBER() OVER (PARTITION BY v2.mp_id ORDER BY v2.date DESC) as rn
            FROM votes v2
            WHERE (v2.bill_id = ? OR v2.bill_number = ?)
          ) v
          INNER JOIN mps m ON v.mp_id = m.id
          WHERE v.rn = 1
        `);
        
        mpVotes = await queryAll<any>(latestVotesSql, [billId, billNumber]);
      } catch (voteError) {
        console.error(`[getBillWithMPVotes] Error in votes query for bill ${billNumber}:`, voteError);
        // Don't throw - just return empty votes array
        mpVotes = [];
      }
      
      // Sort by party and name
      mpVotes.sort((a, b) => {
        const partyA = a.party_name || '';
        const partyB = b.party_name || '';
        if (partyA !== partyB) {
          return partyA.localeCompare(partyB);
        }
        return a.mp_name.localeCompare(b.mp_name);
      });
      
      console.log(`[getBillWithMPVotes] Found ${mpVotes.length} MP votes for bill ${billNumber}`);
    }
  } catch (error) {
    // Log error but don't fail - still return bill details
    console.error(`[getBillWithMPVotes] Error fetching votes for bill ${billNumber}:`, error);
    if (error instanceof Error) {
      console.error(`[getBillWithMPVotes] Error message: ${error.message}`);
      console.error(`[getBillWithMPVotes] Error stack: ${error.stack}`);
    }
    mpVotes = [];
  }
  
  // Always return bill details, even if votes query failed
  const result = {
    bill: {
      id: bill.id,
      bill_number: bill.bill_number,
      title: bill.title,
      introduced_date: bill.introduced_date,
      status_code: bill.status_code,
      status: bill.status,
      law: bill.law,
      session: bill.session,
      sponsor_politician: bill.sponsor_politician,
      sponsor_party: bill.sponsor_party,
      category_name: bill.category_name,
    },
    mpVotes: mpVotes.map((row) => ({
      mp_id: row.mp_id,
      mp_name: row.mp_name,
      party_name: row.party_name,
      district_name: row.district_name,
      photo_url: row.photo_url,
      vote_type: row.vote_type,
      vote_date: row.vote_date,
      motion_title: row.motion_title,
    })),
  };
  
  console.log(`[getBillWithMPVotes] Returning bill ${billNumber} with ${result.mpVotes.length} votes`);
  return result;
}

/**
 * Helper to map database row to MP type
 */
function mapMPFromDB(row: any): MP {
  let committees: CommitteeMemberRole[] | undefined;
  let associations: any[] | undefined;
  let parliamentary_positions: any[] | undefined;

  if (row.committees) {
    try {
      const parsed = JSON.parse(row.committees);
      // Ensure it's an array and has the expected structure
      committees = Array.isArray(parsed) ? parsed as CommitteeMemberRole[] : undefined;
    } catch (e) {
      // Invalid JSON, leave as undefined
      committees = undefined;
    }
  }

  if (row.associations) {
    try {
      associations = JSON.parse(row.associations);
    } catch (e) {
      // Invalid JSON, leave as undefined
    }
  }

  if (row.parliamentary_positions) {
    try {
      parliamentary_positions = JSON.parse(row.parliamentary_positions);
    } catch (e) {
      // Invalid JSON, leave as undefined
    }
  }

  return {
    id: row.id,
    name: row.name,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    photo_url: row.photo_url,
    party_name: row.party_name,
    district_name: row.district_name,
    district_id: row.district_id,
    elected_office: row.elected_office || 'MP',
    url: row.url,
    source_url: row.source_url,
    personal_url: row.personal_url,
    gender: row.gender as 'M' | 'F' | undefined,
    committees,
    associations,
    parliamentary_positions,
    salary: row.salary || 209800,
  };
}
