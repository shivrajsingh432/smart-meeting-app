/**
 * Engagement Controller
 * Manages real-time engagement tracking and analytics
 */

const Engagement = require('../models/Engagement');
const Meeting = require('../models/Meeting');

/**
 * @route   POST /api/engagement/update
 * @desc    Update engagement metrics for a participant (called every 5-10s via Socket.io or REST)
 * @access  Protected
 */
const updateEngagement = async (req, res) => {
    try {
        const {
            meetingId,
            speakingTimeDelta, // seconds added since last update
            cameraOnTimeDelta, // seconds camera was on since last update
            chatMessagesDelta, // new chat messages since last update
        } = req.body;

        if (!meetingId) {
            return res.status(400).json({ success: false, message: 'meetingId is required.' });
        }

        // Increment engagement fields
        const engagement = await Engagement.findOneAndUpdate(
            { meetingId, userId: req.user.id },
            {
                $inc: {
                    speakingTime: speakingTimeDelta || 0,
                    cameraOnTime: cameraOnTimeDelta || 0,
                    chatMessages: chatMessagesDelta || 0,
                },
                $push: {
                    history: {
                        timestamp: new Date(),
                        speakingTime: speakingTimeDelta || 0,
                    },
                },
            },
            { upsert: true, new: true }
        );

        // Recalculate score in real-time
        const meeting = await Meeting.findOne({ meetingId });
        if (meeting) {
            const meetingDuration = Math.max(
                Math.floor((new Date() - meeting.startTime) / 1000),
                1
            );
            const speakingScore = (engagement.speakingTime / meetingDuration) * 50;
            const cameraScore = (engagement.cameraOnTime / meetingDuration) * 30;
            const chatScore = Math.min(engagement.chatMessages * 2, 20);
            const score = Math.min(Math.round(speakingScore + cameraScore + chatScore), 100);

            engagement.engagementScore = score;
            await engagement.save();
        }

        res.status(200).json({ success: true, engagement });
    } catch (error) {
        console.error('UpdateEngagement error:', error);
        res.status(500).json({ success: false, message: 'Failed to update engagement.' });
    }
};

/**
 * @route   GET /api/engagement/:meetingId
 * @desc    Get all participant engagement data for a meeting
 * @access  Protected
 */
const getEngagement = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const engagements = await Engagement.find({ meetingId })
            .sort({ engagementScore: -1 })
            .populate('userId', 'name');

        // Assign ranks
        const ranked = engagements.map((eng, idx) => ({
            ...eng.toObject(),
            rank: idx + 1,
        }));

        res.status(200).json({ success: true, engagements: ranked });
    } catch (error) {
        console.error('GetEngagement error:', error);
        res.status(500).json({ success: false, message: 'Failed to get engagement data.' });
    }
};

/**
 * @route   GET /api/engagement/:meetingId/leaderboard
 * @desc    Get contribution leaderboard for a meeting
 * @access  Protected
 */
const getLeaderboard = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const engagements = await Engagement.find({ meetingId })
            .sort({ speakingTime: -1 })
            .populate('userId', 'name');

        const totalSpeakingTime = engagements.reduce((sum, e) => sum + e.speakingTime, 0);

        const leaderboard = engagements.map((eng, idx) => ({
            rank: idx + 1,
            userId: eng.userId,
            userName: eng.userName,
            speakingTime: eng.speakingTime,
            contributionPercentage:
                totalSpeakingTime > 0
                    ? Math.round((eng.speakingTime / totalSpeakingTime) * 100)
                    : 0,
            engagementScore: eng.engagementScore,
        }));

        res.status(200).json({ success: true, leaderboard, totalSpeakingTime });
    } catch (error) {
        console.error('GetLeaderboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to get leaderboard.' });
    }
};

/**
 * @route   GET /api/dashboard/stats
 * @desc    Get user's overall statistics
 * @access  Protected
 */
const getUserStats = async (req, res) => {
    try {
        const allEngagements = await Engagement.find({ userId: req.user.id });

        const totalSpeakingTime = allEngagements.reduce((sum, e) => sum + e.speakingTime, 0);
        const avgEngagement =
            allEngagements.length > 0
                ? Math.round(allEngagements.reduce((sum, e) => sum + e.engagementScore, 0) / allEngagements.length)
                : 0;

        res.status(200).json({
            success: true,
            stats: {
                totalMeetings: req.user.meetingsHosted.length + req.user.meetingsJoined.length,
                meetingsHosted: req.user.meetingsHosted.length,
                meetingsJoined: req.user.meetingsJoined.length,
                totalSpeakingTime,
                averageEngagementScore: avgEngagement,
            },
        });
    } catch (error) {
        console.error('GetUserStats error:', error);
        res.status(500).json({ success: false, message: 'Failed to get user stats.' });
    }
};

module.exports = { updateEngagement, getEngagement, getLeaderboard, getUserStats };
