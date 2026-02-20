/**
 * meeting.js – Main meeting room logic
 * Handles: WebRTC peer connections, Socket.io signaling, UI controls,
 *          screen sharing, meeting timer, and control bar actions
 */

// ── Parse URL params ─────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const MEETING_ID = urlParams.get('id');
const user = window.SM.getUser();
const token = window.SM.getToken();
const isHost = localStorage.getItem('sm_isHost') === 'true';
const MY_NAME = user?.name || localStorage.getItem('sm_userName') || 'Guest';
const MY_ID = user?.id || `guest_${Date.now()}`;

// ── State ────────────────────────────────────────────────────────────────
let localStream = null;
let screenStream = null;
let peers = {};        // socketId -> RTCPeerConnection
let isMuted = false;
let isCameraOn = true;
let isHandRaised = false;
let isTranscribing = false;
let meetingStartTime = Date.now();
let timerInterval = null;
let socket = null;

// ── DOM Elements ─────────────────────────────────────────────────────────
const videoGrid = document.getElementById('videoGrid');
const participantCount = document.getElementById('participantCount');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const participantsList = document.getElementById('participantsList');
const liveTranscript = document.getElementById('liveTranscript');
const engagementList = document.getElementById('engagementList');
const meetingIdDisplay = document.getElementById('meetingIdDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const activeSpeakerBanner = document.getElementById('activeSpeakerBanner');
const activeSpeakerName = document.getElementById('activeSpeakerName');
const leaveModal = document.getElementById('leaveModal');

// ── ICE Servers (STUN) ───────────────────────────────────────────────────
const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
    ],
};

// ════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ════════════════════════════════════════════════════════════════════════════

const init = async () => {
    if (!MEETING_ID) {
        window.SM.showToast('No meeting ID found. Redirecting...', 'error');
        return setTimeout(() => { window.location.href = '/'; }, 2000);
    }

    // Set meeting ID display
    if (meetingIdDisplay) meetingIdDisplay.textContent = MEETING_ID;

    // Show end meeting button if host
    if (isHost) {
        document.getElementById('endMeetingBtn')?.classList.remove('hidden');
    }

    // Start timer
    startTimer();

    // Get local media
    await setupLocalMedia();

    // Connect socket & join room
    connectSocket();
};

// ════════════════════════════════════════════════════════════════════════════
// MEDIA SETUP
// ════════════════════════════════════════════════════════════════════════════

const setupLocalMedia = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });

        addVideoTile(null, localStream, MY_NAME, true);
        window.SM.showToast('Camera and microphone ready ✅', 'success', 3000);
    } catch (err) {
        console.error('Media error:', err);
        // Only audio fallback
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            window.SM.showToast('Camera unavailable. Audio only mode.', 'warning');
        } catch {
            localStream = null;
            window.SM.showToast('Could not access camera/mic. Joining in view-only mode.', 'warning');
        }
        addVideoTile(null, null, MY_NAME, true);
    }
};

// ════════════════════════════════════════════════════════════════════════════
// VIDEO TILE MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

const addVideoTile = (socketId, stream, name, isLocal = false) => {
    const tileId = isLocal ? 'local-tile' : `tile-${socketId}`;

    // Don't add duplicate
    if (document.getElementById(tileId)) return;

    const tile = document.createElement('div');
    tile.className = `video-tile${isLocal ? ' local-tile' : ''}`;
    tile.id = tileId;

    const initials = name?.charAt(0)?.toUpperCase() || '?';

    tile.innerHTML = `
    <video id="video-${socketId || 'local'}" autoplay playsinline ${isLocal ? 'muted class="local-video"' : ''}></video>
    <div class="video-tile-avatar" id="avatar-${tileId}">
      <div class="avatar-circle">${initials}</div>
      <div class="avatar-name">${name}</div>
    </div>
    <div class="tile-engagement hidden" id="eng-${tileId}">0%</div>
    <div class="hand-raised-banner" id="hand-${tileId}">✋ Raised</div>
    <div class="video-tile-info">
      <div class="tile-name">
        ${initials}
        <span>${name}${isLocal ? ' (You)' : ''}${isHost && isLocal ? ' 👑' : ''}</span>
      </div>
      <div class="tile-badges">
        <span class="tile-badge tile-muted-icon" id="mute-indicator-${tileId}" style="display:none;">🔇</span>
      </div>
    </div>
  `;

    videoGrid.appendChild(tile);
    updateGridLayout();

    // Attach stream
    const video = document.getElementById(`video-${socketId || 'local'}`);
    if (video && stream) {
        video.srcObject = stream;
        document.getElementById(`avatar-${tileId}`)?.classList.remove('visible');
    } else if (!stream) {
        document.getElementById(`avatar-${tileId}`)?.classList.add('visible');
    }

    updateParticipantCount();
};

