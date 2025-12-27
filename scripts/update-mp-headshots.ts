import { getDatabase, closeDatabase } from '../lib/db/database';
import axios from 'axios';

/**
 * Update MP headshot URLs based on House of Commons URL pattern
 * Pattern: {{lastname}}{{firstname}}_{{party}}.jpg
 * Base URL: https://www.ourcommons.ca/Content/Parliamentarians/Images/OfficialMPPhotos/
 * 
 * Party abbreviations:
 * - Conservative -> CPC
 * - Liberal -> LIB
 * - Bloc Québécois -> BQ
 * - NDP / New Democratic Party -> NDP
 * - Green Party -> GP
 */

// Base URL for House of Commons MP photos
// URL structure: https://www.ourcommons.ca/Content/Parliamentarians/Images/OfficialMPPhotos/45/{lastname}{firstname}_{party}.jpg
// 45 is the current parliament number (45th Parliament)
const PARLIAMENT_NUMBER = '45';
const HEADSHOT_BASE_URL = `https://www.ourcommons.ca/Content/Parliamentarians/Images/OfficialMPPhotos/${PARLIAMENT_NUMBER}/`;

// Map party names to abbreviations
const PARTY_ABBREVIATIONS: Record<string, string> = {
  'Conservative': 'CPC',
  'Conservative Party': 'CPC',
  'Conservative Party of Canada': 'CPC',
  'Liberal': 'LIB',
  'Liberal Party': 'LIB',
  'Liberal Party of Canada': 'LIB',
  'Bloc Québécois': 'BQ',
  'Bloc': 'BQ',
  'NDP': 'NDP',
  'New Democratic Party': 'NDP',
  'New Democratic Party of Canada': 'NDP',
  'Green Party': 'GP',
  'Green Party of Canada': 'GP',
};

/**
 * Convert name to URL-safe format (remove accents, special chars, lowercase)
 * Preserves hyphens in names
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD') // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except hyphens
    .trim();
}

/**
 * Generate headshot URL for an MP
 * Pattern: {{lastname}}{{firstname}}_{{party}}.jpg
 */
function generateHeadshotURL(firstName: string | null, lastName: string | null, partyName: string | null): string | null {
  if (!lastName || !partyName) {
    return null;
  }

  // Get party abbreviation
  const partyAbbr = PARTY_ABBREVIATIONS[partyName] || null;
  if (!partyAbbr) {
    return null;
  }

  // Normalize names - remove accents, special chars, lowercase, no spaces
  const normalizedLastName = normalizeName(lastName);
  const normalizedFirstName = firstName ? normalizeName(firstName) : '';

  // Construct filename: lastnamefirstname_PARTY.jpg
  // Example: "Baker" + "Yvan" + "_" + "LIB" + ".jpg" = "bakeryvan_LIB.jpg"
  const filename = `${normalizedLastName}${normalizedFirstName}_${partyAbbr}.jpg`;
  
  return `${HEADSHOT_BASE_URL}${filename}`;
}

/**
 * Verify if a headshot URL exists
 */
async function verifyHeadshotURL(url: string): Promise<boolean> {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 404,
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function updateMPHeadshots() {
  console.log('Wiping and re-importing MP headshot URLs...\n');
  const db = getDatabase();

  // Step 1: Wipe all existing photo URLs
  console.log('Step 1: Clearing all existing photo URLs...');
  const wipeResult = db.prepare(`
    UPDATE mps 
    SET photo_url = NULL, updated_at = CURRENT_TIMESTAMP
  `).run();
  console.log(`Cleared ${wipeResult.changes} MP photo URLs\n`);

  // Step 2: Get all MPs
  const mps = db.prepare(`
    SELECT id, name, first_name, last_name, party_name, photo_url 
    FROM mps 
    ORDER BY name
  `).all() as Array<{
    id: number;
    name: string;
    first_name: string | null;
    last_name: string | null;
    party_name: string | null;
    photo_url: string | null;
  }>;

  console.log(`Step 2: Processing ${mps.length} MPs to generate new headshot URLs...\n`);

  // Update all MPs with new headshot URLs
  const updateMP = db.prepare(`
    UPDATE mps 
    SET photo_url = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `);

  let updated = 0;
  let skipped = 0;
  let verified = 0;
  let notFound = 0;

  for (const mp of mps) {
    // Generate headshot URL
    const headshotURL = generateHeadshotURL(
      mp.first_name,
      mp.last_name || mp.name.split(' ').pop() || null,
      mp.party_name
    );

    if (!headshotURL) {
      console.log(`✗ ${mp.name}: Could not generate URL (missing last_name or party_name)`);
      skipped++;
      continue;
    }

    // Verify URL exists (for first few to confirm pattern works)
    const shouldVerify = updated < 10; // Verify first 10
    if (shouldVerify) {
      const exists = await verifyHeadshotURL(headshotURL);
      if (exists) {
        verified++;
        console.log(`✓ ${mp.name}: ${headshotURL} (verified)`);
      } else {
        notFound++;
        console.log(`⚠ ${mp.name}: ${headshotURL} (not found, but URL pattern applied)`);
        // Still update - the URL pattern might be correct but image might not exist yet
        // or the verification might fail due to network issues
      }
      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } else {
      console.log(`✓ ${mp.name}: ${headshotURL}`);
    }

    // Update database with new headshot URL
    const result = updateMP.run(headshotURL, mp.id);
    if (result.changes > 0) {
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total MPs: ${mps.length}`);
  console.log(`Updated with new headshot URLs: ${updated}`);
  console.log(`Skipped: ${skipped} (MPs missing required data for URL generation)`);
  if (verified > 0 || notFound > 0) {
    console.log(`Verified URLs: ${verified}`);
    console.log(`URLs not found: ${notFound}`);
  }
  console.log(`\nNote: All existing photo URLs were wiped and re-generated.`);

  closeDatabase();
}

updateMPHeadshots();

