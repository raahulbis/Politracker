import { queryOne, convertPlaceholders } from './database';

export interface Session {
  id: number;
  session_number: number;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
}

/**
 * Get the current session (where is_current = true)
 * If multiple sessions are returned, picks the one with the latest start_date
 */
export async function getCurrentSession(): Promise<Session | null> {
  const sql = convertPlaceholders(`
    SELECT id, session_number, start_date, end_date, is_current
    FROM sessions
    WHERE is_current = true
    ORDER BY start_date DESC
    LIMIT 1
  `);
  
  const session = await queryOne<Session>(sql, []);
  return session || null;
}

/**
 * Get the start date of the current session
 * Returns null if no current session is found
 * Converts Date object to YYYY-MM-DD string format for consistent comparison
 */
export async function getCurrentSessionStartDate(): Promise<string | null> {
  const session = await getCurrentSession();
  if (!session?.start_date) {
    return null;
  }
  
  // PostgreSQL DATE columns are returned as Date objects by the driver
  // Convert to YYYY-MM-DD string format for consistent string comparison
  if (session.start_date instanceof Date) {
    const year = session.start_date.getFullYear();
    const month = String(session.start_date.getMonth() + 1).padStart(2, '0');
    const day = String(session.start_date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // If it's already a string, return as-is
  return session.start_date;
}