const removeVideoTile = (socketId) => {
    const tile = document.getElementById(`tile-${socketId}`);
    if (tile) tile.remove();
    updateGridLayout();
    updateParticipantCount();
};

const updateGridLayout = () => {
    const tileCount = videoGrid.querySelectorAll('.video-tile').length;
    videoGrid.className = `video-grid grid-${Math.min(tileCount, 6)}`;
};

const updateParticipantCount = () => {
    const count = videoGrid.querySelectorAll('.video-tile').length;
    if (participantCount) participantCount.textContent = count;
};

// ════════════════════════════════════════════════════════════════════════════
// SOCKET.IO
// ════════════════════════════════════════════════════════════════════════════

const connectSocket = () => {
    const joinToken = localStorage.getItem('sm_joinToken') || '';
    socket = io({
        auth: { token: token || 'guest' },
        query: { userName: MY_NAME, joinToken },
    });

    socket.on('connect', () => {
        console.log('✅ Socket connected:', socket.id);
        const joinTok = localStorage.getItem('sm_joinToken') || '';
        socket.emit('join-room', { meetingId: MEETING_ID, joinToken: joinTok });
    });

    socket.on('connect_error', (err) => {
        window.SM.showToast('Connection error. Retrying...', 'warning');
        console.error('Socket error:', err);
    });

    // ── Join gate events ──────────────────────────────────────────────────
    socket.on('join-approved', ({ isHost: serverIsHost, participants }) => {
        console.log('✅ Join approved by server');
        // Start engagement + speech recognition after join approved
        if (window.EngagementTracker) window.EngagementTracker.start(MEETING_ID, socket);
        if (window.SpeechRec) window.SpeechRec.start(MEETING_ID);

        // Populate existing participants
        if (participants) {
            participants.forEach((p) => {
                if (p.socketId !== socket.id) addParticipantToList(p.socketId, p.userName);
            });
        }
    });

    socket.on('join-rejected', ({ message }) => {
        window.SM.showToast(message || 'Rejected from meeting', 'error');
        setTimeout(() => { window.location.href = '/'; }, 2500);
    });

    socket.on('join-waiting-room', ({ message }) => {
        window.SM.showToast('⏳ ' + message, 'info');
    });

    socket.on('meeting-locked', ({ isLocked, lockedBy }) => {
        window.SM.showToast(
            isLocked ? `🔒 Meeting locked by ${lockedBy}` : `🔓 Meeting unlocked`,
            isLocked ? 'warning' : 'success', 4000
        );
    });

    socket.on('removed-from-meeting', ({ message }) => {
        window.SM.showToast(message || 'You were removed from the meeting.', 'error');
        cleanup();
        setTimeout(() => { window.location.href = '/'; }, 2500);
    });

    // Waiting room: host gets approval requests
    socket.on('waiting-room-request', ({ userId, userName, socketId: waitingSid }) => {
        if (!isHost) return;
        const toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;bottom:80px;right:20px;background:rgba(30,30,60,0.95);border:1px solid #6366f1;border-radius:12px;padding:1rem 1.25rem;z-index:9999;color:#e2e8f0;min-width:280px;';
        toast.innerHTML = `
          <div style="font-weight:600;margin-bottom:0.5rem;">👋 ${userName} wants to join</div>
          <div style="display:flex;gap:0.5rem;">
            <button onclick="this.closest('div[style]').remove();socket?.emit('approve-waiting',{waitingSocketId:'${waitingSid}',meetingId:'${MEETING_ID}'})" style="flex:1;padding:0.4rem;background:#6366f1;border:none;border-radius:8px;color:#fff;cursor:pointer;">Admit</button>
            <button onclick="this.closest('div[style]').remove();socket?.emit('reject-waiting',{waitingSocketId:'${waitingSid}'})" style="flex:1;padding:0.4rem;background:rgba(239,68,68,0.3);border:1px solid rgba(239,68,68,0.5);border-radius:8px;color:#fca5a5;cursor:pointer;">Deny</button>
          </div>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 30000);
    });

    // Someone joined the room
    socket.on('user-joined', async ({ socketId, userName }) => {
        window.SM.showToast(`${userName} joined the meeting`, 'info', 3000);
        addParticipantToList(socketId, userName);
        // Create peer connection and send offer
        await createPeerAndOffer(socketId, userName);
    });

    // Get existing participants list
    socket.on('room-participants', ({ participants }) => {
        participants.forEach((p) => {
            if (p.socketId !== socket.id) {
                addParticipantToList(p.socketId, p.userName);
            }
        });
    });

    // WebRTC offer received
    socket.on('offer', async ({ fromSocketId, fromUserName, offer }) => {
        const pc = await createPeerConnection(fromSocketId, fromUserName);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { targetSocketId: fromSocketId, answer });
    });

    // WebRTC answer received
    socket.on('answer', async ({ fromSocketId, answer }) => {
        const pc = peers[fromSocketId];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
    });

    // ICE candidate
    socket.on('ice-candidate', async ({ fromSocketId, candidate }) => {
        const pc = peers[fromSocketId];
        if (pc && candidate) {
            try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { }
        }
    });

    // User left
    socket.on('user-left', ({ socketId, userName }) => {
        window.SM.showToast(`${userName} left the meeting`, 'info', 3000);
        removeVideoTile(socketId);
        removeParticipantFromList(socketId);
        if (peers[socketId]) {
            peers[socketId].close();
            delete peers[socketId];
        }
    });

    // Chat message received
    socket.on('chat-message', (msg) => addChatMessage(msg));

    // Raise hand
    socket.on('hand-raised', ({ socketId, userName, raised }) => {
        const handEl = document.getElementById(`hand-tile-${socketId}`);
        if (handEl) handEl.classList.toggle('visible', raised);
        if (raised) window.SM.showToast(`${userName} raised their hand ✋`, 'info', 3000);
    });

    // Audio/video toggles
    socket.on('user-audio-toggle', ({ socketId, isMuted }) => {
        const indicator = document.getElementById(`mute-indicator-tile-${socketId}`);
        if (indicator) indicator.style.display = isMuted ? 'inline' : 'none';
    });

    socket.on('user-video-toggle', ({ socketId, isCameraOn }) => {
        const video = document.getElementById(`video-${socketId}`);
        const avatar = document.getElementById(`avatar-tile-${socketId}`);
        if (video) video.style.display = isCameraOn ? 'block' : 'none';
        if (avatar) avatar.classList.toggle('visible', !isCameraOn);
    });

    // Active speaker
    socket.on('user-speaking', ({ socketId, userName, isSpeaking }) => {
        const tile = document.getElementById(`tile-${socketId}`);
        if (tile) tile.classList.toggle('active-speaker', isSpeaking);
        if (isSpeaking && activeSpeakerBanner && activeSpeakerName) {
            activeSpeakerName.textContent = `${userName} is speaking...`;
            activeSpeakerBanner.classList.remove('hidden');
            clearTimeout(activeSpeakerBanner._timeout);
            activeSpeakerBanner._timeout = setTimeout(() => {
                activeSpeakerBanner.classList.add('hidden');
            }, 3000);
        }
    });

    // Engagement scores update
    socket.on('engagement-scores-update', ({ scores }) => {
        updateEngagementUI(scores);
    });

    // Screen share events
    socket.on('screen-share-started', ({ socketId, userName }) => {
        window.SM.showToast(`${userName} started sharing their screen`, 'info', 3000);
    });

    socket.on('screen-share-stopped', () => {
        document.getElementById('screenShareView')?.classList.add('hidden');
    });

    // Meeting ended by host
    socket.on('meeting-ended', ({ meetingId }) => {
        window.SM.showToast('Meeting ended by host. Redirecting to summary...', 'info');
        cleanup();
        setTimeout(() => {
            window.location.href = `/summary.html?id=${meetingId}`;
        }, 2000);
    });
};

// ════════════════════════════════════════════════════════════════════════════
// WEBRTC PEER CONNECTIONS
// ════════════════════════════════════════════════════════════════════════════

const createPeerConnection = (socketId, userName) => {
    if (peers[socketId]) return peers[socketId];

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peers[socketId] = pc;

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    }

    // Receive remote stream
    pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        let tile = document.getElementById(`tile-${socketId}`);
        if (!tile) {
            addVideoTile(socketId, remoteStream, userName);
        } else {
            const video = document.getElementById(`video-${socketId}`);
            if (video) {
                video.srcObject = remoteStream;
                document.getElementById(`avatar-tile-${socketId}`)?.classList.remove('visible');
            }
        }
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                targetSocketId: socketId,
                candidate: event.candidate,
            });
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`Peer ${socketId} state: ${pc.connectionState}`);
    };

    return pc;
};

const createPeerAndOffer = async (socketId, userName) => {
    const pc = createPeerConnection(socketId, userName);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { targetSocketId: socketId, offer });
};

// ════════════════════════════════════════════════════════════════════════════
// CHAT
// ════════════════════════════════════════════════════════════════════════════

const addChatMessage = ({ userId, userName, message, timestamp }) => {
    const isEmpty = chatMessages.querySelector('.chat-empty');
    if (isEmpty) isEmpty.remove();

    const isOwn = userId?.toString() === MY_ID?.toString();
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const initial = userName?.charAt(0)?.toUpperCase() || '?';

    const div = document.createElement('div');
    div.className = `chat-msg${isOwn ? ' own' : ''}`;
    div.innerHTML = `
    <div class="chat-msg-header">
      <div class="chat-msg-avatar">${initial}</div>
      <span class="chat-msg-name">${userName}${isOwn ? ' (You)' : ''}</span>
      <span class="chat-msg-time">${time}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(message)}</div>
  `;

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ════════════════════════════════════════════════════════════════════════════
// PARTICIPANTS LIST
// ════════════════════════════════════════════════════════════════════════════

const addParticipantToList = (socketId, name) => {
    if (!participantsList) return;
    if (document.getElementById(`pitem-${socketId}`)) return;

    const initial = name?.charAt(0)?.toUpperCase() || '?';
    const div = document.createElement('div');
    div.className = 'participant-item';
    div.id = `pitem-${socketId}`;
    div.innerHTML = `
    <div class="participant-avatar">${initial}</div>
    <div class="participant-details">
      <div class="participant-name">${name}</div>
      <div class="participant-status">In meeting</div>
    </div>
    <div class="participant-icons">
      <span id="pmute-${socketId}"></span>
    </div>
  `;
    participantsList.appendChild(div);
};

const removeParticipantFromList = (socketId) => {
    document.getElementById(`pitem-${socketId}`)?.remove();
};

// ════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT UI UPDATE
// ════════════════════════════════════════════════════════════════════════════

const updateEngagementUI = (scores) => {
    if (!engagementList) return;

    const empty = engagementList.querySelector('.ai-empty');
    if (empty && scores.length > 0) empty.remove();

    scores.forEach(({ userId, userName, engagementScore }) => {
        let item = document.getElementById(`eng-item-${userId}`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'engagement-item';
            item.id = `eng-item-${userId}`;
            item.innerHTML = `
        <span class="engagement-name">${userName}</span>
        <div class="engagement-bar-wrapper">
          <div class="engagement-bar-fill" id="engbar-${userId}" style="width:0%"></div>
        </div>
        <span class="engagement-score" id="engscore-${userId}">0%</span>
      `;
            engagementList.appendChild(item);
        }

        const bar = document.getElementById(`engbar-${userId}`);
        const score = document.getElementById(`engscore-${userId}`);
        if (bar) bar.style.width = `${engagementScore}%`;
        if (score) score.textContent = `${engagementScore}%`;

        // Update on video tile
        const tileEng = document.getElementById(`eng-local-tile`);
        if (tileEng) {
            tileEng.classList.remove('hidden');
            tileEng.textContent = `${engagementScore}%`;
        }
    });
};

// ════════════════════════════════════════════════════════════════════════════
// TIMER
// ════════════════════════════════════════════════════════════════════════════

const startTimer = () => {
    meetingStartTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - meetingStartTime) / 1000);
        const h = String(Math.floor(elapsed / 3600)).padStart(2, '0');
        const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
        const s = String(elapsed % 60).padStart(2, '0');
        if (timerDisplay) timerDisplay.textContent = `${h}:${m}:${s}`;
    }, 1000);
};

// ════════════════════════════════════════════════════════════════════════════
// CONTROLS
// ════════════════════════════════════════════════════════════════════════════

// Mute/Unmute
document.getElementById('muteBtn')?.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;

    const btn = document.getElementById('muteBtn');
    const icon = document.getElementById('muteIcon');
    btn.classList.toggle('off', isMuted);
    if (icon) icon.textContent = isMuted ? '🔇' : '🎙️';
    document.querySelector('.controls-bar .control-group:nth-child(1) .control-label').textContent = isMuted ? 'Unmute' : 'Mute';

    socket?.emit('toggle-audio', { meetingId: MEETING_ID, isMuted });
});

// Camera on/off
document.getElementById('cameraBtn')?.addEventListener('click', () => {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    isCameraOn = !isCameraOn;
    videoTrack.enabled = isCameraOn;

    const btn = document.getElementById('cameraBtn');
    const icon = document.getElementById('cameraIcon');
    btn.classList.toggle('off', !isCameraOn);
    if (icon) icon.textContent = isCameraOn ? '📹' : '📷';

    const localVideo = document.getElementById('video-local');
    const localAvatar = document.getElementById('avatar-local-tile');
    if (localVideo) localVideo.style.display = isCameraOn ? 'block' : 'none';
    if (localAvatar) localAvatar.classList.toggle('visible', !isCameraOn);

    socket?.emit('toggle-video', { meetingId: MEETING_ID, isCameraOn });
});

// Screen share
document.getElementById('screenShareBtn')?.addEventListener('click', async () => {
    if (screenStream) {
        screenStream.getTracks().forEach((t) => t.stop());
        screenStream = null;
        document.getElementById('screenShareView')?.classList.add('hidden');
        document.getElementById('screenShareBtn').classList.remove('active');
        socket?.emit('screen-share-stopped', { meetingId: MEETING_ID });
        // Restore camera in peer connections
        Object.values(peers).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            const camTrack = localStream?.getVideoTracks()[0];
            if (sender && camTrack) sender.replaceTrack(camTrack);
        });
        return;
    }

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

        const screenView = document.getElementById('screenShareView');
        const screenVideo = document.getElementById('screenShareVideo');
        if (screenVideo) screenVideo.srcObject = screenStream;
        screenView?.classList.remove('hidden');
        document.getElementById('screenShareBtn').classList.add('active');
        socket?.emit('screen-share-started', { meetingId: MEETING_ID });

        // Replace video track in peer connections
        const screenTrack = screenStream.getVideoTracks()[0];
        Object.values(peers).forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        });

        screenTrack.onended = () => {
            document.getElementById('screenShareBtn')?.click();
        };
    } catch (err) {
        window.SM.showToast('Screen sharing cancelled or unavailable.', 'warning');
    }
});

document.getElementById('stopScreenShareBtn')?.addEventListener('click', () => {
    document.getElementById('screenShareBtn')?.click();
});

// Raise hand
document.getElementById('raiseHandBtn')?.addEventListener('click', () => {
    isHandRaised = !isHandRaised;
    document.getElementById('raiseHandBtn').classList.toggle('active', isHandRaised);
    document.getElementById('handIcon').textContent = isHandRaised ? '✋' : '✋';
    socket?.emit('raise-hand', { meetingId: MEETING_ID, raised: isHandRaised });
    window.SM.showToast(isHandRaised ? 'Hand raised ✋' : 'Hand lowered', 'info', 2000);
});

// Chat toggle
const sidebarEl = document.getElementById('sidebar');
document.getElementById('chatToggleBtn')?.addEventListener('click', () => {
    if (sidebarEl) sidebarEl.classList.toggle('collapsed');
});

// Send chat
const sendChat = () => {
    const msg = chatInput?.value.trim();
    if (!msg || !socket) return;
    socket.emit('chat-message', { meetingId: MEETING_ID, message: msg });
    chatInput.value = '';
};

document.getElementById('sendChatBtn')?.addEventListener('click', sendChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// Copy meeting ID
document.getElementById('copyMeetingId')?.addEventListener('click', () => {
    navigator.clipboard.writeText(MEETING_ID).then(() => {
        window.SM.showToast('Meeting ID copied!', 'success', 2000);
    });
});

// Transcript toggle
document.getElementById('transcriptBtn')?.addEventListener('click', () => {
    isTranscribing = !isTranscribing;
    document.getElementById('transcriptBtn').classList.toggle('active', isTranscribing);
    const icon = document.getElementById('transcriptIcon');
    if (icon) icon.textContent = isTranscribing ? '📝' : '📝';

    if (window.SpeechRec) {
        isTranscribing ? window.SpeechRec.start(MEETING_ID) : window.SpeechRec.stop();
    }
    window.SM.showToast(
        isTranscribing ? 'Live transcription started 🎤' : 'Transcription stopped',
        'info', 2500
    );
});

// Sidebar tabs
document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        document.querySelectorAll('.sidebar-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tab-${tabId}`)?.classList.add('active');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// LEAVE / END MEETING
// ════════════════════════════════════════════════════════════════════════════

document.getElementById('leaveBtn')?.addEventListener('click', () => {
    leaveModal?.classList.remove('hidden');
});

document.getElementById('cancelLeave')?.addEventListener('click', () => {
    leaveModal?.classList.add('hidden');
});

document.getElementById('confirmLeave')?.addEventListener('click', () => {
    leaveMeeting();
});

document.getElementById('endMeetingBtn')?.addEventListener('click', async () => {
    if (!confirm('End meeting for all participants?')) return;

    // Call end meeting API
    const { ok, data } = await window.SM.apiRequest('POST', `/meetings/${MEETING_ID}/end`);
    if (ok) {
        socket?.emit('end-meeting', { meetingId: MEETING_ID });
        cleanup();
        window.location.href = `/summary.html?id=${MEETING_ID}`;
    } else {
        window.SM.showToast(data.message || 'Failed to end meeting.', 'error');
    }
});

const leaveMeeting = () => {
    socket?.emit('leave-room', { meetingId: MEETING_ID });
    cleanup();
    window.location.href = '/dashboard.html';
};

const cleanup = () => {
    clearInterval(timerInterval);
    localStream?.getTracks().forEach((t) => t.stop());
    screenStream?.getTracks().forEach((t) => t.stop());
    Object.values(peers).forEach((pc) => pc.close());
    peers = {};
    if (window.EngagementTracker) window.EngagementTracker.stop();
    if (window.SpeechRec) window.SpeechRec.stop();
    socket?.disconnect();
};

// ════════════════════════════════════════════════════════════════════════════
// ADD OWN PARTICIPANT TO LIST
// ════════════════════════════════════════════════════════════════════════════

const addSelfToParticipantList = () => {
    const mySocketId = 'self';
    const initial = MY_NAME?.charAt(0)?.toUpperCase() || '?';
    const div = document.createElement('div');
    div.className = 'participant-item';
    div.id = `pitem-self`;
    div.innerHTML = `
    <div class="participant-avatar">${initial}</div>
    <div class="participant-details">
      <div class="participant-name">${MY_NAME} (You)</div>
      <div class="participant-status">${isHost ? '👑 Host' : 'Participant'}</div>
    </div>
  `;
    if (participantsList) participantsList.prepend(div);
};

// ════════════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════════════

window.addEventListener('DOMContentLoaded', () => {
    addSelfToParticipantList();
    init();

    // Warn before leaving page
    window.addEventListener('beforeunload', (e) => {
        cleanup();
    });
});
