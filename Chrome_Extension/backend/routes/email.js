const express = require('express');
const router = express.Router();
const { summarizeEmail, categorizeEmail, detectUnsubscribe, matchCustomLabel } = require('../utils/openai');
const openaiCache = require('../utils/openaiCache');

// Get OpenAI API key from environment (server-side)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('WARNING: OPENAI_API_KEY not set in environment variables');
}

/**
 * POST /api/email/summarize
 * Generate AI summary, category, and unsubscribe detection for an email
 * Body: { emailContent: string }
 * Returns: { summary: string, category: string, hasUnsubscribe: boolean }
 */
router.post('/summarize', async (req, res, next) => {
  try {
    const { emailContent } = req.body;

    // Validation
    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured on server. Please set OPENAI_API_KEY environment variable.' 
      });
    }

    const cacheKey = openaiCache.keys.summarize(emailContent);
    let result = openaiCache.get(cacheKey);
    if (result) return res.json(result);

    const rawResult = await summarizeEmail(emailContent, OPENAI_API_KEY);
    const unsubscribeResult = await detectUnsubscribe(emailContent, OPENAI_API_KEY);
    rawResult.hasUnsubscribe = unsubscribeResult.hasUnsubscribe;
    rawResult.unsubscribeLink = unsubscribeResult.unsubscribeLink || null;
    openaiCache.set(cacheKey, rawResult);
    res.json(rawResult);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/email/categorize
 * Categorize an email
 * Body: { emailContent: string }
 * Returns: { category: string, confidence: number }
 */
router.post('/categorize', async (req, res, next) => {
  try {
    const { emailContent } = req.body;

    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured on server. Please set OPENAI_API_KEY environment variable.' 
      });
    }

    const cacheKey = openaiCache.keys.categorize(emailContent);
    let result = openaiCache.get(cacheKey);
    if (result) return res.json(result);
    result = await categorizeEmail(emailContent, OPENAI_API_KEY);
    openaiCache.set(cacheKey, result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/email/detect-unsubscribe
 * Detect unsubscribe links in email content
 * Body: { emailContent: string }
 * Returns: { hasUnsubscribe: boolean, unsubscribeLink: string | null }
 */
router.post('/detect-unsubscribe', async (req, res, next) => {
  try {
    const { emailContent } = req.body;

    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    // API key is optional for unsubscribe detection (uses pattern matching primarily)
    const result = await detectUnsubscribe(emailContent, OPENAI_API_KEY || '');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/email/match-custom-label
 * Check if an email matches a user-defined label (name + description)
 * Body: { emailContent: string, labelName: string, labelDescription: string }
 * Returns: { match: boolean }
 */
router.post('/match-custom-label', async (req, res, next) => {
  try {
    const { emailContent, labelName, labelDescription } = req.body;

    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ error: 'emailContent is required and must be a non-empty string' });
    }
    if (!labelName || typeof labelName !== 'string' || !labelName.trim()) {
      return res.status(400).json({ error: 'labelName is required' });
    }
    if (!labelDescription || typeof labelDescription !== 'string' || !labelDescription.trim()) {
      return res.status(400).json({ error: 'labelDescription is required' });
    }

    if (!OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OpenAI API key not configured on server. Please set OPENAI_API_KEY environment variable.'
      });
    }

    const name = labelName.trim();
    const desc = labelDescription.trim();
    const cacheKey = openaiCache.keys.matchCustomLabel(emailContent, name, desc);
    let result = openaiCache.get(cacheKey);
    if (result) return res.json(result);
    result = await matchCustomLabel(emailContent, name, desc, OPENAI_API_KEY);
    openaiCache.set(cacheKey, result);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

