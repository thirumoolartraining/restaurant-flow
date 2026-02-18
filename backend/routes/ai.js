const express = require('express');
const groqAi = require('../services/groqAi');
const authMiddleware = require('../middleware/auth');
const { adminRateLimiter } = require('../middleware/rateLimiter');
const router = express.Router();

// Apply admin rate limiting
router.use(adminRateLimiter);

router.post('/generate-description', authMiddleware, async (req, res) => {
  try {
    const { name, category } = req.body;
    const description = await groqAi.generateDescription(name, category);
    res.json({ description });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate-tags', authMiddleware, async (req, res) => {
  try {
    const { name, category, foodType, quantity, unit } = req.body;
    const tags = await groqAi.generateTags(name, category, foodType, quantity, unit);
    res.json({ tags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
