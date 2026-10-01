/**
 * Meeting Model – Upgraded
 * Adds: password protection, invite links, expiry, waiting room, lock
 */

const mongoose = require('mongoose');

const MeetingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  meetingPassword: {
    type: String,
    required: false, // Optional password
  },

  title: {
    type: String,
    default: 'Meetrix Session',
    maxlength: 100,
  },

  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  transcript: {
    type: String,
    default: '',
  },

  summary: {
    type: String,
    default: '',
  },

  summaryStructured: {
    keyPoints: [String],
    actionItems: [String],
    decisions: [String],
  },

  engagementScores: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    score: { type: Number, default: 0 },
    talkingTime: { type: Number, default: 0 },
  }],

  isLocked: {
    type: Boolean,
    default: false,
  },

  waitingRoom: {
    type: Boolean,
    default: false,
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  expiresAt: {
    type: Date,
    required: true,
  },
});

// TTL Index for automatic cleanup (Mongoose v9 style)
MeetingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Meeting', MeetingSchema);
