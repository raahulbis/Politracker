/**
 * Postal code utilities for normalization and validation
 */

/**
 * Normalize a postal code:
 * - Convert to uppercase
 * - Strip all spaces
 * - Returns format like: M5V3L9
 */
export function normalizePostalCode(postalCode: string): string {
  return postalCode.replace(/\s+/g, '').toUpperCase();
}

/**
 * Validate Canadian postal code format
 * Format: A1A1A1 (letter-number-letter number-letter-number)
 * 
 * @returns true if valid format, false otherwise
 */
export function validatePostalCodeFormat(postalCode: string): boolean {
  const normalized = normalizePostalCode(postalCode);
  
  // Canadian postal code regex: A1A 1A1 format
  // First letter cannot be D, F, I, O, Q, U, W, or Z
  const canadianPostalCodeRegex = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\d[ABCEGHJ-NPRSTV-Z]\d$/;
  
  return canadianPostalCodeRegex.test(normalized);
}

/**
 * Format postal code with space for display: A1A 1A1
 */
export function formatPostalCode(postalCode: string): string {
  const normalized = normalizePostalCode(postalCode);
  if (normalized.length === 6) {
    return `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
  }
  return normalized;
}

