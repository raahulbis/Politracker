import { getDatabase, closeDatabase } from '../lib/db/database';

/**
 * Add sample MPs to the database for testing
 * This is a temporary solution until we get the XML import working
 */
async function addSampleMPs() {
  console.log('Adding sample MPs to database...');
  const db = getDatabase();

  const sampleMPs = [
    {
      name: 'Yvan Baker',
      firstName: 'Yvan',
      lastName: 'Baker',
      partyName: 'Liberal',
      districtName: 'Etobicoke Centre',
      districtId: '35029',
      elected_office: 'MP',
    },
    {
      name: 'Chi Nguyen',
      firstName: 'Chi',
      lastName: 'Nguyen',
      partyName: 'Liberal',
      districtName: 'Spadina—Fort York',
      districtId: '35101',
      elected_office: 'MP',
    },
    {
      name: 'Justin Trudeau',
      firstName: 'Justin',
      lastName: 'Trudeau',
      partyName: 'Liberal',
      districtName: 'Papineau',
      districtId: '24035',
      elected_office: 'MP',
    },
  ];

  const insertMP = db.prepare(`
    INSERT OR REPLACE INTO mps (
      name, first_name, last_name, party_name,
      district_name, district_id, elected_office, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const transaction = db.transaction((mps: typeof sampleMPs) => {
    for (const mp of mps) {
      insertMP.run(
        mp.name,
        mp.firstName,
        mp.lastName,
        mp.partyName,
        mp.districtName,
        mp.districtId,
        mp.elected_office
      );
      console.log(`✓ Added ${mp.name} (${mp.districtName})`);
    }
  });

  transaction(sampleMPs);
  console.log(`\nSuccessfully added ${sampleMPs.length} sample MPs`);
  closeDatabase();
}

addSampleMPs();


