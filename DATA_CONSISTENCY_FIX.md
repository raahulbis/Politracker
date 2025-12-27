# Data Consistency Fix

## Problem

Bill information was inconsistent across the application because:
1. Votes table stored denormalized bill data (bill_number, bill_title, sponsor_party)
2. Queries were not joining with the master `bills_motions` table
3. Same bill could appear with different names, IDs, categories, or sponsor parties in different contexts

## Solution

### 1. Updated Vote Queries to Join with Bills Master Table

**File**: `lib/db/queries.ts` - `getMPVotingRecord()`

- Now JOINs `votes` with `bills_motions` table using `bill_id` foreign key
- Always gets bill information from master table (title, status, category, sponsor)
- Falls back to denormalized data only if bill not found in master table
- Ensures consistent bill data across all MP pages

**Query Structure**:
```sql
SELECT 
  v.*,
  b.title as bill_title,           -- From master table
  b.status_code as bill_status,    -- From master table
  bc.name as bill_category,         -- From master table
  -- Sponsor party from MP table if bill has sponsor
  COALESCE(
    (SELECT party_name FROM mps WHERE name = b.sponsor_politician),
    v.sponsor_party
  ) as final_sponsor_party
FROM votes v
LEFT JOIN bills_motions b ON v.bill_id = b.id
LEFT JOIN bill_policy_categories bc ON b.policy_category_id = bc.id
WHERE v.mp_id = ?
```

### 2. Improved Bill Lookup When Saving Votes

**File**: `lib/db/save-votes.ts` - `findBillId()`

- Now checks by `legisinfo_id` first (most reliable)
- Then checks by `bill_number + session` (most specific)
- Falls back to `bill_number` only if needed
- Ensures votes are properly linked to bills when saved

### 3. Backfill Script for Existing Votes

**File**: `scripts/backfill-vote-bill-ids.ts`

- Links existing votes to bills master table
- Updates `bill_id` foreign key for votes that don't have it
- Run this after importing bills to link existing votes

**Usage**:
```bash
# 1. Import all bills first
npm run db:sync-bills-one-time

# 2. Backfill bill_id for existing votes
npm run db:backfill-vote-bill-ids
```

## Data Flow

### When Saving Votes:
1. Extract `bill_number` from vote API
2. Look up bill in `bills_motions` master table
3. Set `bill_id` foreign key on vote
4. Store denormalized `bill_number` and `bill_title` for quick access (fallback)

### When Querying Votes:
1. JOIN votes with `bills_motions` table via `bill_id`
2. Get bill information from master table (title, status, category, sponsor)
3. Use master table data as primary source
4. Fall back to denormalized data only if bill not found

## Benefits

✅ **Consistent Bill Data**: Same bill always shows same name, ID, category, sponsor party  
✅ **Single Source of Truth**: `bills_motions` table is the master for all bill information  
✅ **Proper Relationships**: Foreign key ensures data integrity  
✅ **Easy Updates**: Update bill once in master table, all votes automatically reflect changes  
✅ **Category Support**: Bill categories come from master table  

## Next Steps

1. **Run bills import** (if not done):
   ```bash
   npm run db:sync-bills-one-time
   ```

2. **Backfill existing votes**:
   ```bash
   npm run db:backfill-vote-bill-ids
   ```

3. **Verify data consistency**:
   - Check that votes are properly linked (bill_id is set)
   - Verify bill information is consistent across MP pages
   - Ensure same bill shows same data everywhere

## Notes

- Denormalized fields (`bill_number`, `bill_title` in votes table) are kept for:
  - Quick access without JOIN (for simple queries)
  - Fallback if bill not found in master table
  - Historical data preservation

- The master `bills_motions` table should be kept up-to-date via:
  - `npm run db:sync-bills-one-time` - One-time import
  - `npm run db:sync-bills-nightly` - Nightly sync for new bills

