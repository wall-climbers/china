import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { llmCounter } from '../services/counter';

const router = express.Router();

/**
 * Get LLM usage statistics
 */
router.get('/stats', isAuthenticated, async (req, res) => {
  try {
    const [stats, breakdown, successRate, avgResponseTime] = await Promise.all([
      llmCounter.getStats(),
      llmCounter.getBreakdown(),
      llmCounter.getSuccessRate(),
      llmCounter.getAverageResponseTime()
    ]);

    res.json({
      overview: {
        total: stats.total,
        textToText: stats.textToText,
        textToImage: stats.textToImage,
        textToVideo: stats.textToVideo
      },
      breakdown,
      successRate,
      avgResponseTime,
      recentHistory: stats.history.slice(0, 20) // Last 20 records
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * Get detailed breakdown
 */
router.get('/stats/breakdown', isAuthenticated, async (req, res) => {
  try {
    const breakdown = await llmCounter.getBreakdown();
    res.json({ breakdown });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch breakdown' });
  }
});

/**
 * Get usage history
 */
router.get('/stats/history', isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const history = await llmCounter.getHistory(limit);
    res.json({ 
      history,
      total: history.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * Get success rate statistics
 */
router.get('/stats/success-rate', isAuthenticated, async (req, res) => {
  try {
    const successRate = await llmCounter.getSuccessRate();
    res.json(successRate);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch success rate' });
  }
});

/**
 * Get average response times
 */
router.get('/stats/response-times', isAuthenticated, async (req, res) => {
  try {
    const avgResponseTime = await llmCounter.getAverageResponseTime();
    res.json(avgResponseTime);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch response times' });
  }
});

/**
 * Reset all counters (admin only)
 */
router.post('/stats/reset', isAuthenticated, async (req, res) => {
  try {
    await llmCounter.reset();
    res.json({ message: 'All counters have been reset', success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset counters' });
  }
});

export default router;
