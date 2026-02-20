/**
 * joinPage.js – Join meeting page logic
 * Handles: URL param pre-fill, meeting info fetch, password gate, join flow
 */

let meetingInfo = null;
let joinToken = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = window.SM?.getUser();

    // Update navbar
    window.SM?.updateNavbar();

    // Pre-fill name if logged in
    if (user) {
        document.getElementById('joinName').value = user.name;
        document.getElementById('nameInputRow').style.display = 'none';
    }

    // Auto-fill meeting ID from URL: /join/ABC-1X2
    const pathParts = window.location.pathname.split('/');
    const meetingIdFromPath = pathParts[pathParts.length - 1];
    if (meetingIdFromPath && meetingIdFromPath.length >= 5 && meetingIdFromPath !== 'join') {
        const input = document.getElementById('joinMeetingId');
        input.value = meetingIdFromPath.toUpperCase();
        await fetchMeetingInfo(meetingIdFromPath.toUpperCase());
    }

    // Format meeting ID as user types
    document.getElementById('joinMeetingId').addEventListener('input', async (e) => {
        let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
        e.target.value = v;

        // Fetch info when ID looks complete
        if (v.replace('-', '').length >= 6) {
            await fetchMeetingInfo(v);
        } else {
            resetMeetingMeta();
        }
    });

    // Form submit
    document.getElementById('joinForm').addEventListener('submit', handleJoin);
});

// ── Fetch Meeting Info (for UI preview) ─────────────────────────────────────
const fetchMeetingInfo = async (meetingId) => {
    try {
        const res = await fetch(`/api/meetings/${meetingId}/info`);
        const data = await res.json();

        if (!data.success) {
            resetMeetingMeta();
            return;
        }

        meetingInfo = data;

        // Show meta card
        const meta = document.getElementById('meetingMeta');
        const title = document.getElementById('metaMeetingTitle');
        const host = document.getElementById('metaMeetingHost');
        const badge = document.getElementById('metaStatusBadge');
        const subtitle = document.getElementById('joinSubtitle');

        title.textContent = data.title || 'Meeting';
        host.textContent = `Hosted by ${data.hostName || 'Unknown'}`;

        if (data.isLocked) {
            badge.textContent = '🔒 Locked';
            badge.className = 'meeting-status-badge badge-lock';
        } else if (data.status === 'active') {
            badge.textContent = '🟢 Live Now';
            badge.className = 'meeting-status-badge badge-live';
        } else if (data.status === 'ended') {
            badge.textContent = '⛔ Ended';
            badge.className = 'meeting-status-badge badge-ended';
        } else {
            badge.textContent = '🟡 Waiting to start';
            badge.className = 'meeting-status-badge badge-wait';
        }

        subtitle.textContent = `${data.participantCount} participant${data.participantCount !== 1 ? 's' : ''} inside`;
        meta.classList.add('visible');

        // Show password field if protected
        const pwGroup = document.getElementById('passwordGroup');
        if (data.isPasswordProtected) {
            pwGroup.style.display = 'block';
        } else {
            pwGroup.style.display = 'none';
        }

        // Disable join if locked
        if (data.isLocked) {
            document.getElementById('joinBtn').disabled = true;
            showError('This meeting is locked. No new participants can join.');
        }

    } catch (e) {
        resetMeetingMeta();
    }
};

const resetMeetingMeta = () => {
    meetingInfo = null;
    document.getElementById('meetingMeta').classList.remove('visible');
    document.getElementById('passwordGroup').style.display = 'none';
    document.getElementById('joinBtn').disabled = false;
    hideError();
};

// ── Handle Join Submission ────────────────────────────────────────────────────
const handleJoin = async (e) => {
    e.preventDefault();
    hideError();

    const meetingId = document.getElementById('joinMeetingId').value.trim().toUpperCase();
    const password = document.getElementById('joinPassword').value.trim();
    const name = document.getElementById('joinName').value.trim() ||
        window.SM?.getUser()?.name || 'Guest';

    if (meetingId.replace('-', '').length < 6) {
        return showError('Please enter a valid meeting ID.');
    }

    const btn = document.getElementById('joinBtn');
    btn.disabled = true;
    btn.textContent = 'Joining…';

    try {
        const headers = { 'Content-Type': 'application/json' };
        const token = window.SM?.getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch('/api/meetings/join', {
            method: 'POST',
            headers,
            body: JSON.stringify({ meetingId, password }),
        });
        const data = await res.json();

        if (!data.success) {
            showError(data.message || 'Could not join meeting.');
            btn.disabled = false;
            btn.textContent = 'Join Meeting →';

            // Show password field if meeting needs it
            if (data.requiresPassword) {
                document.getElementById('passwordGroup').style.display = 'block';
                document.getElementById('joinPassword').focus();
            }
            return;
        }

        // Store joinToken for Socket.io gate
        joinToken = data.joinToken;
        localStorage.setItem('sm_joinToken', joinToken);
        localStorage.setItem('sm_isHost', 'false');
        localStorage.setItem('sm_userName', name);

        // Show waiting room state if applicable
        if (data.waitingRoomEnabled) {
            document.getElementById('joinForm').classList.add('hidden');
            document.getElementById('waitingBox').classList.add('visible');
            // The socket.io 'join-approved' event will redirect
        } else {
            window.location.href = `/meeting.html?id=${meetingId}`;
        }

    } catch (err) {
        showError('Network error. Is the server running?');
        btn.disabled = false;
        btn.textContent = 'Join Meeting →';
    }
};

const showError = (msg) => {
    const box = document.getElementById('joinErrorBox');
    document.getElementById('joinErrorMsg').textContent = msg;
    box.classList.add('visible');
};

const hideError = () => {
    document.getElementById('joinErrorBox').classList.remove('visible');
};

const togglePassword = (id, btn) => {
    const input = document.getElementById(id);
    if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
    else { input.type = 'password'; btn.textContent = '👁'; }
};
