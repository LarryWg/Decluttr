const OpenAI = require("openai");
const axios = require("axios");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Search LinkedIn profiles using Google Custom Search API
 * @param {string} query - Search query (e.g., "ceo automotive united states")
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<Array>} Array of LinkedIn profile objects
 */
async function searchLinkedInProfiles(query, limit = 10) {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CX = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!GOOGLE_API_KEY || !GOOGLE_CX) {
    throw new Error('Google Search API credentials not configured. Please set GOOGLE_API_KEY and GOOGLE_SEARCH_ENGINE_ID in .env');
  }

  try {
    // Construct search query with LinkedIn site filter
    const searchQuery = `${query} site:linkedin.com/in`;
    
    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CX,
        q: searchQuery,
        num: Math.min(limit, 10) // Google API max is 10 per request
      }
    });

    if (!response.data.items || response.data.items.length === 0) {
      return [];
    }

    // Parse LinkedIn profiles from search results
    const profiles = response.data.items.map(item => {
      const profile = parseLinkedInSearchResult(item);
      return profile;
    }).filter(profile => profile !== null);

    return profiles;
  } catch (error) {
    console.error('LinkedIn search error:', error.response?.data || error.message);
    throw new Error(`Failed to search LinkedIn profiles: ${error.message}`);
  }
}

/**
 * Parse LinkedIn profile data from Google search result
 * @param {Object} item - Google search result item
 * @returns {Object|null} Parsed profile object or null if parsing fails
 */
function parseLinkedInSearchResult(item) {
  try {
    const url = item.link;
    const title = item.title;
    const snippet = item.snippet;

    // Extract name from title (usually format: "Name - Job Title - Company | LinkedIn")
    let name = '';
    let title_position = '';
    let company = '';
    let location = '';

    // Parse title - typical format: "John Doe - CEO - Company Name | LinkedIn"
    const titleParts = title.split('|')[0].trim().split('-').map(s => s.trim());
    
    if (titleParts.length >= 1) {
      name = titleParts[0];
    }
    if (titleParts.length >= 2) {
      title_position = titleParts[1];
    }
    if (titleParts.length >= 3) {
      company = titleParts[2];
    }

    // Extract location from snippet if available
    // Common patterns: "Location: City, State" or "City, State Area"
    const locationMatch = snippet.match(/(?:Location:|based in|from)\s*([^\.]+?)(?:\s*\||$|\.)/i);
    if (locationMatch) {
      location = locationMatch[1].trim();
    }

    // If no location in snippet, try to extract from snippet patterns
    if (!location) {
      const cityStateMatch = snippet.match(/([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})/);
      if (cityStateMatch) {
        location = cityStateMatch[1];
      }
    }

    return {
      name: name || 'Unknown',
      title: title_position || 'Unknown',
      company: company || 'Unknown',
      location: location || 'Unknown',
      linkedinUrl: url,
      snippet: snippet
    };
  } catch (error) {
    console.error('Failed to parse LinkedIn profile:', error);
    return null;
  }
}

/**
 * Generate personalized LinkedIn connection message
 * @param {Object} profile - LinkedIn profile object
 * @returns {Promise<string>} Generated message
 */
async function generateLinkedInMessage(profile) {
  const { name, title, company, location } = profile;

  const prompt = `
Write a personalized LinkedIn connection message.

Person:
Name: ${name}
Title: ${title}
Company: ${company || "their company"}
Location: ${location || "their area"}

User:
Computer Science student at Carleton University seeking internships or co-op opportunities.

Constraints:
- Friendly and professional
- Max 90 words
- No emojis
- Do not mention AI
- Ask politely to connect
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7
  });

  return completion.choices[0].message.content;
}

/**
 * Batch generate messages for multiple profiles
 * @param {Array} profiles - Array of profile objects
 * @returns {Promise<Array>} Array of profiles with generated messages
 */
async function batchGenerateMessages(profiles) {
  const profilesWithMessages = await Promise.all(
    profiles.map(async (profile) => {
      try {
        const message = await generateLinkedInMessage(profile);
        return {
          ...profile,
          generatedMessage: message
        };
      } catch (error) {
        console.error(`Failed to generate message for ${profile.name}:`, error);
        return {
          ...profile,
          generatedMessage: null,
          error: error.message
        };
      }
    })
  );

  return profilesWithMessages;
}

module.exports = { 
  generateLinkedInMessage, 
  searchLinkedInProfiles,
  batchGenerateMessages
};