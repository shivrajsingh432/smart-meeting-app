/**
 * home.js – v2
 * Adds: Meeting creation modal with ID, password, invite link, copy/share buttons
 *       Uses new password-protected API
 */

document.addEventListener('DOMContentLoaded', () => {
    window.SM?.updateNavbar();

    // ── Format meeting ID input ────────────────────────────────────────────────
    const joinInput = document.getElementById('joinInput');
    joinInput?.addEventListener('input', (e) => {
        let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
        e.target.value = v;
    });

    // ── Host Meeting ───────────────────────────────────────────────────────────
    document.getElementById('hostBtn')?.addEventListener('click', hostMeeting);

    // ── Join Meeting ───────────────────────────────────────────────────────────
    document.getElementById('joinBtn')?.addEventListener('click', () => {
        const mid = joinInput?.value.trim().toUpperCase();
        if (!mid || mid.replace('-', '').length < 6) {
            return window.SM?.showToast('Enter a valid Meeting ID', 'warning');
        }
        window.location.href = `/join/${mid}`;
    });

    joinInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('joinBtn')?.click();
    });

    // ── Modal close ────────────────────────────────────────────────────────────
    document.getElementById('modalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'modalOverlay') closeModal();
    });
    document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalJoinNowBtn')?.addEventListener('click', () => {
        const mid = document.getElementById('modalMeetingId')?.textContent;
        if (mid) window.location.href = `/meeting.html?id=${mid}`;
    });
});

// ── Host meeting flow ─────────────────────────────────────────────────────────
const hostMeeting = async () => {
    if (!window.SM?.getToken()) {
        window.SM?.showToast('Please log in to host a meeting', 'warning');
        setTimeout(() => { window.location.href = '/login.html'; }, 1200);
        return;
    }

    const btn = document.getElementById('hostBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

    try {
        const { ok, data } = await window.SM.apiRequest('POST', '/meetings/create', {
            title: 'Meetrix Session',
            expiryHours: 24,
        });

        if (ok) {
            localStorage.setItem('sm_isHost', 'true');
            // Store joinToken for socket gate
            const joinRes = await window.SM.apiRequest('POST', '/meetings/join', {
                meetingId: data.meetingId,
            });
            if (joinRes.ok) {
                localStorage.setItem('sm_joinToken', joinRes.data.joinToken);
            }
            showMeetingCreatedModal(data);
        } else {
            window.SM.showToast(data.message || 'Failed to create meeting', 'error');
        }
    } catch {
        window.SM.showToast('Network error. Is the server running?', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🎥 Host a Meeting'; }
    }
};

// ── Show creation success modal ───────────────────────────────────────────────
const showMeetingCreatedModal = (data) => {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) return;

    document.getElementById('modalMeetingId').textContent = data.meetingId;
    document.getElementById('modalInviteLink').textContent = data.inviteLink;
    document.getElementById('modalPasswordArea').style.display =
        data.isPasswordProtected ? 'block' : 'none';

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('active'), 10);
};

const closeModal = () => {
    const overlay = document.getElementById('modalOverlay');
    overlay?.classList.remove('active');
    setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, 300);
};

// ── Copy helpers (called inline in HTML) ──────────────────────────────────────
window.copyToClipboard = async (elementId, btn) => {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = el.textContent || el.value;
    try {
        await navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    } catch {
        window.SM?.showToast('Copy failed – please copy manually', 'warning');
    }
};

window.shareInvite = async () => {
    const link = document.getElementById('modalInviteLink')?.textContent;
    const id = document.getElementById('modalMeetingId')?.textContent;
    if (navigator.share) {
        await navigator.share({
            title: 'Join my Meetrix',
            text: `Join my AI-powered meeting! ID: ${id}`,
            url: link,
        });
    } else {
        await navigator.clipboard.writeText(
            `Join my Meetrix!\nMeeting ID: ${id}\nLink: ${link}`
        );
        window.SM?.showToast('Invite copied to clipboard!', 'success');
    }
};
