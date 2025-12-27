import { queryAll, queryRun, queryExec, convertPlaceholders, closeDatabase } from '../lib/db/database';

/**
 * Check if bill_id column exists in votes table
 */
async function ensureBillIdColumnExists(): Promise<void> {
  try {
    await queryExec(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'votes' AND column_name = 'bill_id'
        ) THEN
          ALTER TABLE votes ADD COLUMN bill_id INTEGER REFERENCES bills_motions(id) ON DELETE SET NULL;
          CREATE INDEX IF NOT EXISTS idx_votes_bill_id ON votes(bill_id);
          RAISE NOTICE 'Added bill_id column to votes table';
        END IF;
      END $$;
    `);
    console.log('✓ Verified bill_id column exists in votes table');
  } catch (error: any) {
    console.warn('Error checking/adding bill_id column:', error.message);
    throw error;
  }
}

/**
 * Backfill bill_id for votes that don't have it set
 * This links existing votes to the master bills_motions table
 */
async function backfillVoteBillIds() {
  console.log('Backfilling bill_id for votes...\n');

  // First, ensure the bill_id column exists
  await ensureBillIdColumnExists();
  console.log('');

  // Find votes without bill_id but with bill_number
  const votesSql = convertPlaceholders(`
    SELECT 
      v.id,
      v.vote_id,
      v.bill_number,
      v.parliament_number,
      v.session_number,
      CASE 
        WHEN v.parliament_number IS NOT NULL AND v.session_number IS NOT NULL 
        THEN v.parliament_number || '-' || v.session_number
        ELSE NULL
      END as session_string
    FROM votes v
    WHERE v.bill_id IS NULL 
      AND v.bill_number IS NOT NULL
    ORDER BY v.id
  `);

  const votes = await queryAll<{
    id: number;
    vote_id: string;
    bill_number: string;
    parliament_number: number | null;
    session_number: number | null;
    session_string: string | null;
  }>(votesSql, []);

  console.log(`Found ${votes.length} votes without bill_id to backfill\n`);

  if (votes.length === 0) {
    console.log('No votes need backfilling.');
    await closeDatabase();
    return;
  }

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  // Update each vote
  for (const vote of votes) {
    try {
      // Try to find bill by bill_number + session first
      let billId: number | null = null;

      if (vote.session_string) {
        const findBillSql = convertPlaceholders(`
          SELECT id FROM bills_motions 
          WHERE bill_number = $1 AND session = $2 
          LIMIT 1
        `);
        const billResult = await queryAll<{ id: number }>(findBillSql, [vote.bill_number, vote.session_string]);
        if (billResult.length > 0) {
          billId = billResult[0].id;
        }
      }

      // Fallback: try by bill_number only
      if (!billId) {
        const findBillSql = convertPlaceholders(`
          SELECT id FROM bills_motions 
          WHERE bill_number = $1 
          ORDER BY introduced_date DESC
          LIMIT 1
        `);
        const billResult = await queryAll<{ id: number }>(findBillSql, [vote.bill_number]);
        if (billResult.length > 0) {
          billId = billResult[0].id;
        }
      }

      if (billId) {
        // Update the vote with bill_id
        const updateSql = convertPlaceholders(`
          UPDATE votes 
          SET bill_id = $1 
          WHERE id = $2
        `);
        await queryRun(updateSql, [billId, vote.id]);
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`  Updated ${updated}/${votes.length} votes...`);
        }
      } else {
        notFound++;
        if (notFound <= 10) {
          console.log(`  ⚠️  Bill not found for vote ${vote.vote_id} (bill_number: ${vote.bill_number}, session: ${vote.session_string || 'none'})`);
        }
      }
    } catch (error: any) {
      errors++;
      console.error(`  ✗ Error updating vote ${vote.vote_id}:`, error.message);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total votes processed: ${votes.length}`);
  console.log(`Votes updated with bill_id: ${updated}`);
  console.log(`Bills not found: ${notFound}`);
  console.log(`Errors: ${errors}`);

  if (notFound > 0) {
    console.log(`\n⚠️  ${notFound} votes could not be linked to bills.`);
    console.log(`   This may be because:`);
    console.log(`   - Bills haven't been imported yet (run: npm run db:sync-bills-one-time)`);
    console.log(`   - Bill numbers don't match between votes and bills tables`);
    console.log(`   - Bills are motions without bill numbers`);
  }

  await closeDatabase();
}

// Run the script
if (require.main === module) {
  backfillVoteBillIds().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { backfillVoteBillIds };

