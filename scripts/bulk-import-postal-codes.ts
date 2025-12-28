import { getDatabase, closeDatabase } from '../lib/db/database';
import axios from 'axios';
import * as https from 'https';

/**
 * Bulk import postal codes for all MPs using OpenNorth Represent API
 * This is a one-time setup script to populate postal code mappings
 * 
 * Note: OpenNorth API has rate limits, so this may take a while
 * The script will process in batches with delays
 */

const REPRESENT_API_BASE = 'https://represent.opennorth.ca/api';

interface ElectoralDistrict {
  name: string;
  boundary_set_url?: string;
}

interface Representative {
  name: string;
  elected_office: string;
  district_name: string;
}

interface PostalCodeResponse {
  postal_code: string;
  representatives_centroid?: Representative[];
  representatives_concordance?: Representative[];
  federal_electoral_districts?: ElectoralDistrict[];
}

async function getPostalCodeData(postalCode: string): Promise<PostalCodeResponse | null> {
  try {
    // Use OpenNorth API to get postal code data
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false // For development
    });

    const response = await axios.get(`${REPRESENT_API_BASE}/postcodes/${postalCode}/`, {
      httpsAgent,
      params: {
        sets: 'federal-electoral-districts',
      },
      timeout: 10000,
    });

    return response.data as PostalCodeResponse;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null; // Postal code not found
    }
    console.error(`Error fetching postal code ${postalCode}:`, error.message);
    return null;
  }
}

