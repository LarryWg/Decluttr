const express = require('express');
const router = express.Router();
const { summarizeEmail, categorizeEmail, detectUnsubscribe } = require('../utils/openai');

/**
 * POST /api/email/summarize
 * Generate AI summary, category, and unsubscribe detection for an email
 * Body: { emailContent: string, apiKey: string }
 * Returns: { summary: string, category: string, hasUnsubscribe: boolean }
 */
router.post('/summarize', async (req, res, next) => {
  try {
    const { emailContent, apiKey } = req.body;

    // Validation
    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ 
        error: 'apiKey is required and must be a valid OpenAI API key' 
      });
    }

    // Generate summary (includes category and unsubscribe detection)
    const result = await summarizeEmail(emailContent, apiKey);

    // Also detect unsubscribe links (separate call for accuracy)
    const unsubscribeResult = await detectUnsubscribe(emailContent, apiKey);
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
 * Body: { emailContent: string, apiKey: string }
 * Returns: { category: string, confidence: number }
 */
router.post('/categorize', async (req, res, next) => {
  try {
    const { emailContent, apiKey } = req.body;

    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ 
        error: 'apiKey is required and must be a valid OpenAI API key' 
      });
    }

    const result = await categorizeEmail(emailContent, apiKey);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/email/detect-unsubscribe
 * Detect unsubscribe links in email content
 * Body: { emailContent: string, apiKey?: string }
 * Returns: { hasUnsubscribe: boolean, unsubscribeLink: string | null }
 */
router.post('/detect-unsubscribe', async (req, res, next) => {
  try {
    const { emailContent, apiKey } = req.body;

    if (!emailContent || typeof emailContent !== 'string' || emailContent.trim().length === 0) {
      return res.status(400).json({ 
        error: 'emailContent is required and must be a non-empty string' 
      });
    }

    // API key is optional for unsubscribe detection (uses pattern matching primarily)
    const result = await detectUnsubscribe(emailContent, apiKey || '');
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

