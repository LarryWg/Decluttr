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

  const prompt = `You are an automated classifier for someone tracking their JOB APPLICATIONS during a job search. The "Job" category is ONLY for emails that are direct responses or notifications about a specific job application the user submitted. Any other email must NOT be "Job".

RULE: Use category "Job" ONLY when the email is clearly a reply or automated notification from a company about an application the user sent to that company (e.g. "We received your application", "Your application status", "Interview invite for [role you applied to]", "We regret to inform you...", offer letter). If there is any doubt, use "Other" or "Newsletter" or "Personal" – never "Job".

NEVER use "Job" for any of these (use "Other" or "Newsletter" or "Personal" and set transitionFrom/transitionTo to null):
- One-time passcodes, login verification, "confirm your identity", OTP, verification code, "one-time pass code", "code to log in", "verify your email" for a company website or portal → "Other" (this is account/portal access, not a pipeline stage)
- School, college, university, or graduate program applications → "Other"
- Job boards, job alerts, "new jobs matching your profile", "roles you might like", LinkedIn/Indeed/Glassdoor listings or digests → "Newsletter" or "Other"
- Recruiter cold outreach, "we have opportunities", "we'd like to connect" when the user did not first apply to that company → "Other"
- "Interview" meaning media/podcast/marketing interview, or any non–job-application context → "Other"; only use Interview stage when it is clearly a job interview for a role the user applied to at that company
- Emails the user SENT (their own applications, follow-ups, thank-yous) → "Other"
- General career advice, webinars, events, or newsletters → "Other" or "Newsletter"

Use ONLY these stages (exact spelling) when category is "Job":
- Applications Sent
- OA / Screening
- Interview
- Offer
- Accepted
- Rejected
- No Response
- Declined

Stage rules (only when category is "Job" – i.e. direct response about an application the user submitted):
- Application received/confirmed by company (e.g. "We received your application", "Thanks for applying") → Applications Sent
- Online assessment, recruiter screen, or technical test for that application → OA / Screening
- Job interview invite or completion for the role they applied to → Interview
- Job offer letter or verbal offer → Offer
- Offer acceptance → Accepted
- Rejection (explicit or polite): "we will not be moving forward", "not moving forward with your candidacy", "prioritizing other profiles", "we have decided not to move forward", "thank you for your interest... however we will not be moving forward", "we will not be moving forward with your candidacy for the moment" → Rejected
- No response after long delay → No Response
- User declined offer → Declined

Also provide:
1. A concise 2-3 sentence summary (summary).
2. category: "Job" ONLY when the email is unmistakably a direct response/notification about a job application the user submitted. Otherwise "Other", "Newsletter", or "Personal".
3. hasUnsubscribe: true or false.

Output format: if a stage transition is detected and category is "Job", set transitionFrom and transitionTo to the exact stage names above. Otherwise set both to null.

Email content:
${truncatedContent}

Respond ONLY with valid JSON in this exact format:
{
  "summary": "2-3 sentence summary here",
  "category": "Job or Personal or Promotional or Spam or Newsletter or Other",
  "hasUnsubscribe": true or false,
  "transitionFrom": "exact stage name or null",
  "transitionTo": "exact stage name or null"
}`;

  const maxRetries = 2;
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are an email analysis assistant. Always respond with valid JSON only, no additional text.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 600
      });

      const choice = completion.choices?.[0];
      const responseText = choice?.message?.content?.trim();
      const finishReason = choice?.finish_reason;

      if (!responseText) {
        if (finishReason === 'content_filter') {
          lastError = new Error('OpenAI did not return content (content filter). This email may contain text that was filtered. Try again later or skip.');
        } else if (finishReason === 'length') {
          lastError = new Error('OpenAI response was cut off. Try again.');
        } else {
          lastError = new Error(`Empty response from OpenAI${finishReason ? ` (finish_reason: ${finishReason})` : ''}. Try again in a moment.`);
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
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

    const categoryRaw = (result.category && typeof result.category === 'string') ? result.category.trim() : '';
    if (categoryRaw === 'Job application' || categoryRaw.toLowerCase() === 'job application') {
      result.category = 'Job';
    }
    const validCategories = ['Personal', 'Promotional', 'Spam', 'Newsletter', 'Job', 'Other'];
    if (!validCategories.includes(result.category)) {
      result.category = 'Other';
    }
    if (result.category === 'Work') {
      result.category = 'Other';
    }

    const validStages = ['Applications Sent', 'OA / Screening', 'Interview', 'Offer', 'Accepted', 'Rejected', 'No Response', 'Declined'];
    const stageToSlug = {
      'Applications Sent': 'applications_sent',
      'OA / Screening': 'oa_screening',
      'Interview': 'interview',
      'Offer': 'offer',
      'Accepted': 'accepted',
      'Rejected': 'rejected',
      'No Response': 'no_response',
      'Declined': 'declined'
    };
    // Unify "Application submitted" / "Job application" with "Applications Sent" so diagram counts are correct
    const normalizeStage = (s) => {
      if (!s || typeof s !== 'string') return null;
      const t = s.trim();
      if (/^application\s*submitted$/i.test(t) || /^job\s*application$/i.test(t) || t === 'Applications Sent') return 'Applications Sent';
      return validStages.includes(t) ? t : null;
    };
    let transitionFrom = null;
    let transitionTo = null;
    if (result.category === 'Job' && result.transitionTo) {
      const toNorm = normalizeStage(result.transitionTo) || (validStages.includes(result.transitionTo) ? result.transitionTo : null);
      if (toNorm) {
        transitionTo = toNorm;
        if (result.transitionFrom) {
          const fromNorm = normalizeStage(result.transitionFrom) || (validStages.includes(result.transitionFrom) ? result.transitionFrom : null);
          if (fromNorm) transitionFrom = fromNorm;
        }
      }
    }
    const jobType = transitionTo ? stageToSlug[transitionTo] : null;

    return {
      summary: result.summary.trim(),
      category: result.category,
      hasUnsubscribe: result.hasUnsubscribe,
      jobType,
      transitionFrom,
      transitionTo
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

  const prompt = `Categorize the following email into one of these categories: "Personal", "Promotional", "Spam", "Newsletter", "Job", or "Other".

The "Job" category is ONLY for tracking job applications during a job search. Use "Job" ONLY when the email is clearly a direct response or notification from a company about a specific job application the user submitted (e.g. application received, interview invite, rejection including polite "we will not be moving forward with your candidacy", offer). When in doubt, use "Other" – never "Job".

Do NOT use "Job" for: one-time passcodes, login verification, "confirm your identity", OTP or verification codes for a website; school/college/university applications; job boards, job alerts, or job listing newsletters (LinkedIn jobs, Indeed, Glassdoor); recruiter cold outreach or "we have opportunities"; media/podcast/non-job interviews; emails the user sent (their applications, follow-ups); career events or general newsletters. Use "Other" or "Newsletter" for those.

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

    const validCategories = ['Personal', 'Promotional', 'Spam', 'Newsletter', 'Job', 'Other'];
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

