import { getDatabase, closeDatabase } from '../lib/db/database';
import * as readline from 'readline';

/**
 * Import postal code to MP mappings manually
 * This script allows you to manually map postal codes to MPs in the database
 * 
 * Usage: 
 * 1. Run: npm run db:import-postal-codes
 * 2. Enter postal codes and select the matching MP from the list
 * 
 * For bulk import, you can also import from a CSV file with format:
 * postal_code,district_name
 */

interface PostalCodeMapping {
  postalCode: string;
  districtName: string;
  mpId: number;
}

async function importPostalCodes() {
  console.log('Postal Code Import Tool');
  console.log('======================\n');
  
  const db = getDatabase();

  // Get all MPs from database
  const mps = db.prepare('SELECT id, name, district_name FROM mps ORDER BY district_name').all() as Array<{
    id: number;
    name: string;
    district_name: string;
  }>;

  if (mps.length === 0) {
    console.error('No MPs found in database. Please run "npm run db:fetch-mps" first.');
    closeDatabase();
    return;
  }

  console.log(`Found ${mps.length} MPs in database\n`);

  const insertMapping = db.prepare(`
    INSERT OR REPLACE INTO postal_code_mappings (postal_code, mp_id, district_name)
    VALUES (?, ?, ?)
  `);

  // Example mappings - you can add more here or import from a file
  // Note: These are example postal codes. For production, you'll need a complete
  // postal code to electoral district mapping database.
  const exampleMappings: Array<{ postalCode: string; districtName: string }> = [
    // Toronto area
    { postalCode: 'M9R0A9', districtName: 'Etobicoke Centre' }, // Yvan Baker
    { postalCode: 'M5V3L9', districtName: 'Spadina—Fort York' }, // Chi Nguyen
    { postalCode: 'M5S1A1', districtName: 'University—Rosedale' }, // Chrystia Freeland
    { postalCode: 'M6B1A1', districtName: 'Eglinton—Lawrence' }, // Marco Mendicino
    { postalCode: 'M6N1A1', districtName: 'York South—Weston' }, // Ahmed Hussen
    { postalCode: 'L9K1A1', districtName: 'Milton' }, // Adam van Koeverden
    { postalCode: 'L5M1A1', districtName: 'Mississauga—Erin Mills' }, // Iqra Khalid
    { postalCode: 'L6J1A1', districtName: 'Oakville' }, // Anita Anand
    { postalCode: 'L7L1A1', districtName: 'Burlington' }, // Karina Gould
    { postalCode: 'L6M1A1', districtName: 'Oakville North—Burlington' }, // Pam Damoff
    
    // Ottawa area
    { postalCode: 'K1A0A6', districtName: 'Ottawa Centre' }, // Catherine McKenna / Yasir Naqvi
    { postalCode: 'K1P1A1', districtName: 'Carleton' }, // Pierre Poilievre
    
    // Montreal area
    { postalCode: 'H3A0A6', districtName: 'Mount Royal' }, // Anthony Housefather
    { postalCode: 'H3B1A1', districtName: 'Ville-Marie—Le Sud-Ouest—Île-des-Sœurs' }, // Marc Miller
    { postalCode: 'H1X1A1', districtName: 'Papineau' }, // Justin Trudeau
    { postalCode: 'H1Y1A1', districtName: 'Rosemont—La Petite-Patrie' }, // Alexandre Boulerice (NDP)
    { postalCode: 'J3L1A1', districtName: 'Beloeil—Chambly' }, // Yves-François Blanchet (Bloc)
    { postalCode: 'H1A1A1', districtName: 'La Pointe-de-l\'Île' }, // Mario Beaulieu (Bloc)
    { postalCode: 'J0K1A1', districtName: 'Joliette' }, // Gabriel Ste-Marie (Bloc)
    
    // Vancouver area
    { postalCode: 'V6B1A1', districtName: 'Vancouver Centre' }, // Hedy Fry
    { postalCode: 'V6T1A1', districtName: 'Vancouver Quadra' }, // Joyce Murray
    { postalCode: 'V5H1A1', districtName: 'Burnaby South' }, // Jagmeet Singh (NDP)
    
    // Calgary
    { postalCode: 'T2P1A1', districtName: 'Calgary Centre' }, // Kent Hehr
    { postalCode: 'T2K1A1', districtName: 'Calgary Nose Hill' }, // Michelle Rempel Garner (Conservative)
    
    // Edmonton
    { postalCode: 'T5J0A6', districtName: 'Edmonton Centre' }, // Randy Boissonnault
    
    // Winnipeg
    { postalCode: 'R3C0A6', districtName: 'Winnipeg Centre' },
    { postalCode: 'R2H1A1', districtName: 'Saint Boniface—Saint Vital' }, // Dan Vandal
    
    // Other cities
    { postalCode: 'K9J1A1', districtName: 'Peterborough—Kawartha' }, // Maryam Monsef
    { postalCode: 'R0C1A1', districtName: 'Portage—Lisgar' }, // Candice Bergen (Conservative)
    { postalCode: 'S4P1A1', districtName: 'Regina—Qu\'Appelle' }, // Andrew Scheer (Conservative)
    { postalCode: 'L1C1A1', districtName: 'Durham' }, // Erin O'Toole (Conservative)
    { postalCode: 'P0N1A1', districtName: 'Timmins—James Bay' }, // Charlie Angus (NDP)
    { postalCode: 'R9A1A1', districtName: 'Churchill—Keewatinook Aski' }, // Niki Ashton (NDP)
    { postalCode: 'V8X1A1', districtName: 'Saanich—Gulf Islands' }, // Elizabeth May (Green)
    { postalCode: 'N2G1A1', districtName: 'Kitchener Centre' }, // Mike Morrice (Green)
  ];

  console.log('Importing example postal code mappings...\n');

  let imported = 0;
  let skipped = 0;

  for (const mapping of exampleMappings) {
    const cleanPostalCode = mapping.postalCode.replace(/\s+/g, '').toUpperCase();
    
    // Find MP by district name
    const mp = mps.find(
      (m) => m.district_name.toLowerCase() === mapping.districtName.toLowerCase()
    );

    if (mp) {
      insertMapping.run(cleanPostalCode, mp.id, mp.district_name);
      imported++;
      console.log(`✓ ${cleanPostalCode} -> ${mp.name} (${mp.district_name})`);
    } else {
      console.log(`✗ ${cleanPostalCode} -> District not found: ${mapping.districtName}`);
      skipped++;
    }
  }

  console.log(`\nImport complete: ${imported} imported, ${skipped} skipped`);
  console.log('\nTo add more postal codes:');
  console.log('1. Edit scripts/import-postal-codes.ts and add to exampleMappings array');
  console.log('2. Or import from CSV file (format: postal_code,district_name)');
  console.log('3. Or use a postal code database and map to electoral districts');

  closeDatabase();
}

importPostalCodes();
