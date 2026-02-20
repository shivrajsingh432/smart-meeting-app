/**
 * summary.js – Post-meeting summary page logic
 * Fetches meeting summary + analytics and populates the page
 */

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const meetingId = urlParams.get('id');

    if (!meetingId) {
        return (window.location.href = '/dashboard.html');
    }

    const summaryLoading = document.getElementById('summaryLoading');
    const summaryContent = document.getElementById('summaryContent');

    // Fetch summary from API
    const { ok, data } = await window.SM.apiRequest('GET', `/meetings/${meetingId}/summary`);

    // Hide loading
    summaryLoading?.classList.add('hidden');

    if (!ok) {
        window.SM.showToast(data.message || 'Failed to load summary.', 'error');
        summaryContent?.classList.remove('hidden');
        return;
    }

    summaryContent?.classList.remove('hidden');

    const { meeting, summary, analytics } = data;

    // ── Meeting Overview ─────────────────────────────────────────────────
    document.getElementById('sumMeetingId').textContent = meeting.meetingId;

    const startDate = new Date(meeting.startTime);
    document.getElementById('sumDate').textContent =
        `📅 ${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const durationMin = Math.floor((meeting.duration || 0) / 60);
    const durationSec = (meeting.duration || 0) % 60;
    document.getElementById('sumDuration').textContent = `⏱ ${durationMin}m ${durationSec}s`;
    document.getElementById('sumParticipants').textContent = `👥 ${meeting.participants?.length || 0} people`;

    document.getElementById('sumTotalParticipants').textContent = meeting.participants?.length || 0;
    document.getElementById('sumDurationStat').textContent = `${durationMin}m ${durationSec}s`;
    document.getElementById('sumChatCount').textContent = meeting.chatMessages?.length || 0;

    const topEng = analytics.engagements[0];
    document.getElementById('sumTopEngagement').textContent =
        topEng ? `${topEng.engagementScore}%` : 'N/A';

    // ── AI Summary ───────────────────────────────────────────────────────
    document.getElementById('aiSummaryText').textContent =
        summary.text || 'No summary available. Ensure Hugging Face API is configured.';

    // ── Structured Summary ───────────────────────────────────────────────
    renderList('keyDecisions', summary.structured?.decisions, 'No decisions recorded.');
    renderList('actionItems', summary.structured?.actionItems, 'No action items identified.');
    renderList('keyPoints', summary.structured?.keyPoints, 'No key points extracted.');

    // ── Full Transcript ───────────────────────────────────────────────────
    document.getElementById('transcriptContent').textContent =
        summary.transcript || 'No transcript available for this meeting.';

    document.getElementById('toggleTranscript')?.addEventListener('click', (e) => {
        const container = document.getElementById('transcriptContainer');
        const isExpanded = container.classList.contains('expanded');
        container.classList.toggle('expanded', !isExpanded);
        e.target.textContent = isExpanded ? 'Show Full' : 'Collapse';
    });

    // ── Charts ───────────────────────────────────────────────────────────
    const engagements = analytics.engagements || [];

    if (window.SMCharts) {
        window.SMCharts.renderEngagementChart('engagementChart', engagements);
        window.SMCharts.renderContributionChart('contributionChart', engagements);
    }

    // ── Leaderboard ───────────────────────────────────────────────────────
    const leaderboard = document.getElementById('leaderboard');
    if (leaderboard) {
        if (engagements.length === 0) {
            leaderboard.innerHTML = '<p style="color: var(--text-muted); font-size:13px; text-align:center;">No engagement data available.</p>';
        } else {
            leaderboard.innerHTML = engagements
                .sort((a, b) => b.speakingTime - a.speakingTime)
                .map((eng, i) => {
                    const rankClass = ['gold', 'silver', 'bronze'][i] || '';
                    const rankEmoji = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
                    const mins = Math.floor(eng.speakingTime / 60);
                    const secs = Math.round(eng.speakingTime % 60);
                    const contrib = eng.contributionPercentage || 0;

                    return `
            <div class="leaderboard-item">
              <div class="lb-rank ${rankClass}">${rankEmoji}</div>
              <div class="lb-name">${eng.userName}</div>
              <div style="font-size:12px; color: var(--text-muted);">${mins}m ${secs}s</div>
              <div class="lb-score">${contrib}%</div>
            </div>
          `;
                })
                .join('');
        }
    }

    // ── Page Title ────────────────────────────────────────────────────────
    document.title = `Summary – ${meeting.meetingId} – SmartMeet`;

    // ── PDF Download ─────────────────────────────────────────────────────
    document.getElementById('downloadPdfBtn')?.addEventListener('click', () => downloadPDF(meeting, summary, analytics));
});

// ── Helper: Render list items ─────────────────────────────────────────────
const renderList = (listId, items, emptyMsg) => {
    const el = document.getElementById(listId);
    if (!el) return;

    if (!items || items.length === 0) {
        el.innerHTML = `<li style="color: var(--text-muted);">${emptyMsg}</li>`;
        return;
    }

    el.innerHTML = items.map((item) => `<li>${item}</li>`).join('');
};

// ── PDF Export ────────────────────────────────────────────────────────────
const downloadPDF = (meeting, summary, analytics) => {
    if (!window.jspdf) {
        window.SM.showToast('PDF library not loaded.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const margin = 20;
    let y = margin;
    const lineH = 7;
    const pageW = 210;
    const contentW = pageW - margin * 2;

    // Header
    doc.setFillColor(30, 30, 60);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SmartMeet – Meeting Summary', margin, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 220);
    doc.text(`Meeting ID: ${meeting.meetingId}`, margin, 28);
    doc.text(
        `Date: ${new Date(meeting.startTime).toLocaleDateString()} | Duration: ${Math.floor(meeting.duration / 60)}m ${meeting.duration % 60}s | Participants: ${meeting.participants?.length}`,
        margin,
        35
    );

    y = 50;

    // AI Summary
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Summary', margin, y);
    y += lineH;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const summaryLines = doc.splitTextToSize(summary.text || 'No summary.', contentW);
    summaryLines.forEach((line) => {
        if (y > 270) { doc.addPage(); y = margin; }
        doc.text(line, margin, y);
        y += lineH - 1;
    });

    y += 6;

    // Action Items
    if (summary.structured?.actionItems?.length) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text('Action Items', margin, y);
        y += lineH;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        summary.structured.actionItems.forEach((item) => {
            if (y > 270) { doc.addPage(); y = margin; }
            doc.text(`• ${item}`, margin + 3, y);
            y += lineH - 1;
        });
        y += 4;
    }

    // Contribution Leaderboard
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Contribution Leaderboard', margin, y);
    y += lineH;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    (analytics.engagements || [])
        .sort((a, b) => b.speakingTime - a.speakingTime)
        .forEach((eng, i) => {
            if (y > 270) { doc.addPage(); y = margin; }
            const mins = Math.floor(eng.speakingTime / 60);
            const secs = Math.round(eng.speakingTime % 60);
            doc.text(
                `${i + 1}. ${eng.userName} – ${mins}m ${secs}s speaking | Engagement: ${eng.engagementScore}%`,
                margin + 3, y
            );
            y += lineH - 1;
        });

    doc.save(`SmartMeet_${meeting.meetingId}_Summary.pdf`);
    window.SM.showToast('PDF downloaded!', 'success');
};
