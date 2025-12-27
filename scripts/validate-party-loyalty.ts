import { getDatabase, closeDatabase } from '../lib/db/database';
import { getMPVotingRecord as getOpenParliamentVotes } from '../lib/api/openparliament';
import { getPartyLoyaltyStats } from '../lib/api/commons';

/**
 * Validate party loyalty calculations for a specific MP
 * This helps identify issues with party position detection
 */
async function validatePartyLoyalty(mpName: string) {
  console.log(`\nValidating Party Loyalty for: ${mpName}\n${'='.repeat(60)}\n`);
  const db = getDatabase();

  // Get MP from database
  const mp = db.prepare('SELECT * FROM mps WHERE name = ? LIMIT 1').get(mpName) as any;
  if (!mp) {
    console.error(`MP not found: ${mpName}`);
    closeDatabase();
    return;
  }

  console.log(`MP: ${mp.name}`);
  console.log(`Party: ${mp.party_name}`);
  console.log(`District: ${mp.district_name}\n`);

  // Fetch votes
  console.log('Fetching votes from OpenParliament...');
  const votingRecord = await getOpenParliamentVotes(mpName, 100);
  console.log(`Found ${votingRecord.votes.length} votes\n`);

  // Analyze votes
  let votesWithPartyPosition = 0;
  let votesWithoutPartyPosition = 0;
  let partyPositionBreakdown: { [key: string]: number } = {
    'For': 0,
    'Against': 0,
    'Free Vote': 0,
    'undefined': 0,
  };

  // Detailed analysis
  let detailedBreakdown: any[] = [];
  let votesWithPartyCount = 0;
  let votesAgainstPartyCount = 0;
  let freeVotesCount = 0;

  votingRecord.votes.forEach((vote, index) => {
    if (vote.party_position) {
      votesWithPartyPosition++;
      partyPositionBreakdown[vote.party_position] = (partyPositionBreakdown[vote.party_position] || 0) + 1;
    } else {
      votesWithoutPartyPosition++;
      partyPositionBreakdown['undefined'] = (partyPositionBreakdown['undefined'] || 0) + 1;
    }

    // Calculate what this vote should be categorized as
    let category = 'Unknown';
    if (vote.party_position === 'For') {
      if (vote.vote_type === 'Yea') {
        category = 'With Party';
        votesWithPartyCount++;
      } else if (vote.vote_type === 'Nay') {
        category = 'Against Party';
        votesAgainstPartyCount++;
      } else {
        category = 'Free Vote';
        freeVotesCount++;
      }
    } else if (vote.party_position === 'Against') {
      if (vote.vote_type === 'Nay') {
        category = 'With Party';
        votesWithPartyCount++;
      } else if (vote.vote_type === 'Yea') {
        category = 'Against Party';
        votesAgainstPartyCount++;
      } else {
        category = 'Free Vote';
        freeVotesCount++;
      }
    } else {
      category = 'Free Vote';
      freeVotesCount++;
    }

    // Collect detailed breakdown for first 20 votes
    if (index < 20) {
      detailedBreakdown.push({
        motion: vote.motion_title.substring(0, 50),
        mpVote: vote.vote_type,
        partyPosition: vote.party_position || 'N/A',
        category: category,
        date: vote.date,
      });
    }
  });

  console.log('=== Party Position Analysis ===');
  console.log(`Votes with party position: ${votesWithPartyPosition}`);
  console.log(`Votes without party position: ${votesWithoutPartyPosition}`);
  console.log('\nBreakdown:');
  Object.entries(partyPositionBreakdown).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  // Calculate party loyalty
  console.log('\n=== Party Loyalty Calculation ===');
  const stats = await getPartyLoyaltyStats(
    mp.district_id || mp.district_name,
    mp.name,
    mp.party_name || 'Unknown',
    votingRecord.votes
  );

  console.log(`Total votes: ${stats.total_votes}`);
  console.log(`Votes with party: ${stats.votes_with_party} (${stats.loyalty_percentage.toFixed(1)}%)`);
  console.log(`Votes against party: ${stats.votes_against_party} (${stats.opposition_percentage.toFixed(1)}%)`);
  console.log(`Free votes: ${stats.free_votes} (${stats.free_vote_percentage.toFixed(1)}%)`);

  // Show detailed breakdown
  console.log('\n=== Detailed Vote Breakdown (First 20) ===');
  detailedBreakdown.forEach((vote, index) => {
    console.log(`${index + 1}. [${vote.date}] ${vote.motion}`);
    console.log(`   MP Vote: ${vote.mpVote}, Party Position: ${vote.partyPosition}, Category: ${vote.category}`);
  });

  console.log('\n=== Manual Calculation ===');
  console.log(`Votes with party (manual): ${votesWithPartyCount}`);
  console.log(`Votes against party (manual): ${votesAgainstPartyCount}`);
  console.log(`Free votes (manual): ${freeVotesCount}`);
  console.log(`Total: ${votesWithPartyCount + votesAgainstPartyCount + freeVotesCount}`);

  // Check if party name matching might be the issue
  console.log('\n=== Party Name Matching Check ===');
  const normalizedPartyName = mp.party_name?.toLowerCase().replace(/ party of canada| party| bloc| québécois/gi, '').trim();
  console.log(`Original party name: ${mp.party_name}`);
  console.log(`Normalized: ${normalizedPartyName}`);
  console.log('\nPossible matches in OpenParliament API:');
  console.log('  - "Green"');
  console.log('  - "Green Party"');
  console.log('  - "Green Party of Canada"');
  console.log('  - "GP"');

  closeDatabase();
}

// Run validation for Elizabeth May
const mpName = process.argv[2] || 'Elizabeth May';
validatePartyLoyalty(mpName).catch(console.error);

