import { getDatabase, closeDatabase } from '../lib/db/database';

/**
 * Fix postal code mappings by updating mp_id based on district_name
 * This ensures mappings work even after MP imports that change IDs
 */
async function fixPostalCodeMappings() {
  console.log('Fixing postal code mappings...');
  const db = getDatabase();

  // Get all postal code mappings
  const mappings = db.prepare('SELECT postal_code, mp_id, district_name FROM postal_code_mappings').all() as Array<{
    postal_code: string;
    mp_id: number;
    district_name: string;
  }>;

  console.log(`Found ${mappings.length} postal code mappings\n`);

  const updateMapping = db.prepare(`
    UPDATE postal_code_mappings 
    SET mp_id = ? 
    WHERE postal_code = ?
  `);

  let updated = 0;
  let notFound = 0;

  for (const mapping of mappings) {
    // Find the current MP for this district
    const mp = db.prepare('SELECT id FROM mps WHERE district_name = ? LIMIT 1').get(mapping.district_name) as { id: number } | undefined;

    if (mp && mp.id !== mapping.mp_id) {
      updateMapping.run(mp.id, mapping.postal_code);
      updated++;
      console.log(`✓ Updated ${mapping.postal_code} -> MP ID ${mp.id} (${mapping.district_name})`);
    } else if (!mp) {
      notFound++;
      console.log(`✗ No MP found for district: ${mapping.district_name} (postal code: ${mapping.postal_code})`);
    } else {
      console.log(`- ${mapping.postal_code} already correct (MP ID: ${mapping.mp_id})`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total mappings: ${mappings.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Already correct: ${mappings.length - updated - notFound}`);

  closeDatabase();
}

fixPostalCodeMappings();

