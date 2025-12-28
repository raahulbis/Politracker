import { NextRequest, NextResponse } from 'next/server';
import { searchMPsByName } from '@/lib/db/queries';
import { queryAll, convertPlaceholders } from '@/lib/db/database';
import { validatePostalCodeFormat, normalizePostalCode } from '@/lib/utils/postal-code';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ suggestions: [] });
  }

  const searchTerm = query.trim();
  const suggestions: Array<{
    type: 'mp' | 'riding' | 'postal_code';
    label: string;
    value: string;
    subtitle?: string;
  }> = [];

  try {
    // Check if it looks like a postal code
    const normalized = normalizePostalCode(searchTerm);
    const looksLikePostalCode = /^[A-Z0-9]{3,6}$/i.test(searchTerm);
    
    if (looksLikePostalCode && normalized.length >= 3) {
      // If it's a valid postal code format, add it as a suggestion
      if (normalized.length === 6 && validatePostalCodeFormat(normalized)) {
        const formatted = `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
        suggestions.push({
          type: 'postal_code',
          label: formatted,
          value: formatted,
          subtitle: 'Postal code',
        });
      } else if (normalized.length < 6) {
        // Partial postal code - show format hint
        suggestions.push({
          type: 'postal_code',
          label: searchTerm,
          value: searchTerm,
          subtitle: 'Enter postal code (e.g., K1A 0A6)',
        });
      }
    }

    // Search for MP names (limit to 5 for autocomplete)
    const mps = await searchMPsByName(searchTerm);
    const mpSuggestions = mps.slice(0, 5).map((mp) => ({
      type: 'mp' as const,
      label: mp.name,
      value: mp.name,
      subtitle: mp.district_name || undefined,
    }));
    suggestions.push(...mpSuggestions);

    // Search for ridings/districts (limit to 5 for autocomplete)
    const pattern = `%${searchTerm}%`;
    const sql = convertPlaceholders(`
      SELECT DISTINCT district_name 
      FROM mps 
      WHERE LOWER(district_name) LIKE LOWER($1)
      ORDER BY district_name
      LIMIT 5
    `);
    const districts = await queryAll<{ district_name: string }>(sql, [pattern]);
    const districtSuggestions = districts.map((d) => ({
      type: 'riding' as const,
      label: d.district_name,
      value: d.district_name,
      subtitle: 'Riding',
    }));
    suggestions.push(...districtSuggestions);

    // Limit total suggestions to 10
    return NextResponse.json({ suggestions: suggestions.slice(0, 10) });
  } catch (error: any) {
    console.error('Error in autocomplete:', error);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}


