/**
 * Meeting Model – Upgraded
 * Adds: password protection, invite links, expiry, waiting room, lock
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MeetingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    title: {
      type: String,
      default: 'SmartMeet Session',
      maxlength: 100,
    },

    host: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // ── Password Protection ───────────────────────────────────────────────
    isPasswordProtected: {
      type: Boolean,
      default: false,
    },

    meetingPassword: {
      type: String,
      select: false, // Never returned in queries by default
    },

    // ── Participants ──────────────────────────────────────────────────────
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // ── Meeting Status ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['waiting', 'active', 'ended'],
      default: 'waiting',
    },

    isLocked: {
      type: Boolean,
      default: false, // Locked = no new joins allowed
    },

    // ── Waiting Room ──────────────────────────────────────────────────────
    waitingRoomEnabled: {
      type: Boolean,
      default: false,
    },

    waitingQueue: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: String,
        requestedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Timing ────────────────────────────────────────────────────────────
    startTime: {
      type: Date,
      default: Date.now,
    },

    endTime: {
      type: Date,
    },

    duration: {
      type: Number, // seconds
      default: 0,
    },

    // Auto-expire after X hours (null = no expiry)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h default
      index: { expires: 0 }, // MongoDB TTL index — auto-delete when reached
    },

    // ── AI & Analytics ────────────────────────────────────────────────────
    transcript: {
      type: String,
      default: '',
    },

    summary: {
      type: String,
      default: '',
    },

    summaryStructured: {
      decisions: [String],
      actionItems: [String],
      keyPoints: [String],
    },

    engagementScores: {
      type: Map,
      of: Number,
      default: {},
    },

    contributionScores: {
      type: Map,
      of: Number,
      default: {},
    },

    // ── Chat ──────────────────────────────────────────────────────────────
    chatMessages: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        userName: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ── Indexes ─────────────────────────────────────────────────────────────────
MeetingSchema.index({ host: 1, status: 1 });
MeetingSchema.index({ meetingId: 1, isLocked: 1 });

// ── Instance method: Compare meeting password ────────────────────────────────
MeetingSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.meetingPassword) return true; // No password set
  return bcrypt.compare(candidatePassword, this.meetingPassword);
};

// ── Pre-save: Hash meeting password if set ───────────────────────────────────
MeetingSchema.pre('save', async function () {
  if (this.isModified('meetingPassword') && this.meetingPassword) {
    const salt = await bcrypt.genSalt(10);
    this.meetingPassword = await bcrypt.hash(this.meetingPassword, salt);
    this.isPasswordProtected = true;
  }
});

// ── Virtual: Invite link path ────────────────────────────────────────────────
MeetingSchema.virtual('invitePath').get(function () {
  return `/join/${this.meetingId}`;
});

module.exports = mongoose.model('Meeting', MeetingSchema);
