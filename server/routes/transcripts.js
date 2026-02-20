/**
 * Transcript Routes
 */
const express = require('express');
const router = express.Router();
const {
    uploadAndTranscribe,
    saveTextTranscript,
    generateMeetingSummary,
    getTranscripts,
} = require('../controllers/transcriptController');
const { protect } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');

// POST /api/transcribe  (Protected) - Upload audio file and transcribe
router.post('/', protect, upload.single('audio'), handleUploadError, uploadAndTranscribe);

// POST /api/transcribe/text  (Protected) - Save Web Speech API text
router.post('/text', protect, saveTextTranscript);

// POST /api/generate-summary  (Protected - host only)
router.post('/generate-summary', protect, generateMeetingSummary);

// GET /api/transcripts/:meetingId  (Protected)
router.get('/:meetingId', protect, getTranscripts);

module.exports = router;
