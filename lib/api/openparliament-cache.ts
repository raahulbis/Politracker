import { queryOne, queryAll, queryRun, transaction, convertPlaceholders } from '@/lib/db/database';
import type { Vote, VotingRecord } from '@/types';

const VOTE_CACHE_TTL_HOURS = 24; // Cache votes for 24 hours
const VOTE_DETAIL_CACHE_TTL_HOURS = 168; // Cache vote details for 1 week (they don't change)

/**
 * Cache vote details to avoid fetching the same vote multiple times
 */
export async function cacheVoteDetails(voteUrl: string, voteData: any): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + VOTE_DETAIL_CACHE_TTL_HOURS);

  const sql = convertPlaceholders(`
    INSERT INTO vote_details_cache 
    (vote_url, vote_data, fetched_at, expires_at)
    VALUES (?, ?, NOW(), ?)
    ON CONFLICT (vote_url) DO UPDATE SET
      vote_data = EXCLUDED.vote_data,
      fetched_at = EXCLUDED.fetched_at,
      expires_at = EXCLUDED.expires_at
  `);

  await queryRun(sql, [voteUrl, JSON.stringify(voteData), expiresAt.toISOString()]);
}

/**
 * Get cached vote details if still valid
 */
export async function getCachedVoteDetails(voteUrl: string): Promise<any | null> {
  const sql = convertPlaceholders(`
    SELECT vote_data
    FROM vote_details_cache
    WHERE vote_url = $1 AND expires_at > NOW()
    LIMIT 1
  `);
  
  const cached = await queryOne<{ vote_data: string }>(sql, [voteUrl]);

  if (cached) {
    try {
      return JSON.parse(cached.vote_data);
    } catch (error) {
      console.error(`Error parsing cached vote data for ${voteUrl}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Cache MP votes with TTL
 */
export async function cacheMPVotes(mpId: number, votes: Vote[]): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + VOTE_CACHE_TTL_HOURS);

  await transaction(async (client) => {
    // Clear old cached votes for this MP
    const deleteSql = convertPlaceholders('DELETE FROM votes_cache WHERE mp_id = $1');
    await client.query(deleteSql, [mpId]);

    // Insert new cached votes
    const insertSql = convertPlaceholders(`
      INSERT INTO votes_cache 
      (mp_id, vote_id, vote_data, fetched_at, expires_at)
      VALUES ($1, $2, $3, NOW(), $4)
      ON CONFLICT (mp_id, vote_id) DO UPDATE SET
        vote_data = EXCLUDED.vote_data,
        fetched_at = EXCLUDED.fetched_at,
        expires_at = EXCLUDED.expires_at
    `);

    for (const vote of votes) {
      await client.query(insertSql, [mpId, vote.id, JSON.stringify(vote), expiresAt.toISOString()]);
    }
  });
}

/**
 * Get cached MP votes if still valid
 */
export async function getCachedMPVotes(mpId: number): Promise<Vote[] | null> {
  const sql = convertPlaceholders(`
    SELECT vote_data
    FROM votes_cache
    WHERE mp_id = $1 AND expires_at > NOW()
    ORDER BY (vote_data::jsonb->>'date') DESC NULLS LAST
  `);

  const cached = await queryAll<{ vote_data: string }>(sql, [mpId]);

  if (cached.length > 0) {
    try {
      return cached.map((row) => JSON.parse(row.vote_data) as Vote);
    } catch (error) {
      console.error(`Error parsing cached votes for MP ${mpId}:`, error);
      return null;
    }
  }

  return null;
}

/**
 * Store party loyalty stats in cache
 */
export async function cachePartyLoyaltyStats(
  mpId: number,
  stats: {
    votes_with_party: number;
    votes_against_party: number;
    free_votes: number;
    abstained_paired_votes?: number;
    loyalty_percentage: number;
    opposition_percentage: number;
    free_vote_percentage: number;
  }
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + VOTE_CACHE_TTL_HOURS);

  // Check if column exists (PostgreSQL way)
  try {
    const checkColumnSql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'party_loyalty_cache' AND column_name = 'abstained_paired_votes'
    `;
    const columnExists = await queryOne<{ column_name: string }>(checkColumnSql);
    
    if (!columnExists) {
      await queryRun('ALTER TABLE party_loyalty_cache ADD COLUMN IF NOT EXISTS abstained_paired_votes INTEGER DEFAULT 0', []);
    }
  } catch (error) {
    // Column might already exist, continue
    console.warn('Error checking/adding abstained_paired_votes column:', error);
  }

  const sql = convertPlaceholders(`
    INSERT INTO party_loyalty_cache
    (mp_id, votes_with_party, votes_against_party, free_votes, abstained_paired_votes,
     loyalty_percentage, opposition_percentage, free_vote_percentage,
     calculated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    ON CONFLICT (mp_id) DO UPDATE SET
      votes_with_party = EXCLUDED.votes_with_party,
      votes_against_party = EXCLUDED.votes_against_party,
      free_votes = EXCLUDED.free_votes,
      abstained_paired_votes = EXCLUDED.abstained_paired_votes,
      loyalty_percentage = EXCLUDED.loyalty_percentage,
      opposition_percentage = EXCLUDED.opposition_percentage,
      free_vote_percentage = EXCLUDED.free_vote_percentage,
      calculated_at = EXCLUDED.calculated_at,
      expires_at = EXCLUDED.expires_at
  `);

  await queryRun(sql, [
    mpId,
    stats.votes_with_party,
    stats.votes_against_party,
    stats.free_votes,
    stats.abstained_paired_votes || 0,
    stats.loyalty_percentage,
    stats.opposition_percentage,
    stats.free_vote_percentage,
    expiresAt.toISOString()
  ]);
}

/**
 * Get cached party loyalty stats
 */
export async function getCachedPartyLoyaltyStats(mpId: number): Promise<{
  votes_with_party: number;
  votes_against_party: number;
  free_votes: number;
  abstained_paired_votes?: number;
  loyalty_percentage: number;
  opposition_percentage: number;
  free_vote_percentage: number;
} | null> {
  // Check if column exists
  let hasColumn = false;
  try {
    const checkColumnSql = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'party_loyalty_cache' AND column_name = 'abstained_paired_votes'
    `;
    const columnExists = await queryOne<{ column_name: string }>(checkColumnSql);
    hasColumn = !!columnExists;
  } catch (error) {
    // If error, assume column doesn't exist
  }

  const sql = hasColumn
    ? convertPlaceholders(`
        SELECT votes_with_party, votes_against_party, free_votes, abstained_paired_votes,
               loyalty_percentage, opposition_percentage, free_vote_percentage
        FROM party_loyalty_cache
        WHERE mp_id = $1 AND expires_at > NOW()
        LIMIT 1
      `)
    : convertPlaceholders(`
        SELECT votes_with_party, votes_against_party, free_votes,
               loyalty_percentage, opposition_percentage, free_vote_percentage
        FROM party_loyalty_cache
        WHERE mp_id = $1 AND expires_at > NOW()
        LIMIT 1
      `);

  const cached = await queryOne<{
    votes_with_party: number;
    votes_against_party: number;
    free_votes: number;
    abstained_paired_votes?: number;
    loyalty_percentage: number;
    opposition_percentage: number;
    free_vote_percentage: number;
  }>(sql, [mpId]);

  if (cached && !hasColumn) {
    cached.abstained_paired_votes = 0;
  }

  return cached || null;
}
