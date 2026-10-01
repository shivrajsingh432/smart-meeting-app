/**
 * 🚀 Meetrix – Main Server Entry Point (Production Ready)
 * Added: helmet, production CORS, dynamic base URL, global error logger
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// ── Connect to MongoDB ────────────────────────────────────────────────────────
const connectDB = require('./config/db');
connectDB();

// ── Import Routes ─────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const meetingRoutes = require('./routes/meetings');
const transcriptRoutes = require('./routes/transcripts');
const engagementRoutes = require('./routes/engagement');

// ── Import Socket Handler ─────────────────────────────────────────────────────
const socketHandler = require('./socket/index');

// ── App Setup ─────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// ── Allowed Origins ───────────────────────────────────────────────────────────
const allowedLocal = ['http://localhost:5000', 'http://localhost:3000'];

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);

        // Allow localhost development and all Render subdomains
        const isAllowedLocal = allowedLocal.includes(origin);
        const isRenderDeployment = origin.endsWith('.onrender.com');

        if (isAllowedLocal || isRenderDeployment) {
            callback(null, true);
        } else {
            // Log for debugging but block the request
            console.warn(`[CORS] Request from blocked origin: ${origin}`);
            callback(null, false); // Reject by passing false
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Socket.io ─────────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
});

// ── Security Middleware ───────────────────────────────────────────────────────
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.socket.io', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
                fontSrc: ["'self'", 'fonts.gstatic.com'],
                connectSrc: ["'self'", 'wss:', 'ws:', '*.huggingface.co', 'api-inference.huggingface.co'],
                mediaSrc: ["'self'", 'blob:'],
                imgSrc: ["'self'", 'data:', 'blob:'],
                workerSrc: ["'self'", 'blob:'],
                frameSrc: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false, // Required for WebRTC
    })
);

app.use(cors(corsOptions)); // Handles all routes including OPTIONS preflight

// ── Body Parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Global Rate Limiting ──────────────────────────────────────────────────────
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
    skip: (req) => req.path.startsWith('/socket.io'), // Don't rate-limit WebSocket
});
app.use('/api', globalLimiter);

// Auth-specific stricter limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many auth attempts.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ── Serve Static Files ────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public'), {
    etag: true,
    lastModified: true,
    maxAge: isProd ? '1d' : 0,
}));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/transcribe', transcriptRoutes);
app.use('/api/transcripts', transcriptRoutes);
app.use('/api/engagement', engagementRoutes);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
    });
});

// ── SPA Catch-all ─────────────────────────────────────────────────────────────
// Serve join.html for /join/:meetingId routes
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.path.startsWith('/join/')) {
        return res.sendFile(path.join(__dirname, '..', 'public', 'join.html'));
    }
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = isProd && status === 500 ? 'Internal server error' : err.message;

    console.error(`[${new Date().toISOString()}] ❌ ${req.method} ${req.path} → ${status}: ${err.message}`);
    if (!isProd) console.error(err.stack);

    res.status(status).json({ success: false, message });
});

// ── Socket.io Handler ─────────────────────────────────────────────────────────
socketHandler(io);

// ── Start Server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  🚀 Meetrix – Server Started  v2               ║');
    console.log(`║  📡 URL: ${baseUrl.padEnd(35)}║`);
    console.log(`║  🌱 Environment: ${(process.env.NODE_ENV || 'development').padEnd(27)}║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
});

process.on('unhandledRejection', (reason) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
});

process.on('uncaughtException', (err) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
    process.exit(1);
});

module.exports = { app, server, io };
