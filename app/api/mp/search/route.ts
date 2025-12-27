import { NextRequest, NextResponse } from 'next/server';
import { getPostalCodeFromCache, cachePostalCode, getMPByPersonId, searchMPsByName } from '@/lib/db/queries';
import { normalizePostalCode, validatePostalCodeFormat } from '@/lib/utils/postal-code';
import { fetchPostalCodeData } from '@/lib/api/represent';
import { queryOne, queryAll, convertPlaceholders } from '@/lib/db/database';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const postalCode = searchParams.get('postalCode');
  const name = searchParams.get('name');

  // If name is provided, search by name
  if (name) {
    try {
      const mps = await searchMPsByName(name.trim());
      
      if (mps.length === 0) {
        return NextResponse.json(
          { error: 'No MPs found matching that name.' },
          { status: 404 }
        );
      }
      
      // If only one result, return it directly
      if (mps.length === 1) {
        return NextResponse.json(mps[0]);
      }
      
      // If multiple results, return the list
      return NextResponse.json({ results: mps, count: mps.length });
    } catch (error: any) {
      console.error('Error searching for MP by name:', error);
      return NextResponse.json(
        { error: 'Failed to search for MP by name.' },
        { status: 500 }
      );
    }
  }

  // Otherwise, search by postal code
  if (!postalCode) {
    return NextResponse.json(
      { error: 'Either postal code or name is required' },
      { status: 400 }
    );
  }

  try {
    // Step 1: Normalize postal code
    const normalized = normalizePostalCode(postalCode);
    
    // Step 2: Validate format
    if (!validatePostalCodeFormat(normalized)) {
      return NextResponse.json(
        { error: 'Invalid Canadian postal code format. Expected format: A1A 1A1' },
        { status: 400 }
      );
    }

    // Step 3: Check cache first
    let districtName: string | null = null;
    let personId: string | undefined;
    let externalId: string | undefined; // Electoral district ID from API
    
    const cached = await getPostalCodeFromCache(normalized);
    if (cached) {
      districtName = cached.district_name;
    } else {
      // Step 4: Cache miss - fetch from Represent API (with timeout)
      console.log(`[Postal Code Search] Cache miss for ${normalized}, fetching from Represent API...`);
      try {
        // Add timeout wrapper for the API call
        const apiDataPromise = fetchPostalCodeData(normalized);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('API request timeout')), 5000)
        );
        const apiData = await Promise.race([apiDataPromise, timeoutPromise]);
        if (apiData && apiData.district_name) {
          // Prefer representative_district_name if available (more accurate for redistributed districts)
          districtName = apiData.representative_district_name || apiData.district_name;
          // external_id is the electoral district ID, not person_id
          // We'll match by district_name instead
          personId = apiData.person_id; // Only use person_id if available
          externalId = apiData.external_id; // Store electoral district ID
          
          console.log(`[Postal Code Search] Found district: ${districtName} (ID: ${externalId}) for ${normalized}`);
          if (apiData.representative_district_name && apiData.representative_district_name !== apiData.district_name) {
            console.log(`[Postal Code Search] Using representative district name "${apiData.representative_district_name}" instead of boundary name "${apiData.district_name}"`);
          }
          
          // Cache the result (use external_id as fed_boundary_id for caching)
          await cachePostalCode(normalized, districtName, externalId, 'represent', 30);
        } else {
          console.log(`[Postal Code Search] No district found in API response for ${normalized}`);
        }
      } catch (apiError: any) {
        // Log error but don't fail - fallback to manual mappings
        if (apiError.response?.status === 404) {
          console.log(`[Postal Code Search] Postal code ${normalized} not found in Represent API (404)`);
          // Postal code not found in API - this is expected for some postal codes
          // Continue to fallback
        } else if (apiError.response?.status === 429) {
          // Rate limit hit - log warning but continue to fallback
          console.warn('[Postal Code Search] Represent API rate limit exceeded. Using fallback mappings.');
        } else {
          console.error(`[Postal Code Search] Error fetching from Represent API for ${normalized}:`, apiError.message);
          if (process.env.NODE_ENV === 'development' && apiError.response) {
            console.error('API Response status:', apiError.response.status);
            console.error('API Response data:', apiError.response.data);
          }
        }
        // Continue to fallback to manual mappings
      }
    }

    // Step 5: Find MP by PersonId first (most accurate match)
    let mp = null;
    if (personId) {
      mp = await getMPByPersonId(personId);
    }

    // Step 6: If no match by PersonId, try by district name
    if (!mp && districtName) {
      // Try exact match first
      let sql = convertPlaceholders('SELECT * FROM mps WHERE district_name = $1 LIMIT 1');
      let result = await queryOne<any>(sql, [districtName]);

      // If no exact match, try case-insensitive match
      if (!result) {
        sql = convertPlaceholders('SELECT * FROM mps WHERE LOWER(district_name) = LOWER($1) LIMIT 1');
        result = await queryOne<any>(sql, [districtName]);
      }

      // If still no match, try partial match (district name contains or is contained)
      // This handles cases like "Oakville" matching "Oakville East" or "Oakville West"
      // which happens when districts are redistributed but API hasn't updated
      if (!result) {
        const allMPs = await queryAll<any>('SELECT * FROM mps');
        const normalizedDistrictName = districtName.toLowerCase().trim();
        
        // Find all districts that match (could be multiple due to redistributions)
        const matchingMPs = allMPs.filter((mp: any) => {
          const mpDistrict = (mp.district_name || '').toLowerCase().trim();
          return mpDistrict === normalizedDistrictName ||
                 mpDistrict.includes(normalizedDistrictName) ||
                 normalizedDistrictName.includes(mpDistrict);
        });

        if (matchingMPs.length > 0) {
          // If multiple matches (e.g., "Oakville East" and "Oakville West" for "Oakville")
          // This happens when districts are redistributed but API hasn't updated
          // We need to determine which one is correct
          
          // TODO: Once the Represent API is updated with the two Oakville ridings
          // (Oakville East and Oakville West), this heuristic matching logic can be
          // simplified or removed, as the API will return the correct specific district name.
          
          let selectedMP = null;
          
          // Strategy 1: If we have external_id (electoral district ID), try to match by that
          // (This would require a mapping table, which we don't have yet)
          
          // Strategy 2: Prefer the one that starts with the API district name + space
          // This handles cases like "Oakville" -> "Oakville East" or "Oakville West"
          const exactPrefixMatch = matchingMPs.find((mp: any) => {
            const mpDistrict = (mp.district_name || '').toLowerCase().trim();
            return mpDistrict.startsWith(normalizedDistrictName + ' ');
          });
          
          // Strategy 3: If no exact prefix match, prefer alphabetical first (East before West)
          // This is a heuristic - not perfect but better than random
          if (!exactPrefixMatch && matchingMPs.length > 1) {
            // Sort alphabetically and take first
            matchingMPs.sort((a: any, b: any) => 
              (a.district_name || '').localeCompare(b.district_name || '')
            );
          }
          
          selectedMP = exactPrefixMatch || matchingMPs[0];
          
          if (matchingMPs.length > 1) {
            console.log(`[Postal Code Search] Multiple districts match "${districtName}": ${matchingMPs.map((m: any) => m.district_name).join(', ')}`);
            console.log(`[Postal Code Search] Selected: ${selectedMP.district_name} (${selectedMP.name})`);
            console.log(`[Postal Code Search] Note: This may not be correct due to district redistribution. Consider verifying.`);
          }
          
          result = selectedMP;
        }
      }

      if (result) {
        mp = {
          name: result.name,
          first_name: result.first_name,
          last_name: result.last_name,
          email: result.email,
          phone: result.phone,
          photo_url: result.photo_url,
          party_name: result.party_name,
          district_name: result.district_name,
          district_id: result.district_id,
          elected_office: result.elected_office || 'MP',
          url: result.url,
          source_url: result.source_url,
          personal_url: result.personal_url,
          gender: result.gender as 'M' | 'F' | undefined,
        };
        console.log(`[Postal Code Search] Found MP by district name (partial match): ${mp.name} (${mp.district_name})`);
      } else {
        console.log(`[Postal Code Search] No MP found for district: ${districtName}`);
      }
    }

    // Step 6: Fallback to manual postal_code_mappings if still no match
    if (!mp) {
      // Try manual mappings
      let sql = convertPlaceholders(`
        SELECT m.* 
        FROM mps m
        INNER JOIN postal_code_mappings pcm ON m.id = pcm.mp_id
        WHERE pcm.postal_code = $1
        LIMIT 1
      `);
      let result = await queryOne<any>(sql, [normalized]);

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

      if (result) {
        mp = {
          name: result.name,
          first_name: result.first_name,
          last_name: result.last_name,
          email: result.email,
          photo_url: result.photo_url,
          party_name: result.party_name,
          district_name: result.district_name,
          district_id: result.district_id,
          elected_office: result.elected_office || 'MP',
          url: result.url,
          source_url: result.source_url,
          personal_url: result.personal_url,
          gender: result.gender as 'M' | 'F' | undefined,
        };
      }
    }


    if (!mp) {
      return NextResponse.json(
        { error: 'No MP found for this postal code. The postal code may not be in our database yet.' },
        { status: 404 }
      );
    }

    return NextResponse.json(mp);
  } catch (error: any) {
    console.error('Error searching for MP:', error);
    
    return NextResponse.json(
      { error: 'Failed to search for MP. Please check the postal code format.' },
      { status: 500 }
    );
  }
}

