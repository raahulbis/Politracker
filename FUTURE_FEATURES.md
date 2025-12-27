# Future Features Implementation Guide

This document outlines the implementation details for the planned future features.

## 1. Political Alignment Comparison

### Overview
Allow users to set their political alignment and compare it with their MP's voting record.

### Implementation Steps

#### Step 1: User Alignment Storage
- Add user alignment storage (localStorage, cookies, or user accounts)
- Create a user preferences/settings page
- Use the `UserAlignmentInput` component (already created)

#### Step 2: Enhanced Alignment Calculation
- Improve `calculateMPAlignment()` in `lib/utils/alignment.ts`
- Classify bills/motions as economic or social issues
- Use bill descriptions, titles, and categories from House of Commons API
- Consider using ML/NLP to classify bills automatically

#### Step 3: Comparison Display
- Update `PoliticalAlignment` component to show comparison
- Display agreement score prominently
- Show visual comparison (side-by-side charts)
- Add breakdown by issue category

#### Step 4: Data Classification
You'll need to classify votes by:
- **Economic**: Budget, taxes, trade, employment, infrastructure
- **Social**: Healthcare, education, civil rights, environment, immigration

Example classification approach:
```typescript
function classifyVote(vote: Vote): 'economic' | 'social' | 'mixed' {
  // Use keywords, bill categories, or ML classification
  const economicKeywords = ['budget', 'tax', 'trade', 'employment', 'infrastructure'];
  const socialKeywords = ['health', 'education', 'rights', 'environment', 'immigration'];
  // ... classification logic
}
```

## 2. Party Loyalty Statistics

### Overview
Show how often an MP votes with or against their party.

### Current Implementation
The structure is already in place! The `getPartyLoyaltyStats()` function calculates:
- Votes with party
- Votes against party
- Free votes
- Percentages for each

### Enhancements Needed

#### Step 1: Verify Party Position Data
- Ensure House of Commons API provides `party_position` for each vote
- If not available, calculate based on party majority vote
- Handle edge cases (tied votes, abstentions)

#### Step 2: Historical Trends
- Add time-based analysis (loyalty over time)
- Show loyalty by session/parliament
- Identify trends (increasing/decreasing loyalty)

#### Step 3: Comparison with Party Average
- Calculate average loyalty for the MP's party
- Show if MP is more/less loyal than party average
- Compare with all MPs

## 3. Motions & Bills Breakdown

### Overview
Detailed breakdown of all motions an MP has sponsored or co-sponsored.

### Current Implementation
The structure is in place with `getMPMotions()` function.

### Enhancements Needed

#### Step 1: Complete API Integration
- Verify House of Commons API endpoints for motions/bills
- Map API response to our `Motion` type
- Handle pagination if needed

#### Step 2: Enhanced Filtering & Search
- Filter by type (Bill, Motion, Petition, Question)
- Filter by status (Passed, Defeated, In Progress)
- Filter by date range
- Search by keywords

#### Step 3: Detailed Motion Information
- Show full text or summary
- Link to official House of Commons documents
- Show voting record for each motion
- Show co-sponsors and supporters

#### Step 4: Categorization
- Group motions by topic/theme
- Show most active areas for the MP
- Compare with other MPs

## API Integration Notes

### House of Commons Open Data API
The actual API endpoints need to be determined from:
- https://apps.ourcommons.ca/en/open-data

Current placeholder endpoints in `lib/api/commons.ts`:
- `/votes` - Voting records
- `/motions` - Motions and bills

### Database
All data is stored locally in PostgreSQL database:
- No external API dependencies
- No rate limits
- Fast local queries

## Data Classification Strategy

### For Political Alignment
1. **Manual Classification**: Start with a curated list of bills and their classifications
2. **Keyword Matching**: Use bill titles and descriptions
3. **ML Classification**: Train a model on historical bills
4. **Crowdsourcing**: Allow users to suggest classifications

### For Party Position
1. **API Data**: Use party_position if available
2. **Majority Vote**: If party_position not available, use party majority
3. **Whip Records**: If available, use official party whip data

## Database Considerations

For production, consider adding:
- Caching layer for API responses
- Database to store:
  - MP profiles (updated periodically)
  - Voting records (historical data)
  - Motion/bill data
  - User alignments (if user accounts added)

## Testing Strategy

1. **Unit Tests**: Test alignment calculations, party loyalty calculations
2. **Integration Tests**: Test API integrations
3. **E2E Tests**: Test full user flows
4. **Data Validation**: Verify data accuracy from APIs

## Performance Optimization

1. **Caching**: Cache API responses (House of Commons data doesn't change frequently)
2. **Pagination**: Implement pagination for voting history
3. **Lazy Loading**: Load detailed data on demand
4. **CDN**: Use CDN for static assets

