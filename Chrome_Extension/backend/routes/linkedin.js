const express = require('express');
const router = express.Router();
const { 
  generateLinkedInMessage, 
  searchLinkedInProfiles,
  batchGenerateMessages
} = require('../features/linkedin/services/linkedinAI.service');

/**
 * POST /api/linkedin/search
 * Search for LinkedIn profiles using Google Custom Search
 * Body: { query: string, limit?: number }
 * Returns: { profiles: Array<Profile> }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, limit } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: "Search query is required" });
    }

    const profiles = await searchLinkedInProfiles(query, limit || 10);
    
    res.json({ 
      profiles,
      count: profiles.length
    });

  } catch (error) {
    console.error("LinkedIn Search Error:", error);
    res.status(500).json({ error: error.message || "Failed to search LinkedIn profiles" });
  }
});

/**
 * POST /api/linkedin/generate-message
 * Generate a personalized message for a single profile
 * Body: { name, title, company, location, userDescription? }
 * Returns: { message: string }
 */
router.post('/generate-message', async (req, res) => {
  try {
    const { name, title, company, location, userDescription } = req.body;

    if (!name || !title) {
      return res.status(400).json({ error: "Name and title are required" });
    }

    const message = await generateLinkedInMessage(
      { name, title, company, location },
      userDescription
    );
    
    res.json({ message });

  } catch (error) {
    console.error("LinkedIn AI Error:", error);
    res.status(500).json({ error: "Failed to generate LinkedIn message" });
  }
});

/**
 * POST /api/linkedin/search-and-generate
 * Search LinkedIn profiles and generate messages for all results
 * Body: { query: string, limit?: number, userDescription?: string }
 * Returns: { profiles: Array<ProfileWithMessage> }
 */
router.post('/search-and-generate', async (req, res) => {
  try {
    const { query, limit, userDescription } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: "Search query is required" });
    }

    // Search for profiles
    const profiles = await searchLinkedInProfiles(query, limit || 10);
    
    if (profiles.length === 0) {
      return res.json({ 
        profiles: [],
        count: 0,
        message: "No profiles found for the given query"
      });
    }

    // Generate messages for all profiles
    const profilesWithMessages = await batchGenerateMessages(profiles, userDescription);
    
    res.json({ 
      profiles: profilesWithMessages,
      count: profilesWithMessages.length
    });

  } catch (error) {
    console.error("LinkedIn Search & Generate Error:", error);
    res.status(500).json({ error: error.message || "Failed to search and generate messages" });
  }
});

module.exports = router;