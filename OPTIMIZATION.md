# Performance Optimization Strategy

## Overview

To optimize loading time without burning through API requests, we've implemented a comprehensive caching system that reduces API calls significantly.

## Caching Strategy

### 1. Vote Details Cache (`vote_details_cache`)
- **Purpose**: Cache vote details from OpenParliament API
- **TTL**: 1 week (168 hours) - vote details don't change once recorded
- **Benefit**: When multiple MPs vote on the same motion, we only fetch the vote details once
- **Savings**: If 338 MPs vote on the same motion, we save 337 API calls

### 2. MP Votes Cache (`votes_cache`)
- **Purpose**: Cache complete voting records for each MP
- **TTL**: 24 hours
- **Benefit**: Subsequent requests for the same MP load instantly from cache
- **Savings**: Repeat visits to an MP's page use 0 API calls

### 3. Party Loyalty Stats Cache (`party_loyalty_cache`)
- **Purpose**: Cache calculated party loyalty statistics
- **TTL**: 24 hours (matches votes cache)
- **Benefit**: Avoids recalculating statistics on every request
- **Savings**: Eliminates vote processing time for cached data

## How It Works

### First Request (Cold Cache)
1. Check cache for MP votes → Not found
2. Fetch ballots from OpenParliament API
3. Check cache for each vote detail → Most not found
4. Fetch vote details in batches (10 at a time with 100ms delay)
5. Store vote details in cache
6. Store complete vote record in cache
7. Calculate party loyalty stats
8. Store stats in cache

### Subsequent Requests (Warm Cache)
1. Check cache for MP votes → **Found!** ✅
2. Check cache for party loyalty stats → **Found!** ✅
3. Load from database - **0 API calls!**

## API Call Reduction

### Without Caching
- **Per MP page load**: 
  - ~1 call for ballots (paginated)
  - ~50-500 calls for vote details (one per unique vote)
  - ~1 call for MP party info
  - ~1 call for bills
  - **Total: ~53-503 API calls per page load**

### With Caching
- **First load (cold cache)**: Same as above, but stores in cache
- **Subsequent loads (warm cache)**:
  - 0 calls if votes cached
  - 0 calls if stats cached
  - ~1 call for bills (if not cached)
  - **Total: ~0-1 API calls per page load**

### Cross-MP Optimization
When multiple MPs vote on the same motions, vote details are shared:
- **First MP**: Fetches all vote details
- **Second MP**: Uses cached vote details (saves ~50-500 API calls)
- **Third MP**: Uses cached vote details (saves ~50-500 API calls)
- etc.

## Additional Optimizations

### 1. MP Party Info from Database
- Instead of fetching MP party from OpenParliament API, we use the `party_name` already stored in our database
- **Saves**: 1 API call per MP page load

### 2. Batch Processing
- Vote details are fetched in batches of 10 with 100ms delays
- Prevents rate limiting while still being efficient

### 3. Cache-First Strategy
- Always check cache before making API calls
- Only fetch what's missing or expired

## Setup

Run the database setup to create cache tables:

```bash
npm run db:setup
```

This will create all necessary cache tables automatically.

## Cache Expiration Strategy

- **Vote Details**: 1 week (vote details are historical, don't change)
- **MP Votes**: 24 hours (new votes can be added daily)
- **Party Loyalty Stats**: 24 hours (recalculates when votes cache expires)

## Future Optimizations

1. **Background Sync Job**: Periodically update caches in the background
2. **Incremental Updates**: Only fetch new votes since last cache update
3. **Smart Prefetching**: Pre-cache votes for popular MPs
4. **Bills Cache**: Add caching for bills/motions data
5. **Compression**: Store cached data more efficiently

## Monitoring

The system logs cache hits/misses:
- `Using X cached votes for [MP Name]` - Cache hit
- `Using cached party loyalty stats for [MP Name]` - Cache hit
- Logs show when API calls are made vs when cache is used

