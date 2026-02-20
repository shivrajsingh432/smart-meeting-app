/**
 * auth.js middleware – Updated
 * Adds: optionalAuth (allows guests without token)
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Protect: Requires valid JWT ───────────────────────────────────────────────
const protect = async (req, res, next) => {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');

        if (!req.user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }

        next();
    } catch (err) {
        const message =
            err.name === 'TokenExpiredError'
                ? 'Session expired. Please log in again.'
                : 'Invalid token. Please log in.';
        return res.status(401).json({ success: false, message });
    }
};

// ── Optional Auth: Attaches user if token present, continues either way ───────
const optionalAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
        } catch {
            req.user = null; // Token invalid — treat as guest
        }
    }
    next(); // Always continue
};

// ── Generate JWT ─────────────────────────────────────────────────────────────
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });
};

module.exports = { protect, optionalAuth, generateToken };
