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
      vote_type: v.vote_type as 'Yea' | 'Nay' | 'Paired' | 'Abstained' | 'Not Voting',
      result: v.result as 'Agreed To' | 'Negatived' | 'Tie',
      party_position: v.party_position as 'For' | 'Against' | 'Free Vote' | undefined,
      sponsor_party: v.final_sponsor_party || v.sponsor_party as string | undefined,
      category: v.bill_category as string | undefined,
    })),
  };
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
