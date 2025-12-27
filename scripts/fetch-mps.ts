import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { getDatabase, closeDatabase } from '../lib/db/database';
import { calculateMPSalary } from '../lib/utils/mp-salary';
import * as https from 'https';

const COMMONS_BASE = 'https://www.ourcommons.ca';

/**
 * Generate slug from first name and last name
 * e.g., "Ziad Aboultaif" -> "ziad-aboultaif"
 */
function nameToSlug(firstName: string, lastName: string): string {
  const first = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  const last = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  return `${first}-${last}`;
}

/**
 * Fetch individual MP profile XML to get committees and associations
 */
async function fetchMPProfileXML(personId: string, firstName: string, lastName: string): Promise<{
  committees?: CommitteeMemberRole[];
  associations?: ParliamentaryAssociationRole[];
  parliamentary_positions?: ParliamentaryPositionRole[];
}> {
  try {
    const slug = nameToSlug(firstName, lastName);
    const profileUrl = `${COMMONS_BASE}/Members/en/${slug}(${personId})/xml`;
    
    // Note: This is a development script. In production code, always verify SSL certificates.
    const httpsAgent = new https.Agent({
      rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'false'
    });

    const response = await axios.get(profileUrl, {
      httpsAgent,
      responseType: 'text',
      headers: {
        'Accept': 'application/xml, text/xml',
        'User-Agent': 'Mozilla/5.0',
      },
      timeout: 10000,
    });

    const result = await parseStringPromise(response.data, {
      trim: true,
      explicitArray: true,
      mergeAttrs: false,
      explicitRoot: true,
      ignoreAttrs: false,
    });

    const committees: CommitteeMemberRole[] = [];
    const associations: ParliamentaryAssociationRole[] = [];
    const parliamentary_positions: ParliamentaryPositionRole[] = [];

    // Navigate to Profile element - the root is Profile
    // With explicitRoot: true, the result will have a Profile key
    const profile = result.Profile || result;
    
    // Debug: log structure for troubleshooting (check first few MPs)
    const shouldDebug = parseInt(personId) >= 110530 && parseInt(personId) <= 110540;
    if (shouldDebug) {
      console.log(`  [DEBUG ${personId}] Profile keys:`, Object.keys(profile || {}));
      console.log(`  [DEBUG ${personId}] Has ParliamentaryPositionRoles:`, !!profile?.ParliamentaryPositionRoles);
      if (profile?.ParliamentaryPositionRoles) {
        console.log(`  [DEBUG ${personId}] ParliamentaryPositionRoles type:`, typeof profile.ParliamentaryPositionRoles);
        console.log(`  [DEBUG ${personId}] ParliamentaryPositionRoles keys:`, Object.keys(profile.ParliamentaryPositionRoles));
      }
    }

    // Extract CommitteeMemberRoles
    if (profile?.CommitteeMemberRoles?.CommitteeMemberRole) {
      const committeeRoles = Array.isArray(profile.CommitteeMemberRoles.CommitteeMemberRole)
        ? profile.CommitteeMemberRoles.CommitteeMemberRole
        : [profile.CommitteeMemberRoles.CommitteeMemberRole];

      for (const role of committeeRoles) {
        const getValue = (field: any): string | number | null => {
          if (Array.isArray(field)) {
            return field[0] || null;
          }
          if (typeof field === 'string' || typeof field === 'number') {
            return field;
          }
          if (field && typeof field === 'object' && field._) {
            return field._;
          }
          return null;
        };

        committees.push({
          parliament_number: typeof getValue(role.ParliamentNumber) === 'number' ? getValue(role.ParliamentNumber) as number : parseInt(getValue(role.ParliamentNumber) as string || '0', 10) || undefined,
          session_number: typeof getValue(role.SessionNumber) === 'number' ? getValue(role.SessionNumber) as number : parseInt(getValue(role.SessionNumber) as string || '0', 10) || undefined,
          affiliation_role_name: getValue(role.AffiliationRoleName) as string || undefined,
          committee_name: getValue(role.CommitteeName) as string || undefined,
          from_date_time: getValue(role.FromDateTime) as string || undefined,
          to_date_time: getValue(role.ToDateTime) as string | null || null,
        });
      }
    }

    // Extract ParliamentaryAssociationsandInterparliamentaryGroupRoles
    if (profile?.ParliamentaryAssociationsandInterparliamentaryGroupRoles?.ParliamentaryAssociationsandInterparliamentaryGroupRole) {
      const assocRoles = Array.isArray(profile.ParliamentaryAssociationsandInterparliamentaryGroupRoles.ParliamentaryAssociationsandInterparliamentaryGroupRole)
        ? profile.ParliamentaryAssociationsandInterparliamentaryGroupRoles.ParliamentaryAssociationsandInterparliamentaryGroupRole
        : [profile.ParliamentaryAssociationsandInterparliamentaryGroupRoles.ParliamentaryAssociationsandInterparliamentaryGroupRole];

      for (const role of assocRoles) {
        const getValue = (field: any): string | null => {
          if (Array.isArray(field)) {
            return field[0] || null;
          }
          if (typeof field === 'string') {
            return field;
          }
          if (field && typeof field === 'object' && field._) {
            return field._;
          }
          return null;
        };

        associations.push({
          association_member_role_type: getValue(role.AssociationMemberRoleType) as string || undefined,
          title: getValue(role.Title) as string || undefined,
          organization: getValue(role.Organization) as string || undefined,
        });
      }
    }

    // Extract ParliamentaryPositionRoles
    // xml2js with explicitArray: true parses this as an array containing objects with ParliamentaryPositionRole property
    let positionRoles: any[] = [];
    if (profile?.ParliamentaryPositionRoles) {
      const positions = profile.ParliamentaryPositionRoles;
      
      // xml2js parses this as an array (even if there's only one ParliamentaryPositionRoles element)
      if (Array.isArray(positions)) {
        // Iterate through the array (usually just one element)
        for (const posContainer of positions) {
          // Each container has a ParliamentaryPositionRole property which is an array
          if (posContainer?.ParliamentaryPositionRole) {
            const roles = Array.isArray(posContainer.ParliamentaryPositionRole)
              ? posContainer.ParliamentaryPositionRole
              : [posContainer.ParliamentaryPositionRole];
            positionRoles.push(...roles);
          }
        }
      }
      // Fallback: if it's not an array, check for ParliamentaryPositionRole property directly
      else if (positions.ParliamentaryPositionRole) {
        positionRoles = Array.isArray(positions.ParliamentaryPositionRole)
          ? positions.ParliamentaryPositionRole
          : [positions.ParliamentaryPositionRole];
      }
    }

    if (positionRoles.length > 0) {
      for (const role of positionRoles) {
        const getValue = (field: any): string | null => {
          if (Array.isArray(field)) {
            // If it's an array, get the first element
            const first = field[0];
            // Check if the first element is an object with xsi:nil
            if (first && typeof first === 'object' && first.$ && first.$['xsi:nil'] === 'true') {
              return null;
            }
            // Otherwise return the first element (which might be a string or object)
            return first || null;
          }
          if (typeof field === 'string') {
            return field;
          }
          if (field && typeof field === 'object') {
            // Handle xsi:nil="true" - check for $ attribute
            if (field.$ && field.$['xsi:nil'] === 'true') {
              return null;
            }
            // Check for text content in _ property
            if (field._) {
              return field._;
            }
          }
          return null;
        };

        const title = getValue(role.Title);
        const fromDateTime = getValue(role.FromDateTime);
        const toDateTime = getValue(role.ToDateTime);
        
        if (title) {
          parliamentary_positions.push({
            title: title as string,
            from_date_time: fromDateTime as string || undefined,
            to_date_time: toDateTime as string | null || null,
          });
        }
      }
    }

    if (parliamentary_positions.length > 0) {
      console.log(`  ✓ Found ${parliamentary_positions.length} parliamentary position(s) for ${personId}: ${parliamentary_positions.map(p => p.title).join(', ')}`);
    }
    
    if (committees.length === 0 && associations.length === 0 && parliamentary_positions.length === 0) {
      // Debug: log if we got the XML but no data
      console.log(`  ⚠ No committees/associations/positions found in XML for ${personId}`);
    }

    return { committees, associations, parliamentary_positions };
  } catch (error: any) {
    // Silently fail - not all MPs may have profile XML available
    if (error.response?.status !== 404) {
      console.error(`Error fetching profile XML for ${personId}:`, error.message);
    }
    return {};
  }
}

