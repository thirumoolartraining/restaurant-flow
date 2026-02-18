/**
 * Cache Management Routes - Phase 6.9
 */

const express = require('express');
const router = express.Router();
const cache = require('../services/cache');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const { adminRateLimiter } = require('../middleware/rateLimiter');

// All routes require admin authentication and rate limiting
router.use(adminRateLimiter);
router.use(authenticate);
router.use(authorize(['admin']));

/**
 * @route GET /api/cache/stats
 * @desc Get cache statistics
 * @access Admin only
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await cache.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/cache/warm
 * @desc Warm cache with frequently accessed data
 * @access Admin only
 */
router.post('/warm', async (req, res) => {
  try {
    const result = await cache.warmCache();
    res.json({ success: result, message: 'Cache warmed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/cache/clear
 * @desc Clear all cache
 * @access Admin only
 */
router.delete('/clear', async (req, res) => {
  try {
    const result = await cache.clearAll();
    res.json({ success: result, message: 'Cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/cache/:namespace
 * @desc Clear cache for specific namespace
 * @access Admin only
 */
router.delete('/:namespace', async (req, res) => {
  try {
    const { namespace } = req.params;
    const result = await cache.delNamespace(namespace);
    res.json({ success: result, message: `Cache cleared for namespace: ${namespace}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route DELETE /api/cache/:namespace/:identifier
 * @desc Delete specific cached item
 * @access Admin only
 */
router.delete('/:namespace/:identifier', async (req, res) => {
  try {
    const { namespace, identifier } = req.params;
    const result = await cache.del(namespace, identifier);
    res.json({ success: result, message: `Cache deleted: ${namespace}:${identifier}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
