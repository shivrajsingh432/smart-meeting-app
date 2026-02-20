/**
 * speechRecognition.js – DEBUGGED v2
 *
 * BUGS FIXED:
 * 1. sendTextTranscript() was gated behind isLoggedIn() — silently dropped all
 *    transcripts for users whose token hadn't loaded yet. Removed the gate;
 *    the backend route handles auth (guests are skipped gracefully).
 * 2. Added full console logging at every stage so you can see exactly where
 *    the pipeline breaks in DevTools.
 * 3. Recognition restart logic: replaced recursive startWebSpeechAPI() call
 *    on error with a proper debounced restart to prevent stack buildup.
 * 4. Added recognition.onstart log so you can confirm mic access in console.
 * 5. interimText now shows in a dedicated <span id="interimTranscript"> instead
 *    of appending entries, giving real-time visual feedback while speaking.
 */

window.SpeechRec = (() => {
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let currentMeetingId = null;
    let isActive = false;
    let restartTimeout = null;   // Prevent multiple simultaneous restarts
    let audioInterval = null;

    const LOG_PREFIX = '[SpeechRec]';
    const SEND_MIN_CHARS = 5; // Don't save empty/noise transcripts

    // ── Public API ────────────────────────────────────────────────────────────

    const start = (meetingId) => {
        if (isActive) {
            console.log(`${LOG_PREFIX} Already active — skipping start()`);
            return;
        }
        if (!meetingId) {
            console.error(`${LOG_PREFIX} start() called without meetingId`);
            return;
        }

        currentMeetingId = meetingId;
        isActive = true;
        console.log(`${LOG_PREFIX} Starting for meeting: ${meetingId}`);

        const hasSpeechAPI = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
        console.log(`${LOG_PREFIX} Web Speech API available: ${hasSpeechAPI}`);

        if (hasSpeechAPI) {
            startWebSpeechAPI();
        } else {
            console.info(`${LOG_PREFIX} Web Speech API not available. Using MediaRecorder → Whisper fallback.`);
            startMediaRecorderFallback();
        }
    };

    const stop = () => {
        console.log(`${LOG_PREFIX} Stopping...`);
        isActive = false;
        clearTimeout(restartTimeout);
        clearInterval(audioInterval);

        if (recognition) {
            try { recognition.stop(); } catch (e) { }
            recognition = null;
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            try { mediaRecorder.stop(); } catch (e) { }
        }
    };

    // ── Web Speech API ────────────────────────────────────────────────────────

    const startWebSpeechAPI = () => {
        // Stop any existing instance cleanly
        if (recognition) {
            try { recognition.stop(); } catch (e) { }
            recognition = null;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        // ── Event: Started ───────────────────────────────────────────────────
        recognition.onstart = () => {
            console.log(`${LOG_PREFIX} ✅ recognition.onstart — microphone is listening`);
            showTranscriptStatus('🎤 Listening...');
        };

        // ── Event: Result ────────────────────────────────────────────────────
        recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const text = result[0].transcript;

                if (result.isFinal) {
                    finalText += text + ' ';
                    console.log(`${LOG_PREFIX} FINAL: "${text}" (confidence: ${(result[0].confidence * 100).toFixed(0)}%)`);
                } else {
                    interimText += text;
                }
            }

            // Show interim text in real-time (does not save to DB)
            showInterimTranscript(interimText);

            // Save final text to UI + DB
            if (finalText.trim().length >= SEND_MIN_CHARS) {
                const trimmed = finalText.trim();
                appendFinalTranscriptEntry(trimmed);
                sendTextTranscript(trimmed);
            }
        };

        // ── Event: Error ─────────────────────────────────────────────────────
        recognition.onerror = (e) => {
            console.warn(`${LOG_PREFIX} recognition.onerror: "${e.error}"`);
            showTranscriptStatus('⚠️ ' + e.error);

            if (e.error === 'not-allowed') {
                console.error(`${LOG_PREFIX} ❌ Microphone permission DENIED. Cannot transcribe.`);
                window.SM?.showToast('Microphone permission denied. Allow mic access and refresh.', 'error');
                isActive = false;
                return;
            }

            if (e.error === 'network') {
                console.error(`${LOG_PREFIX} ❌ Network error — Web Speech API requires internet (sends to Google).`);
            }

            // Restart for recoverable errors (no-speech, audio-capture, etc.)
            if (isActive && e.error !== 'aborted' && e.error !== 'not-allowed') {
                scheduleRestart();
            }
        };

        // ── Event: End ───────────────────────────────────────────────────────
        recognition.onend = () => {
            console.log(`${LOG_PREFIX} recognition.onend — isActive: ${isActive}`);
            if (isActive) {
                scheduleRestart();
            } else {
                showTranscriptStatus('');
            }
        };

        // ── Start ─────────────────────────────────────────────────────────────
        try {
            recognition.start();
        } catch (e) {
            console.error(`${LOG_PREFIX} recognition.start() threw:`, e);
            scheduleRestart();
        }
    };

    // Debounced restart — prevents multiple concurrent recognition instances
    const scheduleRestart = () => {
        clearTimeout(restartTimeout);
        restartTimeout = setTimeout(() => {
            if (isActive && recognition !== null) {
                console.log(`${LOG_PREFIX} Restarting recognition...`);
                startWebSpeechAPI();
            }
        }, 1000);
    };

    // ── MediaRecorder Fallback (Whisper API) ─────────────────────────────────

    const startMediaRecorderFallback = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log(`${LOG_PREFIX} MediaRecorder: microphone stream acquired`);

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/ogg';

            console.log(`${LOG_PREFIX} MediaRecorder mimeType: ${mimeType}`);
            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                    console.log(`${LOG_PREFIX} Audio chunk: ${e.data.size} bytes`);
                }
            };

            mediaRecorder.start(1000); // Collect chunks every 1s

            // Send every 15 seconds
            audioInterval = setInterval(async () => {
                if (!isActive) { clearInterval(audioInterval); return; }

                if (audioChunks.length === 0) {
                    console.log(`${LOG_PREFIX} No audio chunks to send yet`);
                    return;
                }

                const blob = new Blob(audioChunks, { type: mimeType });
                audioChunks = [];
                console.log(`${LOG_PREFIX} Sending audio blob: ${(blob.size / 1024).toFixed(1)}KB`);

                if (blob.size < 3000) {
                    console.log(`${LOG_PREFIX} Blob too small (${blob.size}B) — skipping`);
                    return;
                }

                const formData = new FormData();
                formData.append('audio', blob, 'segment.webm');
                formData.append('meetingId', currentMeetingId);

                try {
                    const { ok, data } = await window.SM.apiUpload('/transcribe', formData);
                    console.log(`${LOG_PREFIX} Whisper response:`, { ok, data });

                    if (ok && data.transcript?.text) {
                        appendFinalTranscriptEntry(data.transcript.text);
                        window.SM?.showToast('Transcribed: ' + data.transcript.text.slice(0, 50), 'info', 2000);
                    } else if (!ok) {
                        console.warn(`${LOG_PREFIX} Whisper API error:`, data?.message);
                    }
                } catch (err) {
                    console.error(`${LOG_PREFIX} Audio upload exception:`, err);
                }
            }, 15000);

        } catch (err) {
            console.error(`${LOG_PREFIX} MediaRecorder setup failed:`, err);
            if (err.name === 'NotAllowedError') {
                window.SM?.showToast('Microphone access denied.', 'error');
            }
        }
    };

    // ── Save text transcript to backend ──────────────────────────────────────

    /**
     * BUG FIX: Removed isLoggedIn() gate.
     * The backend /api/transcribe/text uses `protect` middleware which requires a token.
     * If no token, the server returns 401 — we just log it. No need to silently skip.
     * Guests without accounts simply won't have transcripts saved (expected behavior).
     */
    const sendTextTranscript = async (text) => {
        if (!currentMeetingId) {
            console.warn(`${LOG_PREFIX} sendTextTranscript: no meetingId — skipping`);
            return;
        }

        console.log(`${LOG_PREFIX} Saving transcript to backend: "${text.slice(0, 60)}..."`);

        try {
            const { ok, status, data } = await window.SM.apiRequest('POST', '/transcribe/text', {
                meetingId: currentMeetingId,
                text,
                duration: 0,
                confidence: 0.95,
                language: 'en',
            });

            if (ok) {
                console.log(`${LOG_PREFIX} ✅ Transcript saved to MongoDB:`, data.transcript?._id);
            } else {
                console.warn(`${LOG_PREFIX} ❌ Failed to save transcript (${status}):`, data?.message);
                // 401 = not logged in = expected for guests, not an error
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} sendTextTranscript exception:`, err);
        }
    };

    // ── UI Helpers ────────────────────────────────────────────────────────────

    /** Append a confirmed final transcript entry to the sidebar */
    const appendFinalTranscriptEntry = (text) => {
        const el = document.getElementById('liveTranscript');
        if (!el) {
            console.warn(`${LOG_PREFIX} #liveTranscript element not found in DOM`);
            return;
        }

        // Remove placeholder
        const empty = el.querySelector('.ai-empty');
        if (empty) empty.remove();

        // Remove interim text span
        const interim = el.querySelector('#interimTranscript');
        if (interim) interim.remove();

        // Append final entry
        const user = window.SM?.getUser();
        const entry = document.createElement('div');
        entry.className = 'transcript-entry';
        entry.innerHTML = `<span class="transcript-speaker">${user?.name || 'You'}:</span> ${escHtml(text)}`;
        el.appendChild(entry);
        el.scrollTop = el.scrollHeight;

        console.log(`${LOG_PREFIX} ✅ Transcript UI updated`);
    };

    /** Show real-time interim text (not saved to DB) */
    const showInterimTranscript = (text) => {
        const el = document.getElementById('liveTranscript');
        if (!el || !text) return;

        let interim = el.querySelector('#interimTranscript');
        if (!interim) {
            interim = document.createElement('div');
            interim.id = 'interimTranscript';
            interim.style.cssText = 'color: rgba(148,163,184,0.6); font-style:italic; font-size:0.85rem; padding:2px 0;';
            el.appendChild(interim);
        }
        interim.textContent = '...  ' + text;
        el.scrollTop = el.scrollHeight;
    };

    /** Show status text in transcript panel */
    const showTranscriptStatus = (msg) => {
        const status = document.getElementById('transcriptStatus');
        if (status) status.textContent = msg;
    };

    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return { start, stop };
})();
