#!/usr/bin/env tsx

/**
 * Nightly Update Script
 * 
 * This script runs the daily database update process:
 * - Syncs latest votes from OpenParliament API for all MPs
 * - Only fetches votes newer than what's already in the database
 * - Designed to be run via cron or scheduled task
 * 
 * Usage:
 *   npm run db:nightly-update
 * 
 * Or schedule with cron:
 *   0 2 * * * cd /path/to/politracker && npm run db:nightly-update >> logs/nightly-update.log 2>&1
 */

import { syncLatestVotes } from './sync-latest-votes';

async function nightlyUpdate() {
  const startTime = new Date();
  console.log('========================================');
  console.log('PoliTracker Nightly Update');
  console.log(`Started: ${startTime.toISOString()}`);
  console.log('========================================\n');
  
  try {
    // Run the vote sync
    await syncLatestVotes();
    
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    
    console.log('\n========================================');
    console.log('Nightly Update Complete');
    console.log(`Finished: ${endTime.toISOString()}`);
    console.log(`Duration: ${duration} seconds (${Math.round(duration / 60)} minutes)`);
    console.log('========================================');
    
    process.exit(0);
  } catch (error) {
    console.error('\n========================================');
    console.error('Nightly Update Failed');
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('========================================');
    
    process.exit(1);
  }
}

nightlyUpdate();

