/**
 * Transcript Model
 * Stores individual speech transcript segments per participant
 */

const mongoose = require('mongoose');

const TranscriptSchema = new mongoose.Schema(
    {
        // Reference to the meeting
        meetingId: {
            type: String,
            required: true,
            index: true,
        },
        // Reference to the speaker
        speakerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        speakerName: {
            type: String,
            required: true,
        },
        // The transcribed text segment
        text: {
            type: String,
            required: true,
        },
        // When this segment was spoken (ms since meeting start)
        timestamp: {
            type: Date,
            default: Date.now,
        },
        // Duration of this speech segment in seconds
        duration: {
            type: Number,
            default: 0,
            min: 0,
        },
        // Confidence score from AI model (0-1)
        confidence: {
            type: Number,
            default: 1.0,
            min: 0,
            max: 1,
        },
        // Language detected
        language: {
            type: String,
            default: 'en',
        },
    },
    {
        timestamps: true,
    }
);

// ── Compound index for fast meeting transcript retrieval ──────────────────
TranscriptSchema.index({ meetingId: 1, timestamp: 1 });
TranscriptSchema.index({ meetingId: 1, speakerId: 1 });

module.exports = mongoose.model('Transcript', TranscriptSchema);
