/**
 * Transcript Controller
 * Handles audio upload, Whisper transcription, and transcript retrieval
 */

const fs = require('fs');
const path = require('path');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
const { transcribeAudio } = require('../services/huggingfaceService');

/**
 * @route   POST /api/transcribe
 * @desc    Upload audio segment and transcribe using Hugging Face Whisper
 * @access  Protected
 * @body    FormData: audio (file), meetingId, userId (optional override)
 */
const uploadAndTranscribe = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No audio file provided.' });
        }

        const { meetingId, duration } = req.body;

        if (!meetingId) {
            return res.status(400).json({ success: false, message: 'meetingId is required.' });
        }

        // Verify meeting exists and is active
        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }
        if (meeting.status === 'ended') {
            return res.status(400).json({ success: false, message: 'Meeting has already ended.' });
        }

        // Verify user is a participant
        const isParticipant = meeting.participants.some(
            (p) => p.toString() === req.user.id.toString()
        );
        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'You are not a participant in this meeting.',
            });
        }

        // Read audio buffer and send to Whisper
        const audioBuffer = fs.readFileSync(req.file.path);
        console.log(
            `🎤 Transcribing ${req.file.originalname} (${(audioBuffer.length / 1024).toFixed(1)}KB) for meeting ${meetingId}`
        );

        const transcriptionResult = await transcribeAudio(audioBuffer);

        // Clean up temp file
        fs.unlinkSync(req.file.path);

        if (!transcriptionResult.text || transcriptionResult.text.trim() === '') {
            return res.status(200).json({
                success: true,
                message: 'No speech detected in audio segment.',
                transcript: null,
            });
        }

        // Save transcript segment to MongoDB
        const transcript = await Transcript.create({
            meetingId,
            speakerId: req.user.id,
            speakerName: req.user.name,
            text: transcriptionResult.text.trim(),
            timestamp: new Date(),
            duration: parseFloat(duration) || transcriptionResult.duration || 0,
            confidence: 1.0,
            language: transcriptionResult.language || 'en',
        });

        res.status(201).json({
            success: true,
            transcript: {
                id: transcript._id,
                speakerName: transcript.speakerName,
                text: transcript.text,
                timestamp: transcript.timestamp,
                duration: transcript.duration,
            },
        });
    } catch (error) {
        // Clean up temp file if it exists
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Transcription error:', error);
        res.status(500).json({ success: false, message: error.message || 'Transcription failed.' });
    }
};

/**
 * @route   POST /api/transcribe/text
 * @desc    Save a text transcript segment (from Web Speech API)
 * @access  Protected
 */
const saveTextTranscript = async (req, res) => {
    try {
        const { meetingId, text, duration, confidence, language } = req.body;

        if (!meetingId || !text) {
            return res.status(400).json({ success: false, message: 'meetingId and text are required.' });
        }

        // Verify meeting exists and user is participant
        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        const transcript = await Transcript.create({
            meetingId,
            speakerId: req.user.id,
            speakerName: req.user.name,
            text: text.trim(),
            timestamp: new Date(),
            duration: duration || 0,
            confidence: confidence || 1.0,
            language: language || 'en',
        });

        res.status(201).json({ success: true, transcript });
    } catch (error) {
        console.error('SaveTextTranscript error:', error);
        res.status(500).json({ success: false, message: 'Failed to save transcript.' });
    }
};

/**
 * @route   POST /api/generate-summary
 * @desc    Generate AI summary for a meeting from all transcripts
 * @access  Protected (host only)
 */
const generateMeetingSummary = async (req, res) => {
    try {
        const { meetingId } = req.body;

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        if (meeting.host.toString() !== req.user.id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Only the host can generate a summary.',
            });
        }

        // Build full transcript
        const transcripts = await Transcript.find({ meetingId }).sort({ timestamp: 1 });
        const fullText = transcripts.map((t) => `${t.speakerName}: ${t.text}`).join('\n');

        const { generateSummary } = require('../services/huggingfaceService');
        const result = await generateSummary(fullText);

        // Update meeting
        await Meeting.findOneAndUpdate(
            { meetingId },
            {
                summary: result.summary,
                transcript: fullText,
                structuredSummary: {
                    keyPoints: result.keyPoints,
                    actionItems: result.actionItems,
                    decisions: result.decisions,
                },
            }
        );

        res.status(200).json({
            success: true,
            summary: result.summary,
            keyPoints: result.keyPoints,
            actionItems: result.actionItems,
            decisions: result.decisions,
        });
    } catch (error) {
        console.error('GenerateSummary error:', error);
        res.status(500).json({ success: false, message: error.message || 'Summary generation failed.' });
    }
};

/**
 * @route   GET /api/transcripts/:meetingId
 * @desc    Get all transcript segments for a meeting
 * @access  Protected
 */
const getTranscripts = async (req, res) => {
    try {
        const { meetingId } = req.params;

        const transcripts = await Transcript.find({ meetingId })
            .sort({ timestamp: 1 })
            .populate('speakerId', 'name email');

        res.status(200).json({ success: true, count: transcripts.length, transcripts });
    } catch (error) {
        console.error('GetTranscripts error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve transcripts.' });
    }
};

module.exports = { uploadAndTranscribe, saveTextTranscript, generateMeetingSummary, getTranscripts };
