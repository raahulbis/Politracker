import { getDatabase, closeDatabase } from '../lib/db/database';

/**
 * Add a comprehensive list of sample MPs covering major cities and parties
 * This is a temporary solution until we can get the XML import working
 * 
 * Note: These are example MPs. For production, you should:
 * 1. Get the official list from House of Commons
 * 2. Use a postal code to electoral district mapping service
 * 3. Import all MPs from the official source
 */

interface MPData {
  name: string;
  firstName: string;
  lastName: string;
  partyName: string;
  districtName: string;
  districtId?: string;
  email?: string;
  url?: string;
}

async function addComprehensiveMPs() {
  console.log('Adding comprehensive list of sample MPs...');
  const db = getDatabase();

  // Comprehensive list of MPs from major cities and all parties
  const mps: MPData[] = [
    // Liberal Party
    { name: 'Yvan Baker', firstName: 'Yvan', lastName: 'Baker', partyName: 'Liberal', districtName: 'Etobicoke Centre', districtId: '35029' },
    { name: 'Chi Nguyen', firstName: 'Chi', lastName: 'Nguyen', partyName: 'Liberal', districtName: 'Spadina—Fort York', districtId: '35101' },
    { name: 'Justin Trudeau', firstName: 'Justin', lastName: 'Trudeau', partyName: 'Liberal', districtName: 'Papineau', districtId: '24035' },
    { name: 'Chrystia Freeland', firstName: 'Chrystia', lastName: 'Freeland', partyName: 'Liberal', districtName: 'University—Rosedale', districtId: '35109' },
    { name: 'Marco Mendicino', firstName: 'Marco', lastName: 'Mendicino', partyName: 'Liberal', districtName: 'Eglinton—Lawrence', districtId: '35033' },
    { name: 'Ahmed Hussen', firstName: 'Ahmed', lastName: 'Hussen', partyName: 'Liberal', districtName: 'York South—Weston', districtId: '35110' },
    { name: 'Maryam Monsef', firstName: 'Maryam', lastName: 'Monsef', partyName: 'Liberal', districtName: 'Peterborough—Kawartha', districtId: '35075' },
    
    // Conservative Party
    { name: 'Pierre Poilievre', firstName: 'Pierre', lastName: 'Poilievre', partyName: 'Conservative', districtName: 'Carleton', districtId: '35020' },
    { name: 'Candice Bergen', firstName: 'Candice', lastName: 'Bergen', partyName: 'Conservative', districtName: 'Portage—Lisgar', districtId: '46008' },
    { name: 'Michelle Rempel Garner', firstName: 'Michelle', lastName: 'Rempel Garner', partyName: 'Conservative', districtName: 'Calgary Nose Hill', districtId: '48005' },
    { name: 'Andrew Scheer', firstName: 'Andrew', lastName: 'Scheer', partyName: 'Conservative', districtName: 'Regina—Qu\'Appelle', districtId: '47008' },
    { name: 'Erin O\'Toole', firstName: 'Erin', lastName: 'O\'Toole', partyName: 'Conservative', districtName: 'Durham', districtId: '35032' },
    
    // NDP
    { name: 'Jagmeet Singh', firstName: 'Jagmeet', lastName: 'Singh', partyName: 'New Democratic Party', districtName: 'Burnaby South', districtId: '59003' },
    { name: 'Charlie Angus', firstName: 'Charlie', lastName: 'Angus', partyName: 'New Democratic Party', districtName: 'Timmins—James Bay', districtId: '35096' },
    { name: 'Niki Ashton', firstName: 'Niki', lastName: 'Ashton', partyName: 'New Democratic Party', districtName: 'Churchill—Keewatinook Aski', districtId: '46002' },
    { name: 'Alexandre Boulerice', firstName: 'Alexandre', lastName: 'Boulerice', partyName: 'New Democratic Party', districtName: 'Rosemont—La Petite-Patrie', districtId: '24033' },
    
    // Bloc Québécois
    { name: 'Yves-François Blanchet', firstName: 'Yves-François', lastName: 'Blanchet', partyName: 'Bloc Québécois', districtName: 'Beloeil—Chambly', districtId: '24005' },
    { name: 'Mario Beaulieu', firstName: 'Mario', lastName: 'Beaulieu', partyName: 'Bloc Québécois', districtName: 'La Pointe-de-l\'Île', districtId: '24020' },
    { name: 'Gabriel Ste-Marie', firstName: 'Gabriel', lastName: 'Ste-Marie', partyName: 'Bloc Québécois', districtName: 'Joliette', districtId: '24022' },
    
    // Green Party
    { name: 'Elizabeth May', firstName: 'Elizabeth', lastName: 'May', partyName: 'Green Party', districtName: 'Saanich—Gulf Islands', districtId: '59028' },
    { name: 'Mike Morrice', firstName: 'Mike', lastName: 'Morrice', partyName: 'Green Party', districtName: 'Kitchener Centre', districtId: '35050' },
    
    // More MPs from major cities
    { name: 'Adam van Koeverden', firstName: 'Adam', lastName: 'van Koeverden', partyName: 'Liberal', districtName: 'Milton', districtId: '35060' },
    { name: 'Iqra Khalid', firstName: 'Iqra', lastName: 'Khalid', partyName: 'Liberal', districtName: 'Mississauga—Erin Mills', districtId: '35064' },
    { name: 'Anita Anand', firstName: 'Anita', lastName: 'Anand', partyName: 'Liberal', districtName: 'Oakville', districtId: '35070' },
    { name: 'Karina Gould', firstName: 'Karina', lastName: 'Gould', partyName: 'Liberal', districtName: 'Burlington', districtId: '35015' },
    { name: 'Pam Damoff', firstName: 'Pam', lastName: 'Damoff', partyName: 'Liberal', districtName: 'Oakville North—Burlington', districtId: '35071' },
    
    // Vancouver area
    { name: 'Hedy Fry', firstName: 'Hedy', lastName: 'Fry', partyName: 'Liberal', districtName: 'Vancouver Centre', districtId: '59032' },
    { name: 'Joyce Murray', firstName: 'Joyce', lastName: 'Murray', partyName: 'Liberal', districtName: 'Vancouver Quadra', districtId: '59033' },
    
    // Montreal area
    { name: 'Anthony Housefather', firstName: 'Anthony', lastName: 'Housefather', partyName: 'Liberal', districtName: 'Mount Royal', districtId: '24025' },
    { name: 'Marc Miller', firstName: 'Marc', lastName: 'Miller', partyName: 'Liberal', districtName: 'Ville-Marie—Le Sud-Ouest—Île-des-Sœurs', districtId: '24036' },
    
    // Calgary
    { name: 'Kent Hehr', firstName: 'Kent', lastName: 'Hehr', partyName: 'Liberal', districtName: 'Calgary Centre', districtId: '48004' },
    
    // Edmonton
    { name: 'Randy Boissonnault', firstName: 'Randy', lastName: 'Boissonnault', partyName: 'Liberal', districtName: 'Edmonton Centre', districtId: '48011' },
    
    // Winnipeg
    { name: 'Dan Vandal', firstName: 'Dan', lastName: 'Vandal', partyName: 'Liberal', districtName: 'Saint Boniface—Saint Vital', districtId: '46010' },
    
    // Ottawa
    { name: 'Catherine McKenna', firstName: 'Catherine', lastName: 'McKenna', partyName: 'Liberal', districtName: 'Ottawa Centre', districtId: '35072' },
    { name: 'Yasir Naqvi', firstName: 'Yasir', lastName: 'Naqvi', partyName: 'Liberal', districtName: 'Ottawa Centre', districtId: '35072' },
  ];

  const insertMP = db.prepare(`
    INSERT OR REPLACE INTO mps (
      name, first_name, last_name, party_name,
      district_name, district_id, elected_office, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'MP', CURRENT_TIMESTAMP)
  `);

  const transaction = db.transaction((mps: MPData[]) => {
    for (const mp of mps) {
      insertMP.run(
        mp.name,
        mp.firstName,
        mp.lastName,
        mp.partyName,
        mp.districtName,
        mp.districtId || null
      );
      console.log(`✓ Added ${mp.name} (${mp.partyName}) - ${mp.districtName}`);
    }
  });

  transaction(mps);
  console.log(`\nSuccessfully added ${mps.length} MPs to database`);
  console.log('\nNext steps:');
  console.log('1. Run: npm run db:import-postal-codes (to add more postal code mappings)');
  console.log('2. Run: npm run db:update-headshots (to update MP photos)');
  closeDatabase();
}

addComprehensiveMPs();



