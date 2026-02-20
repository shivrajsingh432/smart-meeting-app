/**
 * Engagement Routes
 */
const express = require('express');
const router = express.Router();
const {
    updateEngagement,
    getEngagement,
    getLeaderboard,
    getUserStats,
} = require('../controllers/engagementController');
const { protect } = require('../middleware/auth');

// POST /api/engagement/update  (Protected)
router.post('/update', protect, updateEngagement);

// GET /api/engagement/:meetingId  (Protected)
router.get('/:meetingId', protect, getEngagement);

// GET /api/engagement/:meetingId/leaderboard  (Protected)
router.get('/:meetingId/leaderboard', protect, getLeaderboard);

// GET /api/dashboard/stats  (Protected)
router.get('/dashboard/stats', protect, getUserStats);

module.exports = router;
