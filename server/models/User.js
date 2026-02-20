/**
 * User Model
 * Stores user account information, meeting history, and analytics
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
            maxlength: [100, 'Name cannot exceed 100 characters'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [6, 'Password must be at least 6 characters'],
            select: false, // Don't return password in queries by default
        },
        avatar: {
            type: String,
            default: '',
        },
        // Meetings this user has hosted
        meetingsHosted: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Meeting',
            },
        ],
        // Meetings this user has joined as participant
        meetingsJoined: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Meeting',
            },
        ],
        // Cumulative speaking time across all meetings (in seconds)
        totalSpeakingTime: {
            type: Number,
            default: 0,
        },
        // Average engagement score across all meetings (0-100)
        averageEngagementScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// ── Pre-save hook: Hash password before saving ──────────────────────────────
// NOTE: In Mongoose v9, async pre-save hooks should NOT call next().
//       The returned Promise resolves the middleware chain automatically.
UserSchema.pre('save', async function () {
    // Only hash if password was modified
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
});

// ── Instance method: Compare password ──────────────────────────────────────
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// ── Virtual: Total meetings attended ───────────────────────────────────────
UserSchema.virtual('totalMeetings').get(function () {
    return this.meetingsHosted.length + this.meetingsJoined.length;
});

// Note: email index is auto-created by unique:true in the schema field definition

module.exports = mongoose.model('User', UserSchema);
