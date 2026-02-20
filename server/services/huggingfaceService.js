/**
 * Hugging Face Service
 * Integrates with Hugging Face Inference API for:
 *   1. Speech-to-Text (Whisper model)
 *   2. Text Summarization (BART model)
 */

const axios = require('axios');

const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
const WHISPER_MODEL = process.env.HF_WHISPER_MODEL || 'openai/whisper-large-v3';
const SUMMARY_MODEL = process.env.HF_SUMMARIZATION_MODEL || 'facebook/bart-large-cnn';

/**
 * Common headers for Hugging Face API requests
 */
const getHeaders = (isBlob = false) => ({
    Authorization: `Bearer ${HF_API_KEY}`,
    ...(isBlob ? { 'Content-Type': 'audio/wav' } : { 'Content-Type': 'application/json' }),
});

/**
 * Retry helper for HF API (model loading can take time)
 * @param {Function} fn - Async function to retry
 * @param {number} retries - Max number of retries
 * @param {number} delay - Delay in ms between retries
 */
const retryRequest = async (fn, retries = 3, delay = 20000) => {
    try {
        return await fn();
    } catch (error) {
        if (retries > 0 && error.response?.status === 503) {
            // Model is loading, wait and retry
            console.log(`⏳ Model loading... retrying in ${delay / 1000}s (${retries} attempts left)`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return retryRequest(fn, retries - 1, delay);
        }
        throw error;
    }
};

/**
 * Transcribe audio using Hugging Face Whisper model
 * @param {Buffer} audioBuffer - Audio file buffer (WAV or WebM)
 * @returns {Promise<{text: string, language: string, duration: number}>}
 */
const transcribeAudio = async (audioBuffer) => {
    if (!HF_API_KEY || HF_API_KEY === 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
        // Return mock data if API key not configured
        console.warn('⚠️  Hugging Face API key not configured. Returning mock transcript.');
        return {
            text: '[Transcript not available - Please configure HUGGINGFACE_API_KEY in .env]',
            language: 'en',
            duration: 0,
        };
    }

    try {
        const response = await retryRequest(() =>
            axios.post(`${HF_API_URL}/${WHISPER_MODEL}`, audioBuffer, {
                headers: getHeaders(true),
                timeout: 120000, // 2 minute timeout for large audio files
            })
        );

        const result = response.data;

        return {
            text: result.text || '',
            language: result.language || 'en',
            duration: result.duration || 0,
        };
    } catch (error) {
        console.error('❌ Whisper transcription error:', error.response?.data || error.message);
        throw new Error(
            `Transcription failed: ${error.response?.data?.error || error.message}`
        );
    }
};

/**
 * Generate a summary of the meeting transcript using BART model
 * @param {string} transcriptText - Full meeting transcript
 * @returns {Promise<{summary: string, keyPoints: string[], actionItems: string[], decisions: string[]}>}
 */
const generateSummary = async (transcriptText) => {
    if (!HF_API_KEY || HF_API_KEY === 'hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
        // Return mock summary if API key not configured
        console.warn('⚠️  Hugging Face API key not configured. Returning mock summary.');
        return {
            summary: '[AI Summary not available - Please configure HUGGINGFACE_API_KEY in .env]',
            keyPoints: ['Configure your Hugging Face API key to enable AI summaries'],
            actionItems: ['Set up HUGGINGFACE_API_KEY in server/.env file'],
            decisions: [],
        };
    }

    if (!transcriptText || transcriptText.trim().length < 50) {
        return {
            summary: 'Not enough transcript content to generate a summary.',
            keyPoints: [],
            actionItems: [],
            decisions: [],
        };
    }

    try {
        // BART has a token limit – truncate if too long (max ~1024 tokens ≈ 3000 chars)
        const truncatedText =
            transcriptText.length > 3000 ? transcriptText.substring(0, 3000) + '...' : transcriptText;

        const response = await retryRequest(() =>
            axios.post(
                `${HF_API_URL}/${SUMMARY_MODEL}`,
                {
                    inputs: truncatedText,
                    parameters: {
                        max_length: 512,
                        min_length: 50,
                        do_sample: false,
                    },
                },
                {
                    headers: getHeaders(),
                    timeout: 60000,
                }
            )
        );

        const summaryText = response.data[0]?.summary_text || '';

        // Extract structured info using heuristics
        const keyPoints = extractKeyPoints(transcriptText);
        const actionItems = extractActionItems(transcriptText);
        const decisions = extractDecisions(transcriptText);

        return {
            summary: summaryText,
            keyPoints,
            actionItems,
            decisions,
        };
    } catch (error) {
        console.error('❌ Summarization error:', error.response?.data || error.message);
        throw new Error(
            `Summarization failed: ${error.response?.data?.error || error.message}`
        );
    }
};

/**
 * Extract key discussion points from transcript (heuristic approach)
 * @param {string} text
 * @returns {string[]}
 */
const extractKeyPoints = (text) => {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    const keywords = ['important', 'key', 'main', 'focus', 'goal', 'objective', 'priority'];
    const keyPointSentences = sentences.filter((s) =>
        keywords.some((kw) => s.toLowerCase().includes(kw))
    );
    return keyPointSentences.slice(0, 5).map((s) => s.trim());
};

/**
 * Extract action items from transcript
 * @param {string} text
 * @returns {string[]}
 */
const extractActionItems = (text) => {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    const actionKeywords = ['will', 'should', 'need to', 'must', 'action', 'todo', 'follow up', 'assign'];
    const actionSentences = sentences.filter((s) =>
        actionKeywords.some((kw) => s.toLowerCase().includes(kw))
    );
    return actionSentences.slice(0, 5).map((s) => s.trim());
};

/**
 * Extract decisions from transcript
 * @param {string} text
 * @returns {string[]}
 */
const extractDecisions = (text) => {
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    const decisionKeywords = ['decided', 'agreed', 'approved', 'confirmed', 'resolved', 'concluded'];
    const decisionSentences = sentences.filter((s) =>
        decisionKeywords.some((kw) => s.toLowerCase().includes(kw))
    );
    return decisionSentences.slice(0, 5).map((s) => s.trim());
};

module.exports = {
    transcribeAudio,
    generateSummary,
};
