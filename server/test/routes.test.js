/**
 * Automated Safety & Regression Test Suite for Meetrix
 * Tests routing, privacy & terms pages, valid/invalid meeting IDs, 404 handling, and API health.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Set test environment before requiring server
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_routes';

const { app, server } = require('../server');

let baseUrl = '';

before(async () => {
    await new Promise((resolve) => {
        server.listen(0, () => {
            const port = server.address().port;
            baseUrl = `http://127.0.0.1:${port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
});

const get = async (path) => {
    const res = await fetch(`${baseUrl}${path}`);
    const text = await res.text();
    return { status: res.status, headers: res.headers, text };
};

describe('Meetrix Security & Route Tests', () => {

    test('Homepage (GET /) serves 200 with verification tag and legal links', async () => {
        const res = await get('/');
        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('Meetrix'));
        assert.ok(res.text.includes('google-site-verification'));
        assert.ok(res.text.includes('qEfjVSaf-S1HW1p82R_QksuueKtWnukKw8QS1qLXcZM'));
        assert.ok(res.text.includes('href="/privacy.html"'));
        assert.ok(res.text.includes('href="/terms.html"'));
        assert.ok(res.text.includes('WebRTC Direct Media'));
        assert.ok(!res.text.includes('∞')); // Exaggerated stats removed
    });

    test('Privacy Policy page (GET /privacy.html and /privacy) serves 200 with accurate disclosures', async () => {
        for (const p of ['/privacy.html', '/privacy']) {
            const res = await get(p);
            assert.strictEqual(res.status, 200);
            assert.ok(res.text.includes('Privacy Policy'));
            assert.ok(res.text.includes('WebRTC'));
            assert.ok(res.text.includes('bcrypt'));
            assert.ok(res.text.includes('shivrajsingh55444@gmail.com'));
            assert.ok(res.text.includes('Shivraj Singh'));
        }
    });

    test('Terms of Service page (GET /terms.html and /terms) serves 200 with acceptable use and disclaimers', async () => {
        for (const p of ['/terms.html', '/terms']) {
            const res = await get(p);
            assert.strictEqual(res.status, 200);
            assert.ok(res.text.includes('Terms of Service'));
            assert.ok(res.text.includes('Acceptable Use'));
            assert.ok(res.text.includes('shivrajsingh55444@gmail.com'));
            assert.ok(res.text.includes('Shivraj Singh'));
        }
    });

    test('Login and Register pages contain working Privacy and Terms links', async () => {
        for (const p of ['/login.html', '/login', '/register.html', '/register']) {
            const res = await get(p);
            assert.strictEqual(res.status, 200);
            assert.ok(res.text.includes('/privacy.html'));
            assert.ok(res.text.includes('/terms.html'));
        }
    });

    test('Meeting join page (GET /join.html and /join) contains working Privacy and Terms links', async () => {
        for (const p of ['/join.html', '/join']) {
            const res = await get(p);
            assert.strictEqual(res.status, 200);
            assert.ok(res.text.includes('/privacy.html'));
            assert.ok(res.text.includes('/terms.html'));
        }
    });

    test('Valid meeting ID format (GET /join/ABC-1X2) serves 200 join.html', async () => {
        const res = await get('/join/ABC-1X2');
        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('Join Meeting'));
    });

    test('Valid meeting ID without hyphen (GET /join/GBK7M2) serves 200 join.html', async () => {
        const res = await get('/join/GBK7M2');
        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('Join Meeting'));
    });

    test('Invalid meeting IDs return 404 (do not render deceptive join form)', async () => {
        const invalidIds = ['/join/zoom', '/join/123', '/join/fake-login', '/join/microsoft', '/join/abc'];
        for (const url of invalidIds) {
            const res = await get(url);
            assert.strictEqual(res.status, 404, `Expected 404 for ${url}, got ${res.status}`);
            assert.ok(res.text.includes('404') || res.text.includes('Not Found'));
        }
    });

    test('Unknown paths return 404 (unrestricted SPA catch-all is resolved)', async () => {
        const unknownPaths = ['/random-route-99', '/login-admin', '/secure/verify', '/phishing-test'];
        for (const url of unknownPaths) {
            const res = await get(url);
            assert.strictEqual(res.status, 404, `Expected 404 for ${url}, got ${res.status}`);
            assert.ok(res.text.includes('404') || res.text.includes('Not Found'));
        }
    });

    test('API Health endpoint (GET /api/health) returns 200 OK', async () => {
        const res = await get('/api/health');
        assert.strictEqual(res.status, 200);
        const data = JSON.parse(res.text);
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.status, 'OK');
    });

    test('Unknown API endpoint (GET /api/nonexistent) returns 404 JSON', async () => {
        const res = await get('/api/nonexistent');
        assert.strictEqual(res.status, 404);
        const data = JSON.parse(res.text);
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.message, 'API route not found');
    });

    test('Robots.txt (GET /robots.txt) serves plain-text 200 with proper directives and sitemap link', async () => {
        const res = await get('/robots.txt');
        assert.strictEqual(res.status, 200);
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('text/plain'), `Expected text/plain, got ${contentType}`);
        assert.ok(res.text.includes('User-agent: *'));
        assert.ok(res.text.includes('Allow: /'));
        assert.ok(res.text.includes('Allow: /privacy.html'));
        assert.ok(res.text.includes('Allow: /terms.html'));
        assert.ok(res.text.includes('Disallow: /api/'));
        assert.ok(res.text.includes('Sitemap: https://smart-meeting-app-3iw9.onrender.com/sitemap.xml'));
        // Confirm no private meeting tokens or meeting room paths are exposed
        assert.ok(!res.text.includes('meeting.html'));
        assert.ok(!res.text.includes('token'));
    });

    test('Sitemap.xml (GET /sitemap.xml) serves well-formed XML with exactly three canonical public URLs', async () => {
        const res = await get('/sitemap.xml');
        assert.strictEqual(res.status, 200);
        const contentType = res.headers.get('content-type') || '';
        assert.ok(contentType.includes('xml'), `Expected xml content-type, got ${contentType}`);

        // Validate well-formed XML declaration and schema namespace
        assert.ok(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'Missing XML declaration');
        assert.ok(res.text.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'Missing urlset namespace');
        assert.ok(res.text.trim().endsWith('</urlset>'), 'Sitemap must terminate with </urlset>');

        // Validate well-formed matching tag counts
        const countOccurrences = (str, sub) => (str.match(new RegExp(sub, 'g')) || []).length;
        assert.strictEqual(countOccurrences(res.text, '<url>'), 3, 'Expected exactly 3 opening <url> tags');
        assert.strictEqual(countOccurrences(res.text, '</url>'), 3, 'Expected exactly 3 closing </url> tags');
        assert.strictEqual(countOccurrences(res.text, '<loc>'), 3, 'Expected exactly 3 opening <loc> tags');
        assert.strictEqual(countOccurrences(res.text, '</loc>'), 3, 'Expected exactly 3 closing </loc> tags');

        // Extract all <loc> URLs and verify exact match
        const locMatches = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
        assert.strictEqual(locMatches.length, 3, `Expected exactly 3 URLs, found ${locMatches.length}`);

        const expectedUrls = [
            'https://smart-meeting-app-3iw9.onrender.com/',
            'https://smart-meeting-app-3iw9.onrender.com/privacy.html',
            'https://smart-meeting-app-3iw9.onrender.com/terms.html',
        ];
        assert.deepStrictEqual(locMatches.sort(), expectedUrls.sort());

        // Confirm login-only, meeting rooms, tokens, and session pages are NOT included
        assert.ok(!res.text.includes('dashboard.html'));
        assert.ok(!res.text.includes('meeting.html'));
        assert.ok(!res.text.includes('summary.html'));
        assert.ok(!res.text.includes('login.html'));
        assert.ok(!res.text.includes('register.html'));
    });

    test('Regression: Variations of robots and sitemap return 404', async () => {
        const paths = ['/robots', '/robots.html', '/sitemap', '/sitemap.html', '/sitemap.txt'];
        for (const p of paths) {
            const res = await get(p);
            assert.strictEqual(res.status, 404, `Expected 404 for ${p}, got ${res.status}`);
        }
    });

    test('Socket.IO endpoint responds correctly', async () => {
        const res = await get('/socket.io/?EIO=4&transport=polling');
        assert.strictEqual(res.status, 200);
        assert.ok(res.text.includes('sid')); // Polling handshake returns session id
    });
});
