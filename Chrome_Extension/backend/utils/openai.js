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

  const prompt = `You are an automated classifier for someone tracking their JOB APPLICATIONS during a job search.

Output exactly two things that matter:
1. Is this email a direct response or notification about a JOB APPLICATION the user submitted? If yes, category = "Job" and set the correct stage below. Otherwise category = "Other" and set transitionFrom/transitionTo to null.
2. Does this email contain or reference an unsubscribe option (link, "unsubscribe", "manage preferences", "opt out", etc.)? Set hasUnsubscribe true or false.

Use category "Job" ONLY when the email is clearly from a company about an application the user sent (e.g. "We received your application", "Your application status", "Interview invite", rejection, offer letter). If there is any doubt, use "Other".

NEVER use "Job" for: one-time passcodes, login verification, OTP, school/university applications, job boards/job alerts/LinkedIn listings, recruiter cold outreach, emails the user sent, general newsletters. Use "Other" and set transitionFrom/transitionTo to null.

When category is "Job", use ONLY these stages (exact spelling):
- Applications Sent
- OA / Screening
- Interview
- Offer
- Accepted
- Rejected
- No Response
- Declined

Stage rules (only when category is "Job" – i.e. direct response about an application the user submitted):
- Applications Sent: Application received/confirmed by company. Use this for: "We received your application", "Thanks for applying", "Thank you for applying to [role]", "we're thrilled you're interested". Also use Applications Sent (NOT Interview) when the email only mentions interview as a *future possibility*: e.g. "Should you be selected to interview, we will reach out", "we may reach out in the coming weeks", "if we'd like to move forward we'll contact you", "a member of our Talent team will reach out" (with no actual invite or date). If they are not actually inviting or scheduling an interview in this email → Applications Sent.
- OA / Screening: Online assessment (coding test, HackerRank, Codility), recruiter phone screen, initial screening call, "first round", "technical assessment" (before a formal interview round), "schedule a call to learn more about your background". Use this for early filtering steps before a formal interview.
- Interview: Use ONLY when the company is actually inviting or scheduling an interview in this email. Examples: "We would like to invite you to an interview", "schedule your interview", "pick a time for your interview", "interview day", "final round interview", "onsite interview", "virtual interview" (when they are setting it up, not just mentioning it might happen). Do NOT use Interview for: (1) Application confirmations that only say they might contact you later ("should you be selected to interview", "we'll reach out if we'd like to interview you", "a member of our team will reach out in the coming weeks" with no invite/link) → use Applications Sent; (2) recruiter screening calls, phone screens, "quick call", OA; (3) media/podcast interview. If no concrete invite or scheduling link/time is in the email → Applications Sent.
- Job offer letter or verbal offer → Offer
- Offer acceptance → Accepted
- Rejection (explicit or polite): "we will not be moving forward", "not moving forward with your candidacy", "prioritizing other profiles", "we have decided not to move forward", "thank you for your interest... however we will not be moving forward", "we will not be moving forward with your candidacy for the moment" → Rejected
- No response after long delay → No Response
- User declined offer → Declined

Provide: summary (2-3 sentences), category ("Job" or "Other"), hasUnsubscribe (true/false), transitionFrom and transitionTo (exact stage names or null).

Email content:
${truncatedContent}

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence summary here",
  "category": "Job or Other",
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
    const validCategories = ['Job', 'Other'];
    if (result.category !== 'Job') {
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

/**
 * Check if an email matches a user-defined label based on context/description
 * @param {string} emailContent - Full email content (subject + body)
 * @param {string} labelName - User-facing label name (e.g. "Work", "Newsletters")
 * @param {string} labelDescription - User's description of what emails should get this label
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<{match: boolean}>}
 */
async function matchCustomLabel(emailContent, labelName, labelDescription, apiKey) {
  if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
    throw new Error('Email content is required and must be a non-empty string');
  }
  if (!labelName || typeof labelName !== 'string' || !labelName.trim()) {
    throw new Error('Label name is required');
  }
  if (!labelDescription || typeof labelDescription !== 'string' || !labelDescription.trim()) {
    throw new Error('Label description is required');
  }

  const truncatedContent = emailContent.length > 6000 ? emailContent.slice(-6000) : emailContent;
  const openai = createOpenAIClient(apiKey);

  const prompt = `You are an email classifier. The user has created a Gmail label called "${labelName}" and described what kind of emails should get this label:

"${labelDescription}"

Use BOTH the label name and the user's description to decide. Infer context from the label name itself (e.g. "Work" suggests work-related, "Newsletters" suggests newsletter signups, "Finance" suggests bills/banking). Combine that with the user's description – the user's description may not be precise, so the label name helps narrow it. Only say match: true if the email clearly fits the label name and/or description; when in doubt, say no.

Email content:
${truncatedContent}

Respond ONLY with valid JSON in this exact format:
{
  "match": true or false
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are an email classification assistant. Always respond with valid JSON only, no additional text.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 50
    });

    const responseText = completion.choices?.[0]?.message?.content?.trim();
    if (!responseText) {
      return { match: false };
    }

    let jsonText = responseText;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    const result = JSON.parse(jsonText);
    const match = result.match === true;
    return { match };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { match: false };
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

module.exports = {
  summarizeEmail,
  categorizeEmail,
  detectUnsubscribe,
  matchCustomLabel
};

