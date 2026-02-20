/**
 * engagement.js – Real-time engagement tracking
 *
 * Tracks:
 *   - Speaking time (via AudioContext amplitude analysis)
 *   - Camera ON time
 *   - Chat messages (counted via Socket events)
 *
 * Sends updates to server via Socket.io every 5 seconds
 */

window.EngagementTracker = (() => {

    let socket = null;
    let meetingId = null;
    let intervalId = null;
    let audioContext = null;
    let analyser = null;
    let micSource = null;

    // Accumulated deltas (since last server sync)
    let deltaSpeakingTime = 0;
    let deltaCameraOnTime = 0;
    let deltaChatMessages = 0;

    // Total cumulative for local display
    let totalSpeakingTime = 0;
    let totalCameraOnTime = 0;

    // State
    let isSpeaking = false;
    let cameraIsOn = true;
    let lastTickTime = Date.now();
    const SPEAKING_THRESHOLD = 0.02; // RMS amplitude threshold
    const SEND_INTERVAL_MS = 5000;  // Sync every 5 seconds

    /**
     * Start tracking engagement
     * @param {string} mId – meeting ID
     * @param {*} sock – Socket.io socket instance
     */
    const start = (mId, sock) => {
        meetingId = mId;
        socket = sock;

        setupAudioAnalysis();
        startSyncInterval();

        console.log('📊 Engagement tracking started');
    };

    /** Stop tracking */
    const stop = () => {
        clearInterval(intervalId);
        if (audioContext) {
            try { audioContext.close(); } catch { }
            audioContext = null;
        }
    };

    // ── Audio Analysis ──────────────────────────────────────────────────────

    const setupAudioAnalysis = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.3;

            micSource = audioContext.createMediaStreamSource(stream);
            micSource.connect(analyser);

            // Poll amplitude 10 times/sec
            const pollInterval = setInterval(() => {
                if (!audioContext) { clearInterval(pollInterval); return; }
                analyzeMicAmplitude();
            }, 100);

        } catch (err) {
            console.warn('Audio analysis unavailable:', err.message);
        }
    };

    const analyzeMicAmplitude = () => {
        if (!analyser) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(dataArray);

        // Calculate RMS (root mean square) amplitude
        let sumSquares = 0;
        for (const val of dataArray) {
            const normalized = (val - 128) / 128;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        const wasSpeaking = isSpeaking;
        isSpeaking = rms > SPEAKING_THRESHOLD;

        if (isSpeaking) {
            deltaSpeakingTime += 0.1; // 100ms = 0.1 seconds
            totalSpeakingTime += 0.1;
        }

        // Notify others about speaking state change
        if (isSpeaking !== wasSpeaking && socket) {
            socket.emit('speaking', { meetingId, isSpeaking });
        }
    };

    // ── Camera Time Tracking ─────────────────────────────────────────────────

    const tick = () => {
        const now = Date.now();
        const dt = (now - lastTickTime) / 1000; // seconds
        lastTickTime = now;

        if (cameraIsOn) {
            deltaCameraOnTime += dt;
            totalCameraOnTime += dt;
        }
    };

    // ── Server Sync ──────────────────────────────────────────────────────────

    const startSyncInterval = () => {
        lastTickTime = Date.now();
        intervalId = setInterval(() => {
            tick();

            if (!socket || !meetingId) return;

            // Emit engagement update via Socket.io
            socket.emit('engagement-update', {
                meetingId,
                speakingTimeDelta: Math.round(deltaSpeakingTime),
                cameraOnTimeDelta: Math.round(deltaCameraOnTime),
            });

            // Reset deltas after sending
            deltaSpeakingTime = 0;
            deltaCameraOnTime = 0;
            deltaChatMessages = 0;
        }, SEND_INTERVAL_MS);
    };

    // ── Public API ───────────────────────────────────────────────────────────

    /** Called when camera is toggled */
    const setCameraState = (isOn) => { cameraIsOn = isOn; };

    /** Called when a chat message is sent */
    const onChatMessage = () => { deltaChatMessages++; };

    /** Get current speaking time for local display */
    const getSpeakingTime = () => totalSpeakingTime;

    return { start, stop, setCameraState, onChatMessage, getSpeakingTime };
})();
