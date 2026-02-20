/**
 * meetingUtils.js – Shared utilities for meetings
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a short, readable meeting ID like "ABC-1X2"
 * Format: 3 uppercase letters - 3 alphanumeric chars
 */
const generateMeetingId = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing O,0,I,1
    let id = '';
    for (let i = 0; i < 7; i++) {
        if (i === 3) { id += '-'; continue; }
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id; // e.g., "GBK-7M2"
};

/**
 * Generate a random meeting password (8 chars)
 */
const generateMeetingPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

/**
 * Validate meeting ID format (ABC-XYZ or ABCXYZ)
 */
const isValidMeetingId = (id) => {
    if (!id || typeof id !== 'string') return false;
    const clean = id.replace('-', '').toUpperCase();
    return /^[A-Z0-9]{6,7}$/.test(clean);
};

module.exports = { generateMeetingId, generateMeetingPassword, isValidMeetingId };
