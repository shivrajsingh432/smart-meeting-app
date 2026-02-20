/**
 * File Upload Middleware (Multer)
 * Handles audio file uploads for transcription
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Storage configuration ─────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Format: audio_<userId>_<timestamp>.<ext>
        const timestamp = Date.now();
        const userId = req.user?.id || 'unknown';
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `audio_${userId}_${timestamp}${ext}`);
    },
});

// ── File filter: Only allow audio files ──────────────────────────────────
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'audio/wav',
        'audio/webm',
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/flac',
        'video/webm', // Some browsers record as video/webm even for audio
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only audio files are allowed.`), false);
    }
};

// ── Max file size (from env, default 50MB) ───────────────────────────────
const maxFileSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 50) * 1024 * 1024;

// ── Multer instance ───────────────────────────────────────────────────────
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxFileSize,
        files: 1, // Only one file per request
    },
});

// ── Error handler for upload errors ─────────────────────────────────────
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: `File too large. Max size is ${process.env.MAX_FILE_SIZE_MB || 50}MB`,
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next();
};

module.exports = { upload, handleUploadError };
