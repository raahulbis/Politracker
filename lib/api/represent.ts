import axios from 'axios';
import * as https from 'https';
import { normalizePostalCode, validatePostalCodeFormat } from '@/lib/utils/postal-code';

const REPRESENT_API_BASE = 'https://represent.opennorth.ca';

interface ElectoralDistrict {
  name: string;
  boundary_set_url?: string;
}

interface Representative {
  name: string;
  elected_office: string;
  district_name: string;
  external_id?: string;
  person_id?: string;
}

interface Boundary {
  url: string;
  name: string;
  external_id?: string;
  boundary_set_name?: string;
}

interface PostalCodeResponse {
  postal_code?: string;
  code?: string;
  representatives_centroid?: Representative[];
  representatives_concordance?: Representative[];
  federal_electoral_districts?: ElectoralDistrict[];
  boundaries_centroid?: Boundary[];
  boundaries_concordance?: Boundary[];
}

/**
 * Fetch postal code data from OpenNorth Represent API
 * Maps external_id to House of Commons PersonId
 */
export async function fetchPostalCodeData(postalCode: string): Promise<{
  person_id?: string;
  external_id?: string;
  district_name: string;
  representative_district_name?: string; // More accurate district name from representative
} | null> {
  const normalized = normalizePostalCode(postalCode);
  
  if (!validatePostalCodeFormat(normalized)) {
    throw new Error('Invalid Canadian postal code format');
  }

  try {
    // Only disable SSL verification in development if explicitly set
    // In production, always verify SSL certificates for security
    const httpsAgent = new https.Agent({
      rejectUnauthorized: process.env.NODE_ENV === 'production' || process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
    });

    // Use the correct URL format: /postcodes/{postal_code}/
    // Don't use sets parameter - we want all data including representatives
    const url = `${REPRESENT_API_BASE}/postcodes/${normalized}/`;
    console.log(`[Represent API] Fetching: ${url}`);
    
    const response = await axios.get<PostalCodeResponse>(
      url,
      {
        httpsAgent,
        params: {
          // Don't restrict to sets - we want representatives too
        },
        timeout: 5000, // Reduced timeout to 5 seconds to fail faster
      }
    );
    
    console.log(`[Represent API] Response status: ${response.status}`);
    console.log(`[Represent API] Response data keys:`, Object.keys(response.data || {}));

    const data = response.data;
    console.log(`[Represent API] Data structure:`, {
      hasBoundariesCentroid: !!data.boundaries_centroid,
      boundariesCentroidLength: data.boundaries_centroid?.length || 0,
      hasBoundariesConcordance: !!data.boundaries_concordance,
      boundariesConcordanceLength: data.boundaries_concordance?.length || 0,
      hasRepresentativesCentroid: !!data.representatives_centroid,
      representativesCentroidLength: data.representatives_centroid?.length || 0,
    });

    // Extract federal electoral district information
    let districtName: string | null = null;
    let externalId: string | undefined; // Electoral district ID from boundaries

    // When using sets=federal-electoral-districts, get district from boundaries_centroid
    if (data.boundaries_centroid && data.boundaries_centroid.length > 0) {
      // Find federal electoral district boundary
      const federalBoundary = data.boundaries_centroid.find(
        (b: Boundary) => {
          const isFederal = b.boundary_set_name === 'Federal electoral district' || 
                           b.url?.includes('federal-electoral-districts') ||
                           b.url?.includes('federal_electoral_districts');
          return isFederal;
        }
      );

      if (federalBoundary) {
        districtName = federalBoundary.name;
        externalId = federalBoundary.external_id; // Electoral district ID (e.g., "35075")
        console.log(`[Represent API] Found district from boundaries_centroid: ${districtName} (ID: ${externalId})`);
      }
    }

    // Fallback to boundaries_concordance
    if (!districtName && data.boundaries_concordance && data.boundaries_concordance.length > 0) {
      const federalBoundary = data.boundaries_concordance.find(
        (b: Boundary) => {
          const isFederal = b.boundary_set_name === 'Federal electoral district' || 
                           b.url?.includes('federal-electoral-districts') ||
                           b.url?.includes('federal_electoral_districts');
          return isFederal;
        }
      );
      if (federalBoundary) {
        districtName = federalBoundary.name;
        externalId = federalBoundary.external_id || externalId;
        console.log(`[Represent API] Found district from boundaries_concordance: ${districtName} (ID: ${externalId})`);
      }
    }

    // Also try to get representatives (may be empty when using sets parameter)
    // Look for federal MP (elected_office === 'MP') to get PersonId if available
    const representativesCentroid = data.representatives_centroid || [];
    const federalMPCentroid = representativesCentroid.find(
      (rep: Representative) => rep.elected_office === 'MP'
    );

    let personId: string | undefined;
    let representativeDistrictName: string | undefined;
    if (federalMPCentroid) {
      // If representative has a district_name, prefer it over boundary name
      // This is more accurate for redistributed districts
      representativeDistrictName = federalMPCentroid.district_name;
      districtName = representativeDistrictName || districtName;
      // If representative has external_id, it might map to PersonId
      // But typically we match by district_name since external_id in boundaries is district ID, not PersonId
      personId = federalMPCentroid.person_id || federalMPCentroid.external_id;
      console.log(`[Represent API] Found MP from representatives_centroid: ${federalMPCentroid.name} (District: ${representativeDistrictName}, PersonId: ${personId})`);
    }

    // Fallback to representatives_concordance
    if (!federalMPCentroid) {
      const representativesConcordance = data.representatives_concordance || [];
      const federalMPConcordance = representativesConcordance.find(
        (rep: Representative) => rep.elected_office === 'MP'
      );

      if (federalMPConcordance) {
        districtName = districtName || federalMPConcordance.district_name;
        personId = federalMPConcordance.person_id || federalMPConcordance.external_id;
        console.log(`[Represent API] Found MP from representatives_concordance: ${federalMPConcordance.name} (PersonId: ${personId})`);
      }
    }

    // Fallback to federal_electoral_districts (older API structure)
    if (!districtName && data.federal_electoral_districts && data.federal_electoral_districts.length > 0) {
      districtName = data.federal_electoral_districts[0].name;
      console.log(`[Represent API] Found district from federal_electoral_districts: ${districtName}`);
    }

    if (!districtName) {
      console.log(`[Represent API] No district name found in response for postal code ${normalized}`);
      return null;
    }

    console.log(`[Represent API] Returning: district_name=${districtName}, external_id=${externalId}, person_id=${personId}`);

    // Return district_name (primary key for matching)
    // external_id is the electoral district ID from boundaries
    // personId would be from representative if available, but we primarily match by district_name
    // representative_district_name is the district name from the representative (more accurate for redistributed districts)
    return {
      person_id: personId, // May be undefined if not in representative response
      external_id: externalId, // Electoral district ID from boundaries
      district_name: districtName,
      representative_district_name: representativeDistrictName, // District name from representative (more accurate)
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null; // Postal code not found
    }
    
    // Handle rate limiting (429 Too Many Requests)
    if (error.response?.status === 429) {
      console.warn(`Rate limit hit for postal code ${normalized}. Consider caching more postal codes.`);
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    console.error(`Error fetching postal code ${normalized}:`, error.message);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
    }
    throw error;
  }
}
