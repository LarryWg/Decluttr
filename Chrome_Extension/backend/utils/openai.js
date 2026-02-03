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

IMPORTANT: Use category "Job" when the email is clearly from a company/employer about an application the user submitted. This includes ALL of the following – they are ALL "Job" emails:
- Application confirmations/acknowledgments: "Thanks for applying", "Thank you for applying", "We received your application", "Thank you for your interest", "excited to receive your application", "Thank you for taking the time to apply", "applying to the [role] role"
- Even if the email says "should you be selected to interview, we will reach out" or "if shortlisted" – this is STILL a Job email (Applications Sent stage) because it confirms they received your application
- Status updates: "Your application status", "application update"
- Interview invites, OA/assessment invites
- Rejections: "we will not be moving forward", "not selected", "decided not to proceed"
- Offers: job offer, verbal offer

NEVER use "Job" for: one-time passcodes, login verification, OTP, school/university applications, job boards/job alerts/LinkedIn job recommendations, recruiter cold outreach without reference to a specific application you submitted, emails the user sent, general newsletters. Use "Other" and set transitionFrom/transitionTo to null.

When category is "Job", use ONLY these stages (exact spelling):
- Applications Sent
- OA / Screening
- Interview
- Offer
- Accepted
- Rejected
- No Response
- Declined

CRITICAL – Interview vs Applications Sent (avoid false positives for Interview):
- Use "Interview" ONLY when BOTH are true: (a) the email is about a job application, AND (b) the email contains an ACTUAL invitation or scheduling of an interview in this message (e.g. "we would like to invite you to an interview", "schedule your interview", "pick a time", "choose a time slot", "book your interview", calendar link, "select a date", "interview on [date]", "final round interview" with a concrete invite).
- Do NOT use "Interview" when the email only describes what MIGHT happen later. These are all Applications Sent: "should you be selected to interview we will reach out"; "we may reach out in the coming weeks"; "if we'd like to move forward we'll contact you"; "if shortlisted, you will move forward with our formal interview process"; "if your skills are a strong match, you will be contacted for an initial discussion"; "you will be contacted directly"; "what happens next? … you will be contacted / move forward with our interview process"; "our team will review"; "we'll be in touch". No actual invite or scheduling in this email → Applications Sent.
- Do NOT use "Interview" for: recruiter screening calls, phone screens, "quick call to learn more", "schedule a call to discuss your background", OA/coding assessments → use OA / Screening or Applications Sent.
- When in doubt between Interview and Applications Sent, always use Applications Sent.

Stage rules (only when category is "Job"):
- Applications Sent: Application received/confirmed. Use this for: "Thanks for applying", "Thank you for applying", "Thank you for your interest", "excited to receive your application", "We received your application", "Thank you for taking the time to apply". ALSO use Applications Sent even if the email mentions conditional future steps like "should you be selected to interview, we will reach out" or "if shortlisted you will be contacted" – these are application confirmations, NOT interview invites.
- OA / Screening: Online assessment (HackerRank, Codility), recruiter phone screen, "schedule a call to learn more", "first round" technical assessment, screening call.
- Interview: Only when this email actually invites or schedules an interview (invite text + scheduling link/time). Not for "we may reach out" or screening calls.
- Offer → job offer or verbal offer. Accepted → offer acceptance. Rejected → "we will not be moving forward", "not moving forward with your candidacy". No Response / Declined as appropriate.

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
        temperature: 0.1,
        max_tokens: 600
      });

      const choice = completion.choices?.[0];
      const responseText = choice?.message?.content?.trim();
      const finishReason = choice?.finish_reason;

      if (!responseText) {
        if (finishReason === 'content_filter') {
          // Don't retry - same input will filter again. Return safe fallback so pipeline continues.
          console.warn('OpenAI content filter triggered for an email; returning fallback (category: Other).');
          return {
            summary: 'Email could not be summarized (content was filtered by provider).',
            category: 'Other',
            hasUnsubscribe: false,
            jobType: null,
            transitionFrom: null,
            transitionTo: null
          };
        }
        if (finishReason === 'length') {
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
    // Safeguard: only allow "Interview" if email contains actual invite/scheduling language (avoids labeling application confirmations as Interview)
    if (transitionTo === 'Interview') {
      const invitePhrases = /\b(invite you|invited to (an? )?interview|schedule your interview|schedule an interview|pick a time|choose a time|select a (time|date)|book (your )?interview|interview slot|calendar (link|invite)|we would like to invite|invite you (to|for) (an? )?interview)\b/i;
      const hasInvite = invitePhrases.test(truncatedContent);
      if (!hasInvite) {
        transitionTo = 'Applications Sent';
        transitionFrom = null;
      } else {
        // Application-confirmation wording: "if shortlisted...", "what happens next?" = no actual invite in this email
        const applicationConfirmationOnly = /\b(if shortlisted|you will move forward with our (formal )?interview process|what happens next\?)\b/i;
        if (applicationConfirmationOnly.test(truncatedContent)) {
          transitionTo = 'Applications Sent';
          transitionFrom = null;
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

The "Job" category is for tracking job applications during a job search. Use "Job" when the email is clearly a direct response or notification from a company/employer about a specific job application the user submitted. This includes ALL of the following:
- Application confirmations/acknowledgments: "Thanks for applying", "Thank you for applying", "We received your application", "Thank you for your interest", "excited to receive your application", "Thank you for taking the time to apply"
- Even if the email says "should you be selected to interview" or "if shortlisted" – this is STILL a Job email because it confirms they received your application
- Application status updates
- Interview invitations
- Assessment/OA invitations
- Rejections: "we will not be moving forward", "not selected"
- Job offers

Do NOT use "Job" for: one-time passcodes, login verification, "confirm your identity", OTP or verification codes; school/college/university applications; job boards, job alerts, or job listing newsletters (LinkedIn jobs, Indeed, Glassdoor); recruiter cold outreach without reference to a specific application you submitted; media/podcast/non-job interviews; emails the user sent; career events or general newsletters. Use "Other" or "Newsletter" for those.

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

