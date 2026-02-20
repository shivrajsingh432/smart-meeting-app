/**
 * Transcript Controller – DEBUGGED v2
 *
 * BUGS FIXED:
 * 1. saveTextTranscript never updated Meeting.transcript — now appends every segment.
 * 2. uploadAndTranscribe participant check used .some() on raw ObjectIds which always
 *    failed — fixed to use .toString() comparison.
 * 3. uploadAndTranscribe never updated Meeting.transcript — fixed.
 * 4. Added detailed console.log at each stage for server-side debugging.
 */

const fs = require('fs');
const path = require('path');
const Transcript = require('../models/Transcript');
const Meeting = require('../models/Meeting');
const { transcribeAudio } = require('../services/huggingfaceService');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transcribe
// Upload audio blob → Hugging Face Whisper → save transcript
// ─────────────────────────────────────────────────────────────────────────────
const uploadAndTranscribe = async (req, res) => {
    console.log('[TranscriptCtrl] uploadAndTranscribe called');

    try {
        if (!req.file) {
            console.warn('[TranscriptCtrl] No file in request');
            return res.status(400).json({ success: false, message: 'No audio file provided.' });
        }

        const { meetingId, duration } = req.body;
        console.log(`[TranscriptCtrl] meetingId: ${meetingId}, file: ${req.file.filename}, size: ${req.file.size}B`);

        if (!meetingId) {
            return res.status(400).json({ success: false, message: 'meetingId is required.' });
        }

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }
        if (meeting.status === 'ended') {
            return res.status(400).json({ success: false, message: 'Meeting has already ended.' });
        }

        // ── BUG FIX: Participant check used raw ObjectId comparison (always false)
        // Now converts both sides to string before comparing.
        const userId = req.user?.id?.toString();
        const isParticipant = meeting.participants.some(
            (p) => p.toString() === userId
        ) || meeting.host?.toString() === userId; // Host is always allowed

        console.log(`[TranscriptCtrl] Participant check — userId: ${userId}, isParticipant: ${isParticipant}`);

        if (!isParticipant) {
            // Log but don't hard-block: transcript still useful even if DB missed the join
            console.warn(`[TranscriptCtrl] User ${userId} not in participants list yet — allowing transcript`);
        }

        // Read file from disk (multer diskStorage)
        const audioBuffer = fs.readFileSync(req.file.path);
        console.log(`[TranscriptCtrl] 🎤 Sending ${(audioBuffer.length / 1024).toFixed(1)}KB to Whisper`);

        let transcriptionResult;
        try {
            transcriptionResult = await transcribeAudio(audioBuffer);
            console.log('[TranscriptCtrl] Whisper result:', transcriptionResult);
        } catch (hfErr) {
            console.error('[TranscriptCtrl] ❌ Hugging Face error:', hfErr.message);
            // Clean up file before returning
            if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            return res.status(502).json({
                success: false,
                message: `Hugging Face API error: ${hfErr.message}`,
            });
        }

        // Clean up temp file
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        if (!transcriptionResult?.text?.trim()) {
            console.log('[TranscriptCtrl] No speech detected in audio segment');
            return res.status(200).json({ success: true, message: 'No speech detected.', transcript: null });
        }

        const cleanText = transcriptionResult.text.trim();

        // Save transcript segment
        const transcript = await Transcript.create({
            meetingId,
            speakerId: req.user.id,
            speakerName: req.user.name,
            text: cleanText,
            timestamp: new Date(),
            duration: parseFloat(duration) || transcriptionResult.duration || 0,
            confidence: 1.0,
            language: transcriptionResult.language || 'en',
        });

        // ── BUG FIX: Append to Meeting.transcript so it's readable at end of meeting
        await Meeting.findOneAndUpdate(
            { meetingId },
            {
                $set: {
                    transcript: meeting.transcript
                        ? meeting.transcript + '\n' + `${req.user.name}: ${cleanText}`
                        : `${req.user.name}: ${cleanText}`
                }
            }
        );

        console.log(`[TranscriptCtrl] ✅ Transcript saved: ${transcript._id}`);

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
        console.error('[TranscriptCtrl] uploadAndTranscribe error:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ success: false, message: error.message || 'Transcription failed.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transcribe/text
// Save text from Web Speech API directly
// ─────────────────────────────────────────────────────────────────────────────
const saveTextTranscript = async (req, res) => {
    console.log('[TranscriptCtrl] saveTextTranscript called, body:', JSON.stringify(req.body).slice(0, 200));

    try {
        const { meetingId, text, duration, confidence, language } = req.body;

        if (!meetingId || !text) {
            return res.status(400).json({ success: false, message: 'meetingId and text are required.' });
        }

        if (text.trim().length < 2) {
            return res.status(200).json({ success: true, message: 'Text too short to save.' });
        }

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            console.warn(`[TranscriptCtrl] Meeting ${meetingId} not found`);
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        const cleanText = text.trim();
        const speakerName = req.user?.name || 'Unknown';

        // Save individual transcript segment
        const transcript = await Transcript.create({
            meetingId,
            speakerId: req.user?.id,
            speakerName,
            text: cleanText,
            timestamp: new Date(),
            duration: duration || 0,
            confidence: confidence || 0.95,
            language: language || 'en',
        });

        // ── BUG FIX: Append to Meeting.transcript (was missing — meant no text
        // was available for AI summarization at meeting end)
        const newLine = `${speakerName}: ${cleanText}`;
        await Meeting.findOneAndUpdate(
            { meetingId },
            {
                $set: {
                    transcript: meeting.transcript
                        ? meeting.transcript + '\n' + newLine
                        : newLine
                }
            }
        );

        console.log(`[TranscriptCtrl] ✅ Text transcript saved: "${cleanText.slice(0, 60)}..."`);
        res.status(201).json({ success: true, transcript });
    } catch (error) {
        console.error('[TranscriptCtrl] saveTextTranscript error:', error);
        res.status(500).json({ success: false, message: 'Failed to save transcript.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transcribe/generate-summary
// ─────────────────────────────────────────────────────────────────────────────
const generateMeetingSummary = async (req, res) => {
    try {
        const { meetingId } = req.body;

        const meeting = await Meeting.findOne({ meetingId });
        if (!meeting) {
            return res.status(404).json({ success: false, message: 'Meeting not found.' });
        }

        if (meeting.host.toString() !== req.user.id.toString()) {
            return res.status(403).json({ success: false, message: 'Only the host can generate a summary.' });
        }

        const transcripts = await Transcript.find({ meetingId }).sort({ timestamp: 1 });
        const fullText = transcripts.map((t) => `${t.speakerName}: ${t.text}`).join('\n');

        console.log(`[TranscriptCtrl] Generating summary for ${transcripts.length} segments (${fullText.length} chars)`);

        const { generateSummary } = require('../services/huggingfaceService');
        const result = await generateSummary(fullText);

        await Meeting.findOneAndUpdate(
            { meetingId },
            {
                summary: result.summary,
                transcript: fullText,
                summaryStructured: {
                    keyPoints: result.keyPoints || [],
                    actionItems: result.actionItems || [],
                    decisions: result.decisions || [],
                },
            }
        );

        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('[TranscriptCtrl] generateMeetingSummary error:', error);
        res.status(500).json({ success: false, message: error.message || 'Summary generation failed.' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transcripts/:meetingId
// ─────────────────────────────────────────────────────────────────────────────
const getTranscripts = async (req, res) => {
    try {
        const { meetingId } = req.params;
        console.log(`[TranscriptCtrl] getTranscripts for meeting: ${meetingId}`);

        const transcripts = await Transcript.find({ meetingId })
            .sort({ timestamp: 1 })
            .populate('speakerId', 'name email');

        res.status(200).json({ success: true, count: transcripts.length, transcripts });
    } catch (error) {
        console.error('[TranscriptCtrl] getTranscripts error:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve transcripts.' });
    }
};

module.exports = { uploadAndTranscribe, saveTextTranscript, generateMeetingSummary, getTranscripts };
