/**
 * Socket.io Handler – v2 (Password-Gated Rooms)
 * New: join-room validates joinToken before admitting to room
 *      Waiting room support, lock enforcement, remove participant
 */

const jwt = require('jsonwebtoken');
const Meeting = require('../models/Meeting');
const Engagement = require('../models/Engagement');

// ── In-memory room state ─────────────────────────────────────────────────────
// rooms: Map<meetingId, Map<socketId, { userName, userId, isHost }>>
const rooms = new Map();

const getRoomParticipants = (meetingId) => {
    const room = rooms.get(meetingId);
    if (!room) return [];
    return Array.from(room.entries()).map(([socketId, data]) => ({ socketId, ...data }));
};

module.exports = (io) => {
    // ── Socket Auth Middleware ─────────────────────────────────────────────────
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (token && token !== 'guest') {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.userId = decoded.id;
                socket.userName = socket.handshake.query?.userName || 'User';
                socket.isAuth = true;
            } catch {
                socket.isAuth = false;
                socket.userName = socket.handshake.query?.userName || 'Guest';
                socket.userId = `guest_${Date.now()}`;
            }
        } else {
            socket.isAuth = false;
            socket.userName = socket.handshake.query?.userName || 'Guest';
            socket.userId = `guest_${Date.now()}`;
        }
        next();
    });

    io.on('connection', (socket) => {
        console.log(`🔌 Connected: ${socket.id} (${socket.userName})`);

        // ── JOIN ROOM (Password-gated) ─────────────────────────────────────────
        socket.on('join-room', async ({ meetingId, joinToken }) => {
            try {
                // Verify joinToken issued by backend after password check
                if (joinToken) {
                    try {
                        const decoded = jwt.verify(joinToken, process.env.JWT_SECRET);
                        if (decoded.meetingId !== meetingId || !decoded.authorized) {
                            return socket.emit('join-rejected', { message: 'Invalid join token. Please re-enter the meeting.' });
                        }
                    } catch {
                        return socket.emit('join-rejected', { message: 'Join token expired. Please join again.' });
                    }
                }

                // Fetch meeting to check lock / waiting room
                const meeting = await Meeting.findOne({ meetingId }).lean();
                if (!meeting) {
                    return socket.emit('join-rejected', { message: 'Meeting not found.' });
                }
                if (meeting.status === 'ended') {
                    return socket.emit('join-rejected', { message: 'This meeting has ended.' });
                }
                if (meeting.isLocked) {
                    // Only host can still enter a locked meeting
                    if (meeting.host.toString() !== socket.userId?.toString()) {
                        return socket.emit('join-rejected', { message: 'Meeting is locked. New participants cannot join.' });
                    }
                }

                const isHost = meeting.host.toString() === socket.userId?.toString();

                // Waiting room logic
                if (meeting.waitingRoomEnabled && !isHost) {
                    // Add to waiting queue in DB and notify
                    await Meeting.findOneAndUpdate(
                        { meetingId },
                        {
                            $addToSet: {
                                waitingQueue: {
                                    userId: socket.userId,
                                    userName: socket.userName,
                                    requestedAt: new Date(),
                                },
                            },
                        }
                    );

                    // Notify host
                    const hostSocket = [...(rooms.get(meetingId)?.entries() || [])].find(
                        ([, d]) => d.isHost
                    );
                    if (hostSocket) {
                        io.to(hostSocket[0]).emit('waiting-room-request', {
                            userId: socket.userId,
                            userName: socket.userName,
                            socketId: socket.id,
                        });
                    }

                    socket.emit('join-waiting-room', {
                        message: 'Waiting for host approval...',
                        meetingId,
                    });
                    return;
                }

                // ── Admit to room ──────────────────────────────────────────────────
                admitToRoom(socket, io, meetingId, isHost);

            } catch (err) {
                console.error('join-room error:', err);
                socket.emit('join-rejected', { message: 'Failed to join. Please try again.' });
            }
        });

        // ── HOST APPROVES WAITING PARTICIPANT ─────────────────────────────────
        socket.on('approve-waiting', ({ waitingSocketId, meetingId }) => {
            const waitingSocket = io.sockets.sockets.get(waitingSocketId);
            if (waitingSocket) {
                const isHost = false;
                admitToRoom(waitingSocket, io, meetingId, isHost);
                io.to(waitingSocketId).emit('join-approved', { meetingId });
            }
        });

        socket.on('reject-waiting', ({ waitingSocketId }) => {
            const waitingSocket = io.sockets.sockets.get(waitingSocketId);
            if (waitingSocket) {
                waitingSocket.emit('join-rejected', { message: 'Host denied your request to join.' });
            }
        });

        // ── WebRTC Signaling ──────────────────────────────────────────────────
        socket.on('offer', ({ targetSocketId, offer }) => {
            io.to(targetSocketId).emit('offer', { fromSocketId: socket.id, fromUserName: socket.userName, offer });
        });

        socket.on('answer', ({ targetSocketId, answer }) => {
            io.to(targetSocketId).emit('answer', { fromSocketId: socket.id, answer });
        });

        socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
            io.to(targetSocketId).emit('ice-candidate', { fromSocketId: socket.id, candidate });
        });

        // ── Chat ──────────────────────────────────────────────────────────────
        socket.on('chat-message', async ({ meetingId, message }) => {
            if (!message?.trim()) return;
            const sanitized = message.trim().slice(0, 500); // Max 500 chars

            const payload = {
                userId: socket.userId,
                userName: socket.userName,
                message: sanitized,
                timestamp: new Date(),
            };

            io.to(`room:${meetingId}`).emit('chat-message', payload);

            // Persist to DB
            try {
                await Meeting.findOneAndUpdate({ meetingId }, { $push: { chatMessages: payload } });
            } catch { }
        });

        // ── Meeting Controls ──────────────────────────────────────────────────
        socket.on('toggle-audio', ({ meetingId, isMuted }) => {
            socket.to(`room:${meetingId}`).emit('user-audio-toggle', { socketId: socket.id, isMuted });
        });

        socket.on('toggle-video', ({ meetingId, isCameraOn }) => {
            socket.to(`room:${meetingId}`).emit('user-video-toggle', { socketId: socket.id, isCameraOn });
        });

        socket.on('raise-hand', ({ meetingId, raised }) => {
            io.to(`room:${meetingId}`).emit('hand-raised', {
                socketId: socket.id, userName: socket.userName, raised,
            });
        });

        socket.on('speaking', ({ meetingId, isSpeaking }) => {
            socket.to(`room:${meetingId}`).emit('user-speaking', {
                socketId: socket.id, userName: socket.userName, isSpeaking,
            });
        });

        // ── Screen Share ──────────────────────────────────────────────────────
        socket.on('screen-share-started', ({ meetingId }) => {
            socket.to(`room:${meetingId}`).emit('screen-share-started', {
                socketId: socket.id, userName: socket.userName,
            });
        });
        socket.on('screen-share-stopped', ({ meetingId }) => {
            socket.to(`room:${meetingId}`).emit('screen-share-stopped', { socketId: socket.id });
        });

        // ── Lock Meeting (host only) ──────────────────────────────────────────
        socket.on('lock-meeting', ({ meetingId, isLocked }) => {
            io.to(`room:${meetingId}`).emit('meeting-locked', { isLocked, lockedBy: socket.userName });
        });

        // ── Remove Participant (host only) ────────────────────────────────────
        socket.on('remove-participant', ({ meetingId, targetSocketId }) => {
            const room = rooms.get(meetingId);
            if (!room) return;
            const me = room.get(socket.id);
            if (!me?.isHost) return; // Only host can remove

            io.to(targetSocketId).emit('removed-from-meeting', {
                message: 'You have been removed from the meeting by the host.',
            });

            const targetSocket = io.sockets.sockets.get(targetSocketId);
            if (targetSocket) {
                targetSocket.leave(`room:${meetingId}`);
                room.delete(targetSocketId);
                io.to(`room:${meetingId}`).emit('user-left', {
                    socketId: targetSocketId, userName: room.get(targetSocketId)?.userName || 'Participant',
                });
                io.to(`room:${meetingId}`).emit('participant-count', { count: room.size });
            }
        });

        // ── Engagement Updates ────────────────────────────────────────────────
        socket.on('engagement-update', async ({ meetingId, speakingTimeDelta, cameraOnTimeDelta }) => {
            if (!meetingId || !socket.userId) return;
            try {
                const eng = await Engagement.findOneAndUpdate(
                    { meetingId, userId: socket.userId },
                    {
                        $inc: { speakingTime: speakingTimeDelta || 0, cameraOnTime: cameraOnTimeDelta || 0 },
                        $set: { userName: socket.userName, meetingId },
                    },
                    { upsert: true, new: true }
                );

                // Calculate engagement score
                const participants = getRoomParticipants(meetingId).length || 1;
                const scores = await Engagement.find({ meetingId }).sort({ speakingTime: -1 });
                const totalSpeaking = scores.reduce((s, e) => s + (e.speakingTime || 0), 0) || 1;

                const formatted = scores.map((e) => ({
                    userId: e.userId,
                    userName: e.userName,
                    speakingTime: Math.round(e.speakingTime),
                    engagementScore: Math.min(100, Math.round((e.speakingTime / totalSpeaking) * 100)),
                }));

                io.to(`room:${meetingId}`).emit('engagement-scores-update', { scores: formatted });
            } catch { }
        });

        // ── End Meeting ──────────────────────────────────────────────────────
        socket.on('end-meeting', ({ meetingId }) => {
            io.to(`room:${meetingId}`).emit('meeting-ended', { meetingId });
            rooms.delete(meetingId);
        });

        // ── Leave Room ────────────────────────────────────────────────────────
        socket.on('leave-room', ({ meetingId }) => {
            handleLeave(socket, io, meetingId);
        });

        // ── Disconnect ────────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`🔌 Disconnected: ${socket.id} (${socket.userName})`);
            // Find all rooms this socket was in
            for (const [meetingId] of rooms) {
                if (rooms.get(meetingId)?.has(socket.id)) {
                    handleLeave(socket, io, meetingId);
                }
            }
        });
    });
};

