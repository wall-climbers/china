import express from 'express';
import { isAuthenticated } from '../middleware/auth';
import { llmCounter } from '../services/counter';

const router = express.Router();

/**
 * Get LLM usage statistics
 */
router.get('/stats', isAuthenticated, (req, res) => {
  const stats = llmCounter.getStats();
  const breakdown = llmCounter.getBreakdown();
  const successRate = llmCounter.getSuccessRate();
  const avgResponseTime = llmCounter.getAverageResponseTime();

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
});

/**
 * Get detailed breakdown
 */
router.get('/stats/breakdown', isAuthenticated, (req, res) => {
  const breakdown = llmCounter.getBreakdown();
  res.json({ breakdown });
});

/**
 * Get usage history
 */
router.get('/stats/history', isAuthenticated, (req, res) => {
  const stats = llmCounter.getStats();
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ 
    history: stats.history.slice(0, limit),
    total: stats.history.length
  });
});

/**
 * Get success rate statistics
 */
router.get('/stats/success-rate', isAuthenticated, (req, res) => {
  const successRate = llmCounter.getSuccessRate();
  res.json(successRate);
});

/**
 * Get average response times
 */
router.get('/stats/response-times', isAuthenticated, (req, res) => {
  const avgResponseTime = llmCounter.getAverageResponseTime();
  res.json(avgResponseTime);
});

/**
 * Reset all counters (admin only)
 */
router.post('/stats/reset', isAuthenticated, (req, res) => {
  llmCounter.reset();
  res.json({ message: 'All counters have been reset', success: true });
});

export default router;
