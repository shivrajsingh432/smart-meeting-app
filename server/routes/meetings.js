/**
 * meetings.js – Updated Routes
 * Includes: password-protected join, lock, waiting room approval, public info
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { protect, optionalAuth } = require('../middleware/auth');
const {
    createMeeting,
    joinMeeting,
    endMeeting,
    toggleLock,
    approveWaiting,
    getMeetingHistory,
    getMeetingSummary,
    getMeetingInfo,
} = require('../controllers/meetingController');

// Rate limiter for join attempts (anti-brute force on passwords)
const joinLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minute window
    max: 10,                  // 10 join attempts per IP per 5 min
    message: { success: false, message: 'Too many join attempts. Please wait 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ── Routes ─────────────────────────────────────────────────────────────────
router.post('/create', protect, createMeeting);
router.post('/join', joinLimiter, optionalAuth, joinMeeting);
router.get('/history', protect, getMeetingHistory);

router.get('/:meetingId/info', getMeetingInfo);          // Public – for join page
router.get('/:meetingId/summary', protect, getMeetingSummary);
router.post('/:meetingId/end', protect, endMeeting);
router.post('/:meetingId/lock', protect, toggleLock);
router.post('/:meetingId/approve-waiting', protect, approveWaiting);

module.exports = router;
