/**
 * meetingController.js – Upgraded
 * Adds: password creation/validation, invite links, meeting lock, waiting room
 */

const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { generateMeetingId } = require('../utils/meetingUtils');

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/meetings/create
// @access  Private (JWT required)
// ─────────────────────────────────────────────────────────────────────────────
const createMeeting = async (req, res) => {
    try {
        const {
            title,
            password,
            waitingRoomEnabled = false,
            expiryHours = 24,
        } = req.body;

        const meetingId = generateMeetingId(); // e.g., "ABC-1X2"

        // Build expiresAt
        const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

        // Build meeting data
        const meetingData = {
            meetingId,
            title: title || 'SmartMeet Session',
            host: req.user._id,
            waitingRoomEnabled,
            expiresAt,
        };

        // Set password if provided
        if (password && password.trim().length > 0) {
            meetingData.meetingPassword = password.trim();
        }

        const meeting = await Meeting.create(meetingData);

        // Add to host's history
        await User.findByIdAndUpdate(req.user._id, {
            $push: { meetingsHosted: meeting._id },
        });

        // Build base URL dynamically
        const baseUrl =
            process.env.APP_URL ||
            `${req.protocol}://${req.get('host')}`;

        res.status(201).json({
            success: true,
            meetingId: meeting.meetingId,
            title: meeting.title,
            isPasswordProtected: meeting.isPasswordProtected,
            waitingRoomEnabled: meeting.waitingRoomEnabled,
            inviteLink: `${baseUrl}/join/${meeting.meetingId}`,
            meetingLink: `${baseUrl}/meeting.html?id=${meeting.meetingId}`,
            expiresAt: meeting.expiresAt,
        });
    } catch (error) {
        console.error('Create meeting error:', error);
        res.status(500).json({ success: false, message: 'Failed to create meeting' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/meetings/join
// @access  Public (password required if protected)
// ─────────────────────────────────────────────────────────────────────────────
const joinMeeting = async (req, res) => {
    try {
        const { meetingId, password } = req.body;

        if (!meetingId) {
            return res.status(400).json({ success: false, message: 'Meeting ID is required' });
        }

        // Fetch meeting WITH password field
        const meeting = await Meeting.findOne({
            meetingId: meetingId.toUpperCase().trim(),
        }).select('+meetingPassword');

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found. Check the ID and try again.' });
        }

        // Check if expired
        if (meeting.expiresAt && new Date() > meeting.expiresAt) {
            return res.status(410).json({ success: false, message: 'This meeting has expired.' });
        }

        // Check if ended
        if (meeting.status === 'ended') {
            return res.status(410).json({ success: false, message: 'This meeting has already ended.' });
        }

        // Check if locked
        if (meeting.isLocked) {
            return res.status(403).json({ success: false, message: 'This meeting is locked. No new participants can join.' });
        }

        // Validate password
        if (meeting.isPasswordProtected) {
            if (!password) {
                return res.status(401).json({
                    success: false,
                    message: 'This meeting requires a password.',
                    requiresPassword: true,
                });
            }

            const isPasswordValid = await meeting.comparePassword(password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Incorrect meeting password.',
                    requiresPassword: true,
                });
            }
        }

        // Update status to active if still waiting
        if (meeting.status === 'waiting') {
            meeting.status = 'active';
            await meeting.save();
        }

        // Add participant if logged in
        if (req.user) {
            await Meeting.findByIdAndUpdate(meeting._id, {
                $addToSet: { participants: req.user._id },
            });
            await User.findByIdAndUpdate(req.user._id, {
                $addToSet: { meetingsJoined: meeting._id },
            });
        }

        // Generate a short-lived join token (valid for 5 minutes)
        const jwt = require('jsonwebtoken');
        const joinToken = jwt.sign(
            { meetingId: meeting.meetingId, authorized: true },
            process.env.JWT_SECRET,
            { expiresIn: '5m' }
        );

        res.json({
            success: true,
            meetingId: meeting.meetingId,
            title: meeting.title,
            hostId: meeting.host,
            waitingRoomEnabled: meeting.waitingRoomEnabled,
            joinToken, // Used by Socket.io to verify authorized entry
        });
    } catch (error) {
        console.error('Join meeting error:', error);
        res.status(500).json({ success: false, message: 'Failed to join meeting' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/meetings/:meetingId/end
// @access  Private (host only)
// ─────────────────────────────────────────────────────────────────────────────
const endMeeting = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        if (meeting.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only the host can end the meeting' });
        }

        const endTime = new Date();
        const duration = Math.floor((endTime - meeting.startTime) / 1000);

        meeting.status = 'ended';
        meeting.endTime = endTime;
        meeting.duration = duration;
        await meeting.save();

        // Optionally trigger AI summary generation
        try {
            const { generateSummary } = require('../services/huggingfaceService');
            if (meeting.transcript && meeting.transcript.length > 50) {
                const summary = await generateSummary(meeting.transcript);
                meeting.summary = summary;
                await meeting.save();
            }
        } catch (aiErr) {
            console.warn('AI summary failed (non-fatal):', aiErr.message);
        }

        res.json({
            success: true,
            message: 'Meeting ended',
            duration,
            meetingId,
        });
    } catch (error) {
        console.error('End meeting error:', error);
        res.status(500).json({ success: false, message: 'Failed to end meeting' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/meetings/:meetingId/lock
// @access  Private (host only)
// ─────────────────────────────────────────────────────────────────────────────
const toggleLock = async (req, res) => {
    try {
        const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
        if (meeting.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only host can lock meeting' });
        }

        meeting.isLocked = !meeting.isLocked;
        await meeting.save();

        res.json({ success: true, isLocked: meeting.isLocked });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   POST /api/meetings/:meetingId/approve-waiting
// @access  Private (host only)
// ─────────────────────────────────────────────────────────────────────────────
const approveWaiting = async (req, res) => {
    try {
        const { userId } = req.body;
        const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
        if (!meeting) return res.status(404).json({ success: false, message: 'Meeting not found' });
        if (meeting.host.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Only host can approve' });
        }

        // Remove from waiting queue
        meeting.waitingQueue = meeting.waitingQueue.filter(
            (w) => w.userId.toString() !== userId.toString()
        );
        await meeting.save();

        res.json({ success: true, message: 'Participant approved' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/meetings/history
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getMeetingHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate({
                path: 'meetingsHosted',
                select: 'meetingId title status startTime endTime duration participants',
                options: { sort: { createdAt: -1 }, limit: 20 },
            })
            .populate({
                path: 'meetingsJoined',
                select: 'meetingId title status startTime endTime duration host',
                populate: { path: 'host', select: 'name' },
                options: { sort: { createdAt: -1 }, limit: 20 },
            });

        const formatMeeting = (m, isHosted) => ({
            meetingId: m.meetingId,
            title: m.title,
            status: m.status,
            startTime: m.startTime,
            duration: m.duration,
            hostName: isHosted ? req.user.name : m.host?.name,
            participantNames: m.participants?.length || 0,
        });

        res.json({
            success: true,
            hosted: (user.meetingsHosted || []).map((m) => formatMeeting(m, true)),
            joined: (user.meetingsJoined || []).map((m) => formatMeeting(m, false)),
        });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/meetings/:meetingId/summary
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
const getMeetingSummary = async (req, res) => {
    try {
        const meeting = await Meeting.findOne({
            meetingId: req.params.meetingId,
        }).populate('host participants', 'name email');

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        // Fetch analytics
        const Engagement = require('../models/Engagement');
        const engagements = await Engagement.find({ meetingId: req.params.meetingId })
            .populate('userId', 'name')
            .sort({ engagementScore: -1 });

        const formattedEngagements = engagements.map((e) => ({
            userId: e.userId?._id,
            userName: e.userId?.name || e.userName,
            speakingTime: e.speakingTime,
            cameraOnTime: e.cameraOnTime,
            engagementScore: Math.round(e.engagementScore),
            contributionPercentage: Math.round(e.contributionPercentage),
        }));

        res.json({
            success: true,
            meeting: {
                meetingId: meeting.meetingId,
                title: meeting.title,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                duration: meeting.duration,
                participants: meeting.participants,
                chatMessages: meeting.chatMessages,
            },
            summary: {
                text: meeting.summary || '',
                structured: meeting.summaryStructured || {},
                transcript: meeting.transcript || '',
            },
            analytics: {
                engagements: formattedEngagements,
            },
        });
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch summary' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// @route   GET /api/meetings/:meetingId/info
// @access  Public (for join page)
// ─────────────────────────────────────────────────────────────────────────────
const getMeetingInfo = async (req, res) => {
    try {
        const meeting = await Meeting.findOne({
            meetingId: req.params.meetingId.toUpperCase(),
        }).populate('host', 'name');

        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found' });
        }

        res.json({
            success: true,
            meetingId: meeting.meetingId,
            title: meeting.title,
            hostName: meeting.host?.name,
            isPasswordProtected: meeting.isPasswordProtected,
            status: meeting.status,
            isLocked: meeting.isLocked,
            waitingRoomEnabled: meeting.waitingRoomEnabled,
            participantCount: meeting.participants?.length || 0,
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createMeeting,
    joinMeeting,
    endMeeting,
    toggleLock,
    approveWaiting,
    getMeetingHistory,
    getMeetingSummary,
    getMeetingInfo,
};
