/**
 * Engagement Model
 * Tracks real-time engagement metrics per participant per meeting
 */

const mongoose = require('mongoose');

const EngagementSchema = new mongoose.Schema(
    {
        meetingId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        userName: {
            type: String,
            required: true,
        },
        // Total time the user was speaking (seconds)
        speakingTime: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Total time camera was ON (seconds)
        cameraOnTime: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Number of chat messages sent
        chatMessages: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Number of times raised hand
        handRaisedCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Computed engagement score (0-100)
        // Formula: (speakingTime*0.5 + cameraOnTime*0.3 + chatMessages*10*0.2) / meetingDuration * 100
        engagementScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        // Contribution percentage (speaking time / total speaking time in meeting)
        contributionPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        // Rank among participants (1 = most active)
        rank: {
            type: Number,
            default: 0,
        },
        // Number of times they were "active speaker"
        activeSpeakerCount: {
            type: Number,
            default: 0,
        },
        // Snapshot history for real-time chart (updated every 30s)
        history: [
            {
                timestamp: { type: Date, default: Date.now },
                engagementScore: Number,
                speakingTime: Number,
            },
        ],
    },
    {
        timestamps: true,
    }
);

// ── Compound index ───────────────────────────────────────────────────────
EngagementSchema.index({ meetingId: 1, userId: 1 }, { unique: true });
EngagementSchema.index({ meetingId: 1, engagementScore: -1 });

module.exports = mongoose.model('Engagement', EngagementSchema);
