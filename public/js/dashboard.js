/**
 * dashboard.js – User dashboard page logic
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (!window.SM.requireAuth()) return;

    const user = window.SM.getUser();

    // Set welcome name
    const dashUserName = document.getElementById('dashUserName');
    if (dashUserName && user) dashUserName.textContent = user.name;

    // Quick host
    document.getElementById('quickHostBtn')?.addEventListener('click', async () => {
        const { ok, data } = await window.SM.apiRequest('POST', '/meetings/create');
        if (ok) {
            localStorage.setItem('sm_isHost', 'true');
            window.location.href = `/meeting.html?id=${data.meetingId}`;
        } else {
            window.SM.showToast(data.message || 'Failed to create meeting.', 'error');
        }
    });

    // Quick join
    const qjInput = document.getElementById('quickJoinInput');
    qjInput?.addEventListener('input', (e) => {
        let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 3) v = v.slice(0, 3) + '-' + v.slice(3, 6);
        e.target.value = v;
    });

    document.getElementById('quickJoinBtn')?.addEventListener('click', async () => {
        const mid = qjInput?.value.trim().toUpperCase();
        if (!mid || mid.length < 5) return window.SM.showToast('Enter a valid meeting ID.', 'warning');
        const { ok, data } = await window.SM.apiRequest('POST', '/meetings/join', { meetingId: mid });
        if (ok) {
            localStorage.setItem('sm_isHost', 'false');
            window.location.href = `/meeting.html?id=${mid}`;
        } else {
            window.SM.showToast(data.message || 'Failed to join.', 'error');
        }
    });

    // Load stats
    loadStats();

    // Load meeting history (hosted by default)
    let currentTab = 'hosted';
    loadHistory(currentTab);

    // Tab switching
    document.querySelectorAll('.history-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.history-tab').forEach((t) => t.classList.remove('active'));
            tab.classList.add('active');
            currentTab = tab.dataset.tab;
            loadHistory(currentTab);
        });
    });
});

const loadStats = async () => {
    const user = window.SM.getUser();
    if (!user) return;

    // We can compute basic stats from the user object
    document.getElementById('statTotalMeetings').textContent =
        (user.meetingsHosted || 0) + (user.meetingsJoined || 0);
    document.getElementById('statHosted').textContent = user.meetingsHosted || 0;

    const speakingMins = Math.round((user.totalSpeakingTime || 0) / 60);
    document.getElementById('statSpeaking').textContent = `${speakingMins}m`;
    document.getElementById('statEngagement').textContent = `${user.averageEngagementScore || 0}%`;

    // Get fresher stats from API
    const { ok, data } = await window.SM.apiRequest('GET', '/engagement/dashboard/stats');
    if (ok && data.stats) {
        document.getElementById('statTotalMeetings').textContent = data.stats.totalMeetings;
        document.getElementById('statHosted').textContent = data.stats.meetingsHosted;
        const mins = Math.round((data.stats.totalSpeakingTime || 0) / 60);
        document.getElementById('statSpeaking').textContent = `${mins}m`;
        document.getElementById('statEngagement').textContent = `${data.stats.averageEngagementScore || 0}%`;
    }
};

const loadHistory = async (tab) => {
    const loading = document.getElementById('historyLoading');
    const table = document.getElementById('meetingsTable');
    const empty = document.getElementById('noMeetings');
    const tbody = document.getElementById('meetingsBody');

    loading?.classList.remove('hidden');
    table?.classList.add('hidden');
    empty?.classList.add('hidden');

    const { ok, data } = await window.SM.apiRequest('GET', '/meetings/history');

    loading?.classList.add('hidden');

    if (!ok) {
        window.SM.showToast('Failed to load meeting history.', 'error');
        return;
    }

    const meetings = tab === 'hosted' ? data.hosted : data.joined;

    if (!meetings || meetings.length === 0) {
        empty?.classList.remove('hidden');
        return;
    }

    tbody.innerHTML = meetings.map((m) => {
        const date = new Date(m.startTime).toLocaleDateString();
        const time = new Date(m.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const durationMin = Math.floor((m.duration || 0) / 60);
        const durationSec = (m.duration || 0) % 60;
        const statusBadge =
            m.status === 'active'
                ? '<span class="badge badge-success">Live</span>'
                : m.status === 'ended'
                    ? '<span class="badge badge-primary">Ended</span>'
                    : '<span class="badge badge-warning">Waiting</span>';

        return `
      <tr>
        <td class="meeting-id-cell">${m.meetingId || '---'}</td>
        <td>${m.hostName || '---'}</td>
        <td>${date} ${time}</td>
        <td>${durationMin > 0 || durationSec > 0 ? `${durationMin}m ${durationSec}s` : '---'}</td>
        <td>${m.participantNames?.length || 0}</td>
        <td>${statusBadge}</td>
        <td>
          ${m.status === 'active'
                ? `<a href="/meeting.html?id=${m.meetingId}" class="btn btn-success btn-sm">Rejoin</a>`
                : m.status === 'ended'
                    ? `<a href="/summary.html?id=${m.meetingId}" class="btn btn-secondary btn-sm">Summary</a>`
                    : '---'}
        </td>
      </tr>
    `;
    }).join('');

    table?.classList.remove('hidden');
};
