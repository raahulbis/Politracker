# Data Sync Strategy

## Overview

This application uses a master table architecture with proper associations:
1. **Bills Master Table**: One-time import of all bills, nightly sync for new/updated bills
2. **Votes with Bill Associations**: Votes are linked to bills via `bill_id` foreign key
3. **Nightly Sync**: Automated scripts to keep bills and votes up-to-date

## Architecture

### Data Sources

1. **House of Commons Open Data** (https://www.ourcommons.ca)
   - **Purpose**: MP profile data (names, parties, constituencies, parliamentary positions)
   - **Format**: XML feeds
   - **When**: One-time setup
   - **Note**: Does NOT include contact information (email, phone)

2. **OpenParliament API** (https://api.openparliament.ca)
   - **Purpose**: 
     - **Bills**: Master table of all bills with details
     - **Votes**: Individual MP votes linked to bills
   - **Format**: JSON REST API
   - **When**: 
     - Bills: One-time import + nightly sync
     - Votes: Nightly sync for all MPs
   - **Benefits**: 
     - Complete bill information (titles, status, sponsors, etc.)
     - Individual MP vote records
     - Party position information
     - Proper MP <> Votes <> Bills associations

### Workflow

#### Initial Setup (One-Time)

```bash
# 1. Import MPs from House of Commons
npm run db:fetch-mps

# 2. Import all bills from OpenParliament (creates master bills table)
npm run db:sync-bills-one-time

# 3. Sync all votes from OpenParliament (initial sync, links to bills)
npm run db:sync-votes-nightly
```

#### Nightly Sync (Automated)

```bash
# 1. Sync new/updated bills from OpenParliament
npm run db:sync-bills-nightly

# 2. Sync new votes for all MPs (links to bills automatically)
npm run db:sync-votes-nightly
```

#### Runtime (On MP Page Load)

1. **Load from Database**: Get all votes from local database (fast, instant)
2. **Join with Bills**: Votes are already linked to bills via `bill_id` foreign key
3. **Display**: Show voting record with full bill information

### Benefits

✅ **Fast Loading**: Historical votes load instantly from database  
✅ **Minimal API Calls**: Only fetches new votes (typically 0-10 per page load)  
✅ **Up-to-Date**: Always shows latest votes  
✅ **Self-Updating**: Database grows over time, reducing future API calls  
✅ **Resilient**: Works even if OpenParliament API is slow or unavailable  

### Database Schema

**Master Bills Table** (`bills_motions`):
- `id`: Primary key
- `bill_number`: Bill number (e.g., "C-12")
- `legisinfo_id`: LEGISinfo ID (unique identifier)
- `title`, `long_title`, `short_title`: Bill titles
- `session`: Parliament session (e.g., "45-1")
- `introduced_date`: When bill was introduced
- `status_code`: Current status
- `law`: Whether bill became law
- `sponsor_politician`: Sponsor name
- `sponsor_politician_membership`: Sponsor membership URL
- `private_member_bill`: Whether it's a private member's bill

**Votes Table** (`votes`):
- `vote_id`: Unique identifier (from OpenParliament)
- `mp_id`: Foreign key to MP
- `bill_id`: Foreign key to bills_motions (proper association)
- `date`: Vote date
- `bill_number`, `bill_title`: Bill information (denormalized for quick access)
- `motion_title`: Motion description
- `vote_type`: Yea/Nay/Paired/etc.
- `result`: Agreed To/Negatived
- `party_position`: For/Against/Free Vote
- `sponsor_party`: Party that sponsored the bill
- `parliament_number`, `session_number`: Parliament session info

**Key Relationships**:
- `votes.bill_id` → `bills_motions.id` (proper foreign key relationship)
- `votes.mp_id` → `mps.id` (MP who cast the vote)

### Benefits of Master Table Architecture

✅ **Proper Data Relationships**: Votes are properly linked to bills via foreign keys  
✅ **No Duplication**: Bills stored once in master table, referenced by votes  
✅ **Fast Queries**: Join votes with bills using indexed foreign keys  
✅ **Data Integrity**: Foreign key constraints ensure referential integrity  
✅ **Efficient Updates**: Update bills once, all votes automatically reference updated data  
✅ **Complete Bill Info**: Full bill details available for every vote  

### Sync Scripts

**Bills Sync**:
- `sync-bills-one-time.ts`: One-time import of ALL bills from OpenParliament
- `sync-bills-nightly.ts`: Nightly sync of new/updated bills (only bills introduced after latest date in DB)

**Votes Sync**:
- `sync-votes-nightly.ts`: Nightly sync of new votes for all MPs
  - Only fetches votes newer than latest date in database
  - Automatically links votes to bills using `bill_id` foreign key
  - Updates existing votes if bill association changes

### Best Practices

1. **Run nightly sync scripts** via cron job to keep data current:
   ```bash
   # Add to crontab (runs at 2 AM daily)
   0 2 * * * cd /path/to/politracker && npm run db:sync-bills-nightly >> logs/bills-sync.log 2>&1
   0 3 * * * cd /path/to/politracker && npm run db:sync-votes-nightly >> logs/votes-sync.log 2>&1
   ```

2. **One-time setup**: Run `sync-bills-one-time.ts` first to populate master bills table

3. **Database grows over time**: As bills and votes accumulate, nightly syncs become faster (fewer new items)

## Future Enhancements

1. **Background Job**: Automatically run sync scripts on schedule
2. **Batch Processing**: Optimize batch sizes for better performance
3. **Error Recovery**: Retry failed syncs automatically
4. **Monitoring**: Track sync success rates and API usage

