const express = require('express');
const router = express.Router();
const { summarizeEmail, categorizeEmail, detectUnsubscribe } = require('../utils/openai');

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

    // Generate summary (includes category and unsubscribe detection)
    const result = await summarizeEmail(emailContent, OPENAI_API_KEY);

    // Also detect unsubscribe links (separate call for accuracy)
    const unsubscribeResult = await detectUnsubscribe(emailContent, OPENAI_API_KEY);
    result.hasUnsubscribe = unsubscribeResult.hasUnsubscribe;
    result.unsubscribeLink = unsubscribeResult.unsubscribeLink || null;

    res.json(result);
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

    const result = await categorizeEmail(emailContent, OPENAI_API_KEY);
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

module.exports = router;