interface CommitteeMemberRole {
  parliament_number?: number;
  session_number?: number;
  affiliation_role_name?: string;
  committee_name?: string;
  from_date_time?: string;
  to_date_time?: string | null;
}

interface ParliamentaryAssociationRole {
  association_member_role_type?: string;
  title?: string;
  organization?: string;
}

interface ParliamentaryPositionRole {
  title?: string;
  from_date_time?: string;
  to_date_time?: string | null;
}

interface MPData {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  photoUrl?: string;
  partyName?: string;
  districtName: string;
  districtId?: string;
  url?: string;
  gender?: string;
  committees?: CommitteeMemberRole[];
  associations?: ParliamentaryAssociationRole[];
  parliamentary_positions?: ParliamentaryPositionRole[];
}

async function fetchCurrentMPs(): Promise<MPData[]> {
  try {
    // Correct XML endpoint: https://www.ourcommons.ca/Members/en/search/XML
    console.log('Fetching XML from House of Commons...');
    console.log('URL: https://www.ourcommons.ca/Members/en/search/XML');
    
    // Note: For development, we may need to bypass SSL certificate validation
    // In production, ensure proper certificate handling
    const https = require('https');
    // Note: This is a development script. In production code, always verify SSL certificates.
    const agent = new https.Agent({
      rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED === 'false'
    });

    const response = await axios.get(`${COMMONS_BASE}/Members/en/search/XML`, {
      responseType: 'text',
      headers: {
        'Accept': 'application/xml, text/xml',
        'User-Agent': 'Mozilla/5.0',
      },
      httpsAgent: agent,
      validateStatus: (status) => status < 500, // Don't throw on 4xx
    });

    // Check if we got HTML instead of XML
    if (response.data.trim().startsWith('<!DOCTYPE') || response.data.trim().startsWith('<html')) {
      throw new Error('Received HTML instead of XML. The XML endpoint may have changed.');
    }

    console.log('XML received, length:', response.data.length);
    console.log('First 500 chars:', response.data.substring(0, 500));

    // Parse XML - the structure is ArrayOfMemberOfParliament > MemberOfParliament
    const result = await parseStringPromise(response.data, {
      trim: true,
      explicitArray: false, // Don't force arrays - let xml2js decide
      mergeAttrs: false,
      explicitRoot: false, // Don't include root in result
      ignoreAttrs: false,
    });

    console.log('XML parsed successfully');

    const mps: MPData[] = [];

    // Navigate the XML structure: ArrayOfMemberOfParliament > MemberOfParliament
    let members: any[] = [];
    
    // Handle different possible structures
    if (result.ArrayOfMemberOfParliament) {
      if (result.ArrayOfMemberOfParliament.MemberOfParliament) {
        const memberArray = result.ArrayOfMemberOfParliament.MemberOfParliament;
        members = Array.isArray(memberArray) ? memberArray : [memberArray];
      }
    } else if (result.MemberOfParliament) {
      members = Array.isArray(result.MemberOfParliament) ? result.MemberOfParliament : [result.MemberOfParliament];
    } else {
      throw new Error('Unexpected XML structure. Expected ArrayOfMemberOfParliament > MemberOfParliament');
    }

    console.log(`Found ${members.length} members in XML`);
    console.log('Fetching individual MP profiles for committees and associations...\n');

    let processed = 0;
    for (const member of members) {
      processed++;
      if (processed % 10 === 0) {
        console.log(`Processing MP ${processed}/${members.length}...`);
      }
      // Extract fields - handle both array and direct value formats
      const getValue = (field: any): string => {
        if (Array.isArray(field)) {
          return field[0] || '';
        }
        if (typeof field === 'string') {
          return field;
        }
        if (field && typeof field === 'object' && field._) {
          return field._ || '';
        }
        return '';
      };

      const firstName = getValue(member.PersonOfficialFirstName) || '';
      const lastName = getValue(member.PersonOfficialLastName) || '';
      const honorific = getValue(member.PersonShortHonorific) || '';
      
      // Check if MP is still in office (ToDateTime should be null/empty for current MPs)
      const toDateTime = getValue(member.ToDateTime);
      const isCurrentMP = !toDateTime || toDateTime === '' || toDateTime === 'null' || toDateTime === 'nil' || toDateTime === 'xsi:nil';
      
      if (!isCurrentMP) {
        // Skip MPs who are no longer in office
        continue;
      }
      
      // Build full name with honorific if present
      const fullName = honorific 
        ? `${honorific} ${firstName} ${lastName}`.trim()
        : `${firstName} ${lastName}`.trim();
      
      const constituencyName = getValue(member.ConstituencyName) || '';
      const caucusName = getValue(member.CaucusShortName) || '';
      const personId = getValue(member.PersonId) || '';
      
      // Build profile URL
      const profileUrl = personId 
        ? `${COMMONS_BASE}/Members/en/${personId}`
        : undefined;

      // Fetch committees, associations, and parliamentary positions from individual MP profile XML
      let committees: CommitteeMemberRole[] | undefined;
      let associations: ParliamentaryAssociationRole[] | undefined;
      let parliamentary_positions: ParliamentaryPositionRole[] | undefined;
      
      if (personId && firstName && lastName) {
        try {
          const profileData = await fetchMPProfileXML(personId, firstName, lastName);
          committees = profileData.committees;
          associations = profileData.associations;
          parliamentary_positions = profileData.parliamentary_positions;
          
          if (committees && committees.length > 0) {
            console.log(`  ✓ Found ${committees.length} committees for ${fullName}`);
          }
          if (associations && associations.length > 0) {
            console.log(`  ✓ Found ${associations.length} associations for ${fullName}`);
          }
          if (parliamentary_positions && parliamentary_positions.length > 0) {
            console.log(`  ✓ Found ${parliamentary_positions.length} parliamentary positions for ${fullName}`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          // Continue even if profile fetch fails
          if (error.response?.status !== 404) {
            console.log(`  ⚠ Could not fetch profile for ${fullName}: ${error.message}`);
          }
        }
      }

      const mp: MPData = {
        name: fullName,
        firstName: firstName,
        lastName: lastName,
        email: undefined, // Not in this XML feed
        photoUrl: undefined, // Will be updated via update-headshots script
        partyName: caucusName,
        districtName: constituencyName,
        districtId: personId, // Using PersonId as district identifier
        url: profileUrl,
        gender: undefined, // Not in this XML feed
        committees,
        associations,
        parliamentary_positions,
      };

      if (mp.name && mp.districtName) {
        mps.push(mp);
      } else {
        console.log('Skipping member - missing name or district:', JSON.stringify(member, null, 2).substring(0, 200));
      }
    }

    console.log(`Successfully parsed ${mps.length} MPs from XML`);
    return mps;
  } catch (error: any) {
    console.error('Error fetching MPs:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data (first 500 chars):', error.response.data?.substring(0, 500));
    }
    throw error;
  }
}

async function importMPs() {
  console.log('Fetching current MPs from House of Commons...');
  console.log('This will refresh the database with the latest MP list.\n');
  const db = getDatabase();

  try {
    const mps = await fetchCurrentMPs();
    console.log(`\nFound ${mps.length} current MPs in the XML feed`);

    // Get current MPs in database for comparison
    const existingMPs = db.prepare('SELECT COUNT(*) as count FROM mps').get() as { count: number };
    console.log(`Current MPs in database: ${existingMPs.count}`);

    // Use separate INSERT and UPDATE statements to avoid overwriting existing data
    const insertMP = db.prepare(`
      INSERT OR IGNORE INTO mps (
        name, first_name, last_name, email, phone, photo_url, party_name,
        district_name, district_id, elected_office, url, source_url, personal_url, gender, 
        committees, associations, parliamentary_positions, salary, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MP', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    
    // Update existing MPs but preserve email, phone, photo_url, and other fields if they exist
    // Only update committees, associations, parliamentary_positions if we have new data
    const updateMP = db.prepare(`
      UPDATE mps SET
        name = ?,
        first_name = ?,
        last_name = ?,
        party_name = COALESCE(party_name, ?),
        district_name = ?,
        district_id = COALESCE(district_id, ?),
        elected_office = COALESCE(elected_office, 'MP'),
        url = COALESCE(url, ?),
        source_url = COALESCE(source_url, ?),
        personal_url = COALESCE(personal_url, ?),
        gender = COALESCE(gender, ?),
        committees = COALESCE(?, committees),
        associations = COALESCE(?, associations),
        parliamentary_positions = COALESCE(?, parliamentary_positions),
        salary = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE (district_name = ? OR district_id = ?)
    `);

    // Get list of current MP identifiers (district_id or district_name) for cleanup
    const currentMPIdentifiers = new Set<string>();
    mps.forEach(mp => {
      if (mp.districtId) {
        currentMPIdentifiers.add(mp.districtId);
      }
      if (mp.districtName) {
        currentMPIdentifiers.add(mp.districtName);
      }
    });

    const transaction = db.transaction((mps: MPData[]) => {
      for (const mp of mps) {
        // Calculate salary based on parliamentary positions
        const salary = calculateMPSalary(mp.parliamentary_positions);
        
        // Try to insert first (for new MPs)
        insertMP.run(
          mp.name,
          mp.firstName,
          mp.lastName,
          null, // email - preserve existing, will be updated via import-contact-csv
          null, // phone - preserve existing, will be updated via import-contact-csv
          null, // photo_url - preserve existing, will be updated via update-headshots
          mp.partyName,
          mp.districtName,
          mp.districtId,
          mp.url,
          null, // source_url
          null, // personal_url
          mp.gender,
          mp.committees ? JSON.stringify(mp.committees) : null,
          mp.associations ? JSON.stringify(mp.associations) : null,
          mp.parliamentary_positions ? JSON.stringify(mp.parliamentary_positions) : null,
          salary
        );
        
        // Update existing MPs (this will run even if insert was ignored)
        // This updates committees, associations, parliamentary_positions, and basic info
        // but preserves email, phone, photo_url
        updateMP.run(
          mp.name,
          mp.firstName,
          mp.lastName,
          mp.partyName,
          mp.districtName,
          mp.districtId,
          mp.url,
          null, // source_url
          null, // personal_url
          mp.gender,
          mp.committees ? JSON.stringify(mp.committees) : null,
          mp.associations ? JSON.stringify(mp.associations) : null,
          mp.parliamentary_positions ? JSON.stringify(mp.parliamentary_positions) : null,
          salary,
          mp.districtName, // WHERE clause - district_name
          mp.districtId || mp.districtName // WHERE clause - district_id
        );
      }
    });

    transaction(mps);
    console.log(`✓ Successfully imported/updated ${mps.length} MPs`);

    // Remove MPs that are no longer in office (not in the current list)
    // We'll identify them by checking if their district_id or district_name doesn't match current MPs
    const allDBMPs = db.prepare('SELECT id, name, district_id, district_name FROM mps').all() as Array<{
      id: number;
      name: string;
      district_id: string | null;
      district_name: string;
    }>;

    let removedCount = 0;
    const removeMP = db.prepare('DELETE FROM mps WHERE id = ?');
    
    for (const dbMP of allDBMPs) {
      const isCurrent = (dbMP.district_id && currentMPIdentifiers.has(dbMP.district_id)) ||
                        currentMPIdentifiers.has(dbMP.district_name);
      
      if (!isCurrent) {
        console.log(`  Removing old MP: ${dbMP.name} (${dbMP.district_name})`);
        removeMP.run(dbMP.id);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`\n✓ Removed ${removedCount} MPs who are no longer in office`);
    }

    // Final count
    const finalCount = db.prepare('SELECT COUNT(*) as count FROM mps').get() as { count: number };
    console.log(`\n=== Summary ===`);
    console.log(`Total current MPs in database: ${finalCount.count}`);
    console.log(`\n✅ Database refreshed successfully!`);
    console.log(`\nNext steps:`);
    console.log(`  1. Run: npm run db:update-headshots (to update MP photos)`);
    console.log(`  2. Run: npm run db:bulk-import-votes (to import voting history)`);
  } catch (error) {
    console.error('Error importing MPs:', error);
    throw error;
  } finally {
    closeDatabase();
  }
}

importMPs();

