/**
 * Categorize a bill using LLM based on its title and description
 */

const CATEGORIES = [
  'Economy & Finance',
  'Health',
  'Housing',
  'Environment & Climate',
  'Justice & Public Safety',
  'Immigration & Citizenship',
  'Indigenous Affairs',
  'Defence & Foreign Affairs',
  'Infrastructure & Transport',
  'Labour & Employment',
  'Education & Youth',
  'Digital, Privacy & AI',
  'Culture, Media & Sport',
  'Government & Democratic Reform',
];

interface CategorizeBillParams {
  billNumber?: string;
  title: string;
  description?: string;
}

/**
 * Categorize a bill using OpenAI API
 * Falls back to keyword matching if API is not available
 */
export async function categorizeBill({
  billNumber,
  title,
  description,
}: CategorizeBillParams): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.warn('OpenAI API key not found, using keyword-based categorization');
    return categorizeByKeywords(title, description);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Using mini for cost efficiency
        messages: [
          {
            role: 'system',
            content: `You are a policy categorization assistant. Categorize Canadian parliamentary bills into one of these categories:

${CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join('\n')}

Return ONLY the exact category name from the list above. Do not include any explanation or additional text.`,
          },
          {
            role: 'user',
            content: `Categorize this bill:

Bill Number: ${billNumber || 'N/A'}
Title: ${title}
${description ? `Description: ${description}` : ''}

Return only the category name:`,
          },
        ],
        temperature: 0.3,
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return categorizeByKeywords(title, description);
    }

    const data = await response.json();
    const category = data.choices[0]?.message?.content?.trim();

    if (category && CATEGORIES.includes(category)) {
      return category;
    }

    // If LLM returned something invalid, fall back to keywords
    return categorizeByKeywords(title, description);
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    return categorizeByKeywords(title, description);
  }
}

/**
 * Fallback keyword-based categorization
 */
function categorizeByKeywords(title: string, description?: string): string | null {
  const text = `${title} ${description || ''}`.toLowerCase();
  console.log(`[Keyword Categorize] Analyzing text: "${text.substring(0, 150)}..."`);

  // Keyword mappings
  const keywordMap: Record<string, string[]> = {
    'Economy & Finance': ['budget', 'tax', 'revenue', 'fiscal', 'economic', 'financial', 'bank', 'currency', 'trade', 'commerce', 'tariff', 'debt'],
    'Health': ['health', 'medical', 'hospital', 'pharmaceutical', 'drug', 'disease', 'healthcare', 'mental health', 'public health', 'vaccine'],
    'Housing': ['housing', 'rent', 'mortgage', 'homeless', 'affordable housing', 'residential', 'tenant', 'landlord'],
    'Environment & Climate': ['environment', 'climate', 'carbon', 'emission', 'pollution', 'renewable', 'energy', 'green', 'sustainability', 'wildlife', 'conservation'],
    'Justice & Public Safety': ['criminal', 'justice', 'police', 'law enforcement', 'prison', 'sentencing', 'crime', 'safety', 'security', 'firearm', 'gun'],
    'Immigration & Citizenship': ['immigration', 'immigrant', 'refugee', 'citizenship', 'visa', 'border', 'asylum', 'borders'],
    'Indigenous Affairs': ['indigenous', 'first nations', 'aboriginal', 'inuit', 'metis', 'reserve', 'treaty'],
    'Defence & Foreign Affairs': ['defence', 'defense', 'military', 'armed forces', 'veteran', 'foreign', 'diplomatic', 'international', 'nato', 'peacekeeping'],
    'Infrastructure & Transport': ['infrastructure', 'transport', 'highway', 'road', 'railway', 'airport', 'port', 'bridge', 'transit', 'public transit'],
    'Labour & Employment': ['labour', 'labor', 'employment', 'worker', 'union', 'wage', 'salary', 'workplace', 'employment insurance'],
    'Education & Youth': ['education', 'school', 'university', 'college', 'student', 'youth', 'child', 'learning', 'curriculum'],
    'Digital, Privacy & AI': ['digital', 'privacy', 'data', 'artificial intelligence', 'ai', 'cyber', 'internet', 'online', 'technology', 'tech', 'algorithm'],
    'Culture, Media & Sport': ['culture', 'media', 'sport', 'arts', 'heritage', 'broadcasting', 'television', 'radio', 'museum', 'library'],
    'Government & Democratic Reform': ['government', 'democratic', 'election', 'voting', 'parliament', 'senate', 'electoral', 'reform', 'constitution'],
  };

  // Score each category based on keyword matches
  const scores: Record<string, number> = {};
  
  for (const [category, keywords] of Object.entries(keywordMap)) {
    scores[category] = keywords.reduce((score, keyword) => {
      return score + (text.includes(keyword) ? 1 : 0);
    }, 0);
  }

  console.log(`[Keyword Categorize] Scores:`, Object.entries(scores).filter(([_, score]) => score > 0));

  // Find category with highest score
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore === 0) {
    console.log(`[Keyword Categorize] No matches found`);
    return null; // No match found
  }

  const bestCategory = Object.entries(scores).find(([_, score]) => score === maxScore)?.[0];
  console.log(`[Keyword Categorize] Best category: ${bestCategory} (score: ${maxScore})`);
  return bestCategory || null;
}