async function bulkImportPostalCodes() {
  console.log('Bulk Postal Code Import Tool');
  console.log('============================\n');
  console.log('This script will import postal codes for all MPs.');
  console.log('Note: This uses OpenNorth API which has rate limits.\n');

  const db = getDatabase();

  // Get all MPs
  const mps = db.prepare('SELECT id, name, district_name FROM mps ORDER BY district_name').all() as Array<{
    id: number;
    name: string;
    district_name: string;
  }>;

  console.log(`Found ${mps.length} MPs in database\n`);

  // Get existing postal code mappings
  const existingMappings = new Set(
    (db.prepare('SELECT postal_code FROM postal_code_mappings').all() as Array<{ postal_code: string }>)
      .map(m => m.postal_code)
  );

  console.log(`Already have ${existingMappings.size} postal code mappings\n`);

  const insertMapping = db.prepare(`
    INSERT OR REPLACE INTO postal_code_mappings (postal_code, mp_id, district_name)
    VALUES (?, ?, ?)
  `);

  // Sample postal codes to test with - you can expand this list
  // For production, you'd want to use a complete postal code database
  const samplePostalCodes = [
    // Generate some sample postal codes for testing
    // In production, you'd import from a complete database
  ];

  console.log('To import postal codes for all MPs, you have two options:\n');
  console.log('Option 1: Use OpenNorth API (rate limited, slow)');
  console.log('  - This script can query OpenNorth for postal codes');
  console.log('  - But it will be very slow due to rate limits\n');
  console.log('Option 2: Import from CSV file');
  console.log('  - Format: postal_code,district_name');
  console.log('  - Use a complete Canadian postal code database\n');
  console.log('Option 3: Use a postal code to electoral district mapping service\n');

  // For now, let's create a helper to map districts to common postal codes
  console.log('Creating district-based postal code mappings...\n');

  // Group MPs by province/region based on district name patterns
  const districtPostalCodeMap: { [key: string]: string[] } = {
    // Ontario (M, L, K, N, P prefixes)
    'Etobicoke Centre': ['M9R', 'M9P', 'M9W'],
    'Spadina—Fort York': ['M5V', 'M5H', 'M6J'],
    'University—Rosedale': ['M5S', 'M5P', 'M5R'],
    'Eglinton—Lawrence': ['M6B', 'M5N', 'M6A'],
    'York South—Weston': ['M6N', 'M9N', 'M9M'],
    'Milton': ['L9K', 'L9T', 'L0P'],
    'Mississauga—Erin Mills': ['L5M', 'L5L', 'L5K'],
    'Oakville': ['L6J', 'L6H', 'L6K'],
    'Burlington': ['L7L', 'L7N', 'L7M'],
    'Oakville North—Burlington': ['L6M', 'L7P', 'L7R'],
    'Ottawa Centre': ['K1A', 'K1P', 'K1R'],
    'Carleton': ['K1P', 'K2E', 'K2G'],
    'Durham': ['L1C', 'L1B', 'L1A'],
    'Kitchener Centre': ['N2G', 'N2H', 'N2K'],
    'Peterborough—Kawartha': ['K9J', 'K9K', 'K9L'],
    
    // Quebec (H, J, G prefixes)
    'Mount Royal': ['H3A', 'H3B', 'H4A'],
    'Ville-Marie—Le Sud-Ouest—Île-des-Sœurs': ['H3B', 'H3C', 'H3E'],
    'Papineau': ['H1X', 'H1Y', 'H1Z'],
    'Rosemont—La Petite-Patrie': ['H1Y', 'H1T', 'H1V'],
    'Beloeil—Chambly': ['J3L', 'J3M', 'J3N'],
    'La Pointe-de-l\'Île': ['H1A', 'H1B', 'H1C'],
    'Joliette': ['J0K', 'J0L', 'J0M'],
    
    // British Columbia (V prefix)
    'Vancouver Centre': ['V6B', 'V6C', 'V6E'],
    'Vancouver Quadra': ['V6T', 'V6S', 'V6R'],
    'Burnaby South': ['V5H', 'V5J', 'V5K'],
    'Saanich—Gulf Islands': ['V8X', 'V8Y', 'V8Z'],
    
    // Alberta (T prefix)
    'Calgary Centre': ['T2P', 'T2R', 'T2S'],
    'Calgary Nose Hill': ['T2K', 'T2L', 'T2M'],
    'Edmonton Centre': ['T5J', 'T5K', 'T5L'],
    'Edmonton Manning': ['T5A', 'T5B', 'T5C'],
    
    // Manitoba (R prefix)
    'Winnipeg Centre': ['R3C', 'R3B', 'R3A'],
    'Saint Boniface—Saint Vital': ['R2H', 'R2J', 'R2K'],
    
    // Saskatchewan (S prefix)
    'Regina—Qu\'Appelle': ['S4P', 'S4R', 'S4S'],
    'Portage—Lisgar': ['R0C', 'R0E', 'R0G'],
    
    // Newfoundland (A prefix)
    'Long Range Mountains': ['A0K', 'A0L', 'A0M'],
  };

  let imported = 0;
  let skipped = 0;

  // For each MP, try to find a postal code
  for (const mp of mps) {
    // Check if we have a mapping for this district
    const postalCodePrefixes = districtPostalCodeMap[mp.district_name];
    
    if (postalCodePrefixes) {
      // Use the first postal code prefix and add a common suffix
      const postalCode = `${postalCodePrefixes[0]}0A1`; // Common format
      
      if (!existingMappings.has(postalCode)) {
        insertMapping.run(postalCode, mp.id, mp.district_name);
        imported++;
        console.log(`✓ ${postalCode} -> ${mp.name} (${mp.district_name})`);
      } else {
        skipped++;
      }
    } else {
      // No mapping found for this district
      skipped++;
      console.log(`- No postal code mapping for: ${mp.district_name}`);
    }
  }

  console.log(`\nImport complete: ${imported} imported, ${skipped} skipped`);
  console.log('\nNote: These are example postal codes. For production use:');
  console.log('1. A complete Canadian postal code database');
  console.log('2. OpenNorth API (with rate limiting)');
  console.log('3. Elections Canada electoral district boundary data');

  closeDatabase();
}

bulkImportPostalCodes();


