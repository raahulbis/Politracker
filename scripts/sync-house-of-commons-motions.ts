import axios from 'axios';
import * as https from 'https';
import { parseStringPromise } from 'xml2js';
import { transaction, convertPlaceholders, queryExec, queryAll, closeDatabase } from '../lib/db/database';
import { getCurrentSession } from '../lib/db/sessions';

const COMMONS_BASE = 'https://www.ourcommons.ca';
const VOTES_XML_URL = `${COMMONS_BASE}/Members/en/votes/xml`;

// Only disable SSL verification in development if explicitly set
const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.SSL_REJECT_UNAUTHORIZED !== 'false'
});

interface VoteXML {
  PersonId: string;
  ParliamentNumber: string;
  SessionNumber: string;
  DecisionEventDateTime: string;
  DecisionDivisionNumber: string;
  DecisionDivisionSubject: string;
  DecisionResultName: string;
  DecisionDivisionNumberOfYeas: string;
  DecisionDivisionNumberOfNays: string;
  DecisionDivisionNumberOfPaired: string;
  DecisionDivisionDocumentTypeName: string;
  DecisionDivisionDocumentTypeId: string;
  BillNumberCode?: string | string[];
}

interface Motion {
  decisionDivisionNumber: number;
  name: string;
  result: string;
  numberOfYeas: number;
  numberOfNays: number;
  numberOfPaired: number;
  date: Date;
  type: string;
  parliamentNumber: number;
  sessionNumber: number;
}

/**
 * Fetch votes XML from House of Commons
 */
