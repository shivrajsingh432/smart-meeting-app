/**
 * Auth Controller
 * Handles user registration and login with JWT
 */

const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email, and password.',
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters.',
            });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'An account with this email already exists.',
            });
        }

        // Create new user (password hashed automatically by pre-save hook)
        const user = await User.create({ name, email, password });

        // Generate JWT
        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            message: 'Account created successfully!',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                meetingsHosted: user.meetingsHosted.length,
                meetingsJoined: user.meetingsJoined.length,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
};

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT
 * @access  Public
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password.',
            });
        }

        // Find user with password (excluded by default in schema)
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        // Generate JWT
        const token = generateToken(user._id);

        res.status(200).json({
            success: true,
            message: 'Login successful!',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                meetingsHosted: user.meetingsHosted.length,
                meetingsJoined: user.meetingsJoined.length,
                totalSpeakingTime: user.totalSpeakingTime,
                averageEngagementScore: user.averageEngagementScore,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
};

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user profile
 * @access  Protected
 */
const getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .populate('meetingsHosted', 'meetingId startTime endTime duration status')
            .populate('meetingsJoined', 'meetingId startTime endTime duration status');

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error('GetMe error:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile (name)
 * @access  Protected
 */
const updateProfile = async (req, res) => {
    try {
        const { name } = req.body;
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { name },
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('UpdateProfile error:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { register, login, getMe, updateProfile };
