const OpenAI = require('openai');

// Initialize OpenAI client with API key from request (user-provided)
function createOpenAIClient(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Invalid OpenAI API key provided');
  }

  return new OpenAI({
    apiKey: apiKey.trim()
  });
}

/**
 * Generate AI summary for an email
 * @param {string} emailContent - Full email content (subject + body)
 * @param {string} apiKey - User's OpenAI API key
 * @returns {Promise<{summary: string, category: string, hasUnsubscribe: boolean}>}
 */
async function summarizeEmail(emailContent, apiKey) {
  if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    throw new Error('Email content is required and must be a non-empty string');
  }

  // Limit email content length to avoid token limits (keep last 8000 chars for context)
  const truncatedContent = emailContent.length > 8000 
    ? emailContent.slice(-8000) 
    : emailContent;

  const openai = createOpenAIClient(apiKey);

  const prompt = `Analyze the following email and provide:
1. A concise 2-3 sentence summary focusing on actionable content
2. A category: "Work", "Personal", "Promotional", "Spam", "Newsletter", or "Other"
3. Whether it contains an unsubscribe link (true/false)

Email content:
${truncatedContent}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "2-3 sentence summary here",
  "category": "one of the categories above",
  "hasUnsubscribe": true or false
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an email analysis assistant. Always respond with valid JSON only, no additional text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, // Lower temperature for more deterministic responses
      max_tokens: 500
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error('Empty response from OpenAI');
    }

    // Parse JSON response (handle potential markdown code blocks)
    let jsonText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result = JSON.parse(jsonText);

    // Validate response structure
    if (!result.summary || !result.category || typeof result.hasUnsubscribe !== 'boolean') {
      throw new Error('Invalid response format from AI');
    }

    // Validate category
    const validCategories = ['Work', 'Personal', 'Promotional', 'Spam', 'Newsletter', 'Other'];
    if (!validCategories.includes(result.category)) {
      result.category = 'Other';
    }

    return {
      summary: result.summary.trim(),
      category: result.category,
      hasUnsubscribe: result.hasUnsubscribe
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse AI response as JSON');
    }
    if (error.response?.status === 401) {
      throw new Error('Invalid OpenAI API key');
    }
    if (error.response?.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Categorize an email
 * @param {string} emailContent - Full email content
 * @param {string} apiKey - User's OpenAI API key
 * @returns {Promise<{category: string, confidence: number}>}
 */
async function categorizeEmail(emailContent, apiKey) {
  if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    throw new Error('Email content is required and must be a non-empty string');
  }

  const truncatedContent = emailContent.length > 8000 
    ? emailContent.slice(-8000) 
    : emailContent;

  const openai = createOpenAIClient(apiKey);

  const prompt = `Categorize the following email into one of these categories: "Work", "Personal", "Promotional", "Spam", "Newsletter", or "Other".

Email content:
${truncatedContent}

Respond ONLY with valid JSON in this exact format:
{
  "category": "one of the categories above",
  "confidence": 0.0 to 1.0 (confidence score)
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an email categorization assistant. Always respond with valid JSON only, no additional text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 100
    });

    const responseText = completion.choices[0]?.message?.content?.trim();
    if (!responseText) {
      throw new Error('Empty response from OpenAI');
    }

    let jsonText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result = JSON.parse(jsonText);

    if (!result.category || typeof result.confidence !== 'number') {
      throw new Error('Invalid response format from AI');
    }

    const validCategories = ['Work', 'Personal', 'Promotional', 'Spam', 'Newsletter', 'Other'];
    if (!validCategories.includes(result.category)) {
      result.category = 'Other';
    }

    // Ensure confidence is between 0 and 1
    result.confidence = Math.max(0, Math.min(1, result.confidence));

    return {
      category: result.category,
      confidence: result.confidence
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('Failed to parse AI response as JSON');
    }
    if (error.response?.status === 401) {
      throw new Error('Invalid OpenAI API key');
    }
    if (error.response?.status === 429) {
      throw new Error('OpenAI API rate limit exceeded. Please try again later.');
    }
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

/**
 * Detect unsubscribe links in email content
 * Uses pattern matching first, then AI validation for edge cases
 * @param {string} emailContent - Full email content (HTML or plain text)
 * @param {string} apiKey - User's OpenAI API key (optional for pattern matching)
 * @returns {Promise<{hasUnsubscribe: boolean, unsubscribeLink: string | null}>}
 */
async function detectUnsubscribe(emailContent, apiKey) {
  if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    throw new Error('Email content is required and must be a non-empty string');
  }

  // Pattern matching for common unsubscribe patterns (fast, no API call needed)
  const unsubscribePatterns = [
    /unsubscribe/i,
    /opt.?out/i,
    /remove.*subscription/i,
    /manage.*preferences/i,
    /email.*preferences/i
  ];

  // Extract URLs from email content (simple regex, works for most cases)
  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = emailContent.match(urlPattern) || [];

  // Check for unsubscribe-related URLs
  let unsubscribeLink = null;
  for (const url of urls) {
    const urlLower = url.toLowerCase();
    if (unsubscribePatterns.some(pattern => pattern.test(urlLower))) {
      unsubscribeLink = url;
      break;
    }
  }

  // Also check surrounding text around unsubscribe patterns
  if (!unsubscribeLink) {
    for (const pattern of unsubscribePatterns) {
      const match = emailContent.match(pattern);
      if (match) {
        // Find nearest URL (within 100 characters)
        const matchIndex = match.index;
        const nearbyText = emailContent.slice(Math.max(0, matchIndex - 100), matchIndex + 100);
        const nearbyUrls = nearbyText.match(urlPattern);
        if (nearbyUrls && nearbyUrls.length > 0) {
          unsubscribeLink = nearbyUrls[0];
          break;
        }
      }
    }
  }

  const hasUnsubscribe = unsubscribeLink !== null || unsubscribePatterns.some(pattern => pattern.test(emailContent));

  // If pattern matching found something, return immediately
  if (hasUnsubscribe && unsubscribeLink) {
    return { hasUnsubscribe: true, unsubscribeLink };
  }

  // If no clear match but pattern detected, use AI for validation (optional optimization)
  // For MVP, pattern matching is sufficient
  if (hasUnsubscribe && !unsubscribeLink) {
    // Could use AI here to extract link, but for MVP we'll just return true
    return { hasUnsubscribe: true, unsubscribeLink: null };
  }

  return { hasUnsubscribe: false, unsubscribeLink: null };
}

module.exports = {
  summarizeEmail,
  categorizeEmail,
  detectUnsubscribe
};

