# Quick Start Guide

## Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
politracker/
├── app/
│   ├── api/                    # API routes
│   │   ├── mp/
│   │   │   ├── search/         # Search MP by postal code
│   │   │   └── [id]/           # Get MP data
│   ├── mp/[id]/                # MP profile page
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Home/search page
│   └── globals.css             # Global styles
├── components/                  # React components
│   ├── MPProfile.tsx           # MP profile display
│   ├── VotingHistory.tsx       # Voting record display
│   ├── PartyLoyaltyStats.tsx   # Party loyalty statistics
│   ├── PoliticalAlignment.tsx  # Political alignment display
│   ├── MotionBreakdown.tsx     # Motions/bills breakdown
│   ├── SearchForm.tsx          # Postal code search form
│   └── UserAlignmentInput.tsx  # User alignment input (future)
├── lib/
│   ├── api/
│   │   ├── represent.ts        # Represent API client
│   │   └── commons.ts          # House of Commons API client
│   └── utils/
│       └── alignment.ts        # Alignment calculation utilities
└── types/
    └── index.ts                # TypeScript type definitions
```

## Current Features

✅ **Postal Code Search**
- Search for MP using Canadian postal code
- Uses Represent API (Open North)

✅ **MP Profile**
- Display MP information (name, party, district, contact)
- Photo display if available

✅ **Voting History**
- Display voting records from House of Commons
- Shows vote type, date, bill/motion info

✅ **Party Loyalty Stats** (Structure Ready)
- Calculate votes with/against party
- Show loyalty percentages
- Note: Requires party_position data from API

✅ **Political Alignment** (Structure Ready)
- Calculate MP alignment from votes
- Display economic and social axes
- Note: Requires bill classification for full functionality

✅ **Motions Breakdown** (Structure Ready)
- Show sponsored/co-sponsored bills and motions
- Display motion details and status
- Note: Requires House of Commons motions API

## Next Steps

1. **Test API Integration**
   - Test postal code search with real postal codes
   - Verify Represent API responses
   - Check House of Commons API endpoints

2. **Complete API Integration**
   - Update `lib/api/commons.ts` with actual API endpoints
   - Map API responses to our types
   - Handle errors and edge cases

3. **Implement Future Features**
   - See `FUTURE_FEATURES.md` for detailed implementation guide
   - Add user alignment input
   - Enhance alignment calculation
   - Complete motions API integration

4. **Data Classification**
   - Classify bills as economic/social
   - Determine party positions for votes
   - Build classification database or use ML

## API Endpoints Used

### Represent API
- Base URL: `https://represent.opennorth.ca/api/`
- Endpoint: `/representatives`
- Rate Limit: 60 requests/minute
- No API key required

### House of Commons Open Data
- Base URL: `https://apps.ourcommons.ca/en/open-data`
- Endpoints: TBD (see their documentation)
- May require authentication

## Development Notes

- The app uses Next.js 14 with App Router
- TypeScript for type safety
- Tailwind CSS for styling
- Dark mode support included
- All API calls are server-side (API routes)

## Troubleshooting

**Postal code not found:**
- Verify postal code format (A1A 1A1)
- Check Represent API status
- Some postal codes may not map to federal districts

**Voting history empty:**
- House of Commons API endpoints may need to be updated
- Check API documentation for correct endpoints
- Some MPs may have no voting records (newly elected)

**Alignment calculation:**
- Currently placeholder - needs bill classification
- See `FUTURE_FEATURES.md` for implementation details



