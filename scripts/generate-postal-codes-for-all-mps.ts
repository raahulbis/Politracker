import { getDatabase, closeDatabase } from '../lib/db/database';

/**
 * Generate postal code mappings for ALL MPs
 * This creates at least one postal code per MP based on district patterns
 */

interface DistrictPattern {
  pattern: RegExp;
  postalCodePrefix: string;
}

// Map district name patterns to postal code prefixes
const districtPatterns: DistrictPattern[] = [
  // Ontario - Toronto (M prefix)
  { pattern: /Toronto|Etobicoke|Scarborough|North York|York|East York/i, postalCodePrefix: 'M' },
  { pattern: /Mississauga|Brampton|Oakville|Burlington|Milton|Halton/i, postalCodePrefix: 'L' },
  { pattern: /Ottawa|Carleton|Kanata|Nepean/i, postalCodePrefix: 'K' },
  { pattern: /Hamilton|St\. Catharines|Niagara|Burlington/i, postalCodePrefix: 'L' },
  { pattern: /London|Windsor|Chatham|Sarnia/i, postalCodePrefix: 'N' },
  { pattern: /Kitchener|Waterloo|Cambridge|Guelph/i, postalCodePrefix: 'N' },
  { pattern: /Peterborough|Oshawa|Whitby|Ajax|Pickering/i, postalCodePrefix: 'L' },
  { pattern: /Barrie|Orillia|Collingwood/i, postalCodePrefix: 'L' },
  { pattern: /Sudbury|North Bay|Sault Ste\. Marie|Thunder Bay/i, postalCodePrefix: 'P' },
  { pattern: /Timmins|Cochrane|Kapuskasing/i, postalCodePrefix: 'P' },
  
  // Quebec (H, J, G prefixes)
  { pattern: /Montreal|Montréal|Laval|Longueuil|Brossard/i, postalCodePrefix: 'H' },
  { pattern: /Québec|Quebec City|Lévis|Beauport/i, postalCodePrefix: 'G' },
  { pattern: /Sherbrooke|Trois-Rivières|Drummondville|Granby/i, postalCodePrefix: 'J' },
  { pattern: /Saguenay|Chicoutimi|Jonquière/i, postalCodePrefix: 'G' },
  { pattern: /Gatineau|Hull|Aylmer/i, postalCodePrefix: 'J' },
  
  // British Columbia (V prefix)
  { pattern: /Vancouver|Burnaby|Richmond|Surrey|Coquitlam|New Westminster/i, postalCodePrefix: 'V' },
  { pattern: /Victoria|Saanich|Nanaimo|Kelowna|Kamloops/i, postalCodePrefix: 'V' },
  
  // Alberta (T prefix)
  { pattern: /Calgary|Edmonton|Red Deer|Lethbridge|Medicine Hat/i, postalCodePrefix: 'T' },
  
  // Manitoba (R prefix)
  { pattern: /Winnipeg|Brandon|Thompson/i, postalCodePrefix: 'R' },
  
  // Saskatchewan (S prefix)
  { pattern: /Regina|Saskatoon|Prince Albert|Moose Jaw/i, postalCodePrefix: 'S' },
  
  // Nova Scotia (B prefix)
  { pattern: /Halifax|Dartmouth|Sydney|Truro/i, postalCodePrefix: 'B' },
  
  // New Brunswick (E prefix)
  { pattern: /Saint John|Moncton|Fredericton/i, postalCodePrefix: 'E' },
  
  // Newfoundland (A prefix)
  { pattern: /St\. John's|Mount Pearl|Corner Brook/i, postalCodePrefix: 'A' },
  
  // Prince Edward Island (C prefix)
  { pattern: /Charlottetown|Summerside/i, postalCodePrefix: 'C' },
  
  // Yukon (Y prefix)
  { pattern: /Yukon|Whitehorse/i, postalCodePrefix: 'Y' },
  
  // Northwest Territories (X prefix)
  { pattern: /Northwest Territories|Yellowknife/i, postalCodePrefix: 'X' },
  
  // Nunavut (X prefix)
  { pattern: /Nunavut|Iqaluit/i, postalCodePrefix: 'X' },
];

function generatePostalCodeForDistrict(districtName: string): string {
  // Find matching pattern
  for (const { pattern, postalCodePrefix } of districtPatterns) {
    if (pattern.test(districtName)) {
      // Generate a postal code based on the prefix
      // Format: A1A 1A1 (prefix + number + letter + space + number + letter + number)
      const firstPart = postalCodePrefix + Math.floor(Math.random() * 9 + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
      const secondPart = Math.floor(Math.random() * 9 + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 9 + 1);
      return firstPart + secondPart;
    }
  }
  
  // Default: use a generic pattern
  const defaultPrefix = 'K'; // Ontario default
  const firstPart = defaultPrefix + Math.floor(Math.random() * 9 + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const secondPart = Math.floor(Math.random() * 9 + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(Math.random() * 9 + 1);
  return firstPart + secondPart;
}

async function generatePostalCodesForAllMPs() {
  console.log('Generating Postal Code Mappings for All MPs');
  console.log('==========================================\n');

  const db = getDatabase();

  // Get all MPs
  const mps = db.prepare('SELECT id, name, district_name FROM mps ORDER BY district_name').all() as Array<{
    id: number;
    name: string;
    district_name: string;
  }>;

  console.log(`Found ${mps.length} MPs in database\n`);

  // Get existing postal code mappings
  const existingMappings = db.prepare('SELECT postal_code, district_name FROM postal_code_mappings').all() as Array<{
    postal_code: string;
    district_name: string;
  }>;

  const existingByDistrict = new Map<string, string[]>();
  for (const mapping of existingMappings) {
    if (!existingByDistrict.has(mapping.district_name)) {
      existingByDistrict.set(mapping.district_name, []);
    }
    existingByDistrict.get(mapping.district_name)!.push(mapping.postal_code);
  }

  console.log(`Already have ${existingMappings.length} postal code mappings\n`);

  const insertMapping = db.prepare(`
    INSERT OR REPLACE INTO postal_code_mappings (postal_code, mp_id, district_name)
    VALUES (?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;
  const usedPostalCodes = new Set(existingMappings.map(m => m.postal_code));

  console.log('Generating postal codes for each MP...\n');

  // Check which MPs already have postal codes
  const mpsWithPostalCodes = new Set(
    (db.prepare('SELECT DISTINCT mp_id FROM postal_code_mappings').all() as Array<{ mp_id: number }>)
      .map(m => m.mp_id)
  );

  for (const mp of mps) {
    // Check if this specific MP already has a postal code mapping
    if (mpsWithPostalCodes.has(mp.id)) {
      skipped++;
      // Don't log every skip to avoid spam
      if (skipped <= 10 || skipped % 50 === 0) {
        console.log(`- ${mp.name} (${mp.district_name}) already has postal code`);
      }
    } else {
      // Generate a postal code for this MP
      let postalCode = generatePostalCodeForDistrict(mp.district_name);
      
      // Ensure uniqueness
      let attempts = 0;
      while (usedPostalCodes.has(postalCode) && attempts < 20) {
        postalCode = generatePostalCodeForDistrict(mp.district_name);
        attempts++;
      }
      
      if (!usedPostalCodes.has(postalCode)) {
        insertMapping.run(postalCode, mp.id, mp.district_name);
        usedPostalCodes.add(postalCode);
        mpsWithPostalCodes.add(mp.id);
        imported++;
        console.log(`✓ ${postalCode} -> ${mp.name} (${mp.district_name})`);
      } else {
        skipped++;
        console.log(`✗ Could not generate unique postal code for: ${mp.name} (${mp.district_name})`);
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total MPs: ${mps.length}`);
  console.log(`New postal codes generated: ${imported}`);
  console.log(`Skipped (already have mappings): ${skipped}`);
  console.log(`Total postal code mappings: ${existingMappings.length + imported}`);
  
  console.log('\n⚠️  IMPORTANT: These are GENERATED postal codes for testing.');
  console.log('For production use, you need:');
  console.log('1. A complete Canadian postal code database');
  console.log('2. Elections Canada electoral district boundary data');
  console.log('3. A postal code to electoral district mapping service');
  console.log('\nTo get real postal codes, you can:');
  console.log('- Use OpenNorth Represent API (with rate limits)');
  console.log('- Purchase a postal code database');
  console.log('- Use Elections Canada boundary files with geocoding');

  closeDatabase();
}

generatePostalCodesForAllMPs();

