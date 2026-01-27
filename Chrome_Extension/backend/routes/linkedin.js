const express = require('express');
const router = express.Router();
const { generateLinkedInMessage } = require('../features/linkedin/services/linkedinAI.service');

router.post('/generate-message', async (req, res) => {
  try {
    const { name, title, company, location } = req.body;

    if (!name || !title) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const message = await generateLinkedInMessage({ name, title, company, location });
    res.json({ message });

  } catch (error) {
    console.error("LinkedIn AI Error:", error);
    res.status(500).json({ error: "Failed to generate LinkedIn message" });
  }
});

module.exports = router;
