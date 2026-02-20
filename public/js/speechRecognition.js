/**
 * speechRecognition.js
 * Uses the Web Speech API for continuous live transcription.
 * Falls back to sending audio blobs to the backend Whisper API.
 */

window.SpeechRec = (() => {
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let currentMeetingId = null;
    let isActive = false;
    let interimBuffer = '';
    let sendTimeout = null;

    const SEND_INTERVAL_MS = 8000; // Send transcript segment every 8s

    /**
     * Start speech recognition for a meeting
     * @param {string} meetingId
     */
    const start = (meetingId) => {
        if (isActive) return;
        currentMeetingId = meetingId;
        isActive = true;

        // Try Web Speech API first (Chrome/Edge)
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            startWebSpeechAPI();
        } else {
            // Fallback: audio MediaRecorder → backend Whisper
            console.info('Web Speech API not available. Using MediaRecorder fallback.');
            startMediaRecorderFallback();
        }
    };

    /** Stop all recognition */
    const stop = () => {
        isActive = false;
        if (recognition) {
            try { recognition.stop(); } catch { }
            recognition = null;
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        clearTimeout(sendTimeout);
    };

    // ── Web Speech API ──────────────────────────────────────────────────────

    const startWebSpeechAPI = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let finalText = '';
            let interimText = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalText += result[0].transcript + ' ';
                } else {
                    interimText += result[0].transcript;
                }
            }

            // Display interim text in the live transcript area
            if (interimText) {
                updateLiveTranscript(interimText, false);
            }

            // Send final text to server
            if (finalText.trim()) {
                updateLiveTranscript(finalText, true);
                sendTextTranscript(finalText.trim());
            }
        };

        recognition.onerror = (e) => {
            if (e.error === 'no-speech') return;
            console.warn('Speech recognition error:', e.error);
            if (isActive && e.error !== 'aborted') {
                setTimeout(startWebSpeechAPI, 2000); // Restart on error
            }
        };

        recognition.onend = () => {
            if (isActive) {
                setTimeout(() => {
                    try { recognition?.start(); } catch { }
                }, 500);
            }
        };

        try {
            recognition.start();
            console.log('🎤 Web Speech API started');
        } catch (e) {
            console.warn('Speech recognition start failed:', e);
        }
    };

    // ── MediaRecorder Fallback (sends audio to Whisper API) ─────────────────

    const startMediaRecorderFallback = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg',
            });

            const sendAudioChunk = async () => {
                if (!isActive || audioChunks.length === 0) return;

                const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
                audioChunks = [];

                // Only send if blob is meaningful (>5KB)
                if (blob.size < 5000) return;

                try {
                    const formData = new FormData();
                    formData.append('audio', blob, 'audio.webm');
                    formData.append('meetingId', currentMeetingId);

                    const { ok, data } = await window.SM.apiUpload('/transcribe', formData);
                    if (ok && data.transcript) {
                        updateLiveTranscript(data.transcript.text, true);
                    }
                } catch (err) {
                    console.warn('Audio upload error:', err);
                }
            };

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            // Collect audio in 1s chunks
            mediaRecorder.start(1000);

            // Send every 15 seconds
            const intervalId = setInterval(() => {
                if (!isActive) { clearInterval(intervalId); return; }
                sendAudioChunk();
            }, 15000);

        } catch (err) {
            console.error('MediaRecorder fallback failed:', err);
        }
    };

    // ── Send text transcript to server ───────────────────────────────────────

    const sendTextTranscript = async (text) => {
        if (!window.SM.isLoggedIn() || !currentMeetingId) return;

        try {
            await window.SM.apiRequest('POST', '/transcribe/text', {
                meetingId: currentMeetingId,
                text,
                duration: 0,
                confidence: 0.9,
                language: 'en',
            });
        } catch (err) {
            console.warn('Failed to save transcript:', err);
        }
    };

    // ── Update UI ─────────────────────────────────────────────────────────────

    const updateLiveTranscript = (text, isFinal) => {
        const transcriptEl = document.getElementById('liveTranscript');
        if (!transcriptEl) return;

        const empty = transcriptEl.querySelector('.ai-empty');
        if (empty) empty.remove();

        if (isFinal) {
            const user = window.SM.getUser();
            const entry = document.createElement('div');
            entry.className = 'transcript-entry';
            entry.innerHTML = `<strong>${user?.name || 'You'}:</strong> ${text}`;
            transcriptEl.appendChild(entry);
            transcriptEl.scrollTop = transcriptEl.scrollHeight;
        }
    };

    return { start, stop };
})();