async function fetchVotesXML(): Promise<string> {
  console.log('Fetching votes XML from House of Commons...');
  console.log(`URL: ${VOTES_XML_URL}`);

  const response = await axios.get(VOTES_XML_URL, {
    httpsAgent,
    responseType: 'text',
    headers: {
      'Accept': 'application/xml, text/xml',
      'User-Agent': 'Mozilla/5.0',
    },
    timeout: 30000,
    validateStatus: (status) => status < 500,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch votes XML: HTTP ${response.status}`);
  }

  // Check if we got HTML instead of XML
  if (response.data.trim().startsWith('<!DOCTYPE') || response.data.trim().startsWith('<html')) {
    throw new Error('Received HTML instead of XML. The XML endpoint may have changed.');
  }

  console.log('✓ XML received, length:', response.data.length);
  return response.data;
}

/**
 * Parse XML and extract motions (votes without BillNumberCode)
 */
async function parseMotionsFromXML(xmlData: string, parliamentNumber: number): Promise<Motion[]> {
  const result = await parseStringPromise(xmlData, {
    trim: true,
    explicitArray: true,
    mergeAttrs: false,
    explicitRoot: true,
    ignoreAttrs: false,
  });

  const motions: Motion[] = [];
  // Navigate XML structure: ArrayOfVote > Vote
  const arrayOfVote = result.ArrayOfVote;
  if (!arrayOfVote || !arrayOfVote.Vote) {
    console.log('⚠️  No votes found in XML');
    return motions;
  }

  const votes: VoteXML[] = Array.isArray(arrayOfVote.Vote) 
    ? arrayOfVote.Vote 
    : [arrayOfVote.Vote];

  console.log(`Found ${votes.length} total votes in XML`);

  for (const vote of votes) {
          // Filter by parliament number
          const voteParliamentNumber = parseInt(vote.ParliamentNumber, 10);
          if (voteParliamentNumber !== parliamentNumber) {
            continue;
          }

          // Filter for motions (no BillNumberCode or empty BillNumberCode)
          const billNumberCode = Array.isArray(vote.BillNumberCode) 
            ? vote.BillNumberCode[0] 
            : vote.BillNumberCode;
          
          if (billNumberCode && billNumberCode.trim() !== '') {
            continue; // Skip votes with bill numbers (those are bill votes, not motions)
          }

          // Extract and parse fields
          const decisionDivisionNumber = parseInt(vote.DecisionDivisionNumber, 10);
          if (isNaN(decisionDivisionNumber)) {
            console.warn(`⚠️  Skipping vote with invalid DecisionDivisionNumber: ${vote.DecisionDivisionNumber}`);
            continue;
          }

          const sessionNumber = parseInt(vote.SessionNumber, 10);
          const numberOfYeas = parseInt(vote.DecisionDivisionNumberOfYeas, 10) || 0;
          const numberOfNays = parseInt(vote.DecisionDivisionNumberOfNays, 10) || 0;
          const numberOfPaired = parseInt(vote.DecisionDivisionNumberOfPaired, 10) || 0;

          // Parse date
          const dateStr = vote.DecisionEventDateTime;
          const date = new Date(dateStr);

          if (isNaN(date.getTime())) {
            console.warn(`⚠️  Skipping vote ${decisionDivisionNumber} with invalid date: ${dateStr}`);
            continue;
          }

          // Extract string values (handle arrays from xml2js)
          const name = Array.isArray(vote.DecisionDivisionSubject) 
            ? vote.DecisionDivisionSubject[0] || ''
            : vote.DecisionDivisionSubject || '';
          const result = Array.isArray(vote.DecisionResultName)
            ? vote.DecisionResultName[0] || ''
            : vote.DecisionResultName || '';
          const type = Array.isArray(vote.DecisionDivisionDocumentTypeName)
            ? vote.DecisionDivisionDocumentTypeName[0] || ''
            : vote.DecisionDivisionDocumentTypeName || '';

          const motion: Motion = {
            decisionDivisionNumber,
            name,
            result,
            numberOfYeas,
            numberOfNays,
            numberOfPaired,
            date,
            type,
            parliamentNumber: voteParliamentNumber,
            sessionNumber,
          };

    motions.push(motion);
  }

  console.log(`✓ Found ${motions.length} motions for parliament ${parliamentNumber}`);
  return motions;
}

/**
 * Get existing decision division numbers from database
 */
async function getExistingDecisionDivisionNumbers(): Promise<Set<number>> {
  const sql = convertPlaceholders(`
    SELECT decision_division_number 
    FROM motions
  `);
  
  const rows = await queryAll<{ decision_division_number: number }>(sql, []);
  return new Set(rows.map((row) => row.decision_division_number));
}

/**
 * Save new motions to database
 */
async function saveMotions(motions: Motion[]): Promise<{ inserted: number; skipped: number }> {
  const existingNumbers = await getExistingDecisionDivisionNumbers();
  
  const newMotions = motions.filter(
    (motion) => !existingNumbers.has(motion.decisionDivisionNumber)
  );

  if (newMotions.length === 0) {
    console.log('✓ No new motions to insert');
    return { inserted: 0, skipped: motions.length };
  }

  console.log(`Inserting ${newMotions.length} new motions...`);

  await transaction(async (client) => {
    const insertSql = convertPlaceholders(`
      INSERT INTO motions (
        decision_division_number,
        name,
        result,
        number_of_yeas,
        number_of_nays,
        number_of_paired,
        date,
        type,
        parliament_number,
        session_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (decision_division_number) DO UPDATE SET
        name = EXCLUDED.name,
        result = EXCLUDED.result,
        number_of_yeas = EXCLUDED.number_of_yeas,
        number_of_nays = EXCLUDED.number_of_nays,
        number_of_paired = EXCLUDED.number_of_paired,
        date = EXCLUDED.date,
        type = EXCLUDED.type,
        parliament_number = EXCLUDED.parliament_number,
        session_number = EXCLUDED.session_number,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const motion of newMotions) {
      await client.query(insertSql, [
        motion.decisionDivisionNumber,
        motion.name,
        motion.result,
        motion.numberOfYeas,
        motion.numberOfNays,
        motion.numberOfPaired,
        motion.date,
        motion.type,
        motion.parliamentNumber,
        motion.sessionNumber,
      ]);
    }
  });

  console.log(`✓ Inserted ${newMotions.length} new motions`);
  return { inserted: newMotions.length, skipped: motions.length - newMotions.length };
}

/**
 * Main sync function
 */
async function syncHouseOfCommonsMotions() {
  try {
    console.log('Starting House of Commons motions sync...\n');

    // Get current session to filter by parliament number
    const currentSession = await getCurrentSession();
    if (!currentSession) {
      throw new Error('No current session found. Please set up a current session first.');
    }

    // In this codebase, session_number appears to be the parliament number
    // Based on setup-sessions-table.ts which inserts 45 as session_number
    const parliamentNumber = currentSession.session_number;

    console.log(`Current session: ${currentSession.session_number} (using as parliament number: ${parliamentNumber})\n`);

    // Fetch and parse XML
    const xmlData = await fetchVotesXML();
    const motions = await parseMotionsFromXML(xmlData, parliamentNumber);

    if (motions.length === 0) {
      console.log('No motions found. Exiting.');
      return;
    }

    // Save new motions
    const { inserted, skipped } = await saveMotions(motions);

    console.log('\n✓ Sync complete!');
    console.log(`  Total motions in XML: ${motions.length}`);
    console.log(`  New motions inserted: ${inserted}`);
    console.log(`  Existing motions skipped: ${skipped}`);
  } catch (error: any) {
    console.error('❌ Error syncing motions:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

async function main() {
  try {
    await syncHouseOfCommonsMotions();
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main();
}

export { syncHouseOfCommonsMotions };