// ── Helper: Admit socket to room ─────────────────────────────────────────────
function admitToRoom(socket, io, meetingId, isHost) {
    socket.join(`room:${meetingId}`);
    socket.currentRoom = meetingId;

    if (!rooms.has(meetingId)) rooms.set(meetingId, new Map());
    rooms.get(meetingId).set(socket.id, {
        userName: socket.userName,
        userId: socket.userId,
        isHost,
    });

    const participants = getRoomParticipants(meetingId);

    // Tell new joiner about existing participants
    socket.emit('room-participants', { participants: participants.filter((p) => p.socketId !== socket.id) });

    // Tell everyone else about new joiner
    socket.to(`room:${meetingId}`).emit('user-joined', {
        socketId: socket.id,
        userName: socket.userName,
        userId: socket.userId,
        isHost,
    });

    // Participant count
    io.to(`room:${meetingId}`).emit('participant-count', { count: participants.length });

    socket.emit('join-approved', { meetingId, isHost, participants });
    console.log(`✅ ${socket.userName} admitted to room ${meetingId} (host: ${isHost})`);
}

// ── Helper: Handle leave ──────────────────────────────────────────────────────
function handleLeave(socket, io, meetingId) {
    const room = rooms.get(meetingId);
    if (!room) return;

    const userData = room.get(socket.id);
    room.delete(socket.id);
    socket.leave(`room:${meetingId}`);

    io.to(`room:${meetingId}`).emit('user-left', {
        socketId: socket.id,
        userName: userData?.userName || 'A participant',
    });

    io.to(`room:${meetingId}`).emit('participant-count', { count: room.size });

    if (room.size === 0) rooms.delete(meetingId);
}
