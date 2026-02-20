/**
 * auth.js – Shared authentication utilities
 * Used across all pages for token management and route protection
 */

const API_BASE = '';

/** Get stored JWT token */
const getToken = () => localStorage.getItem('sm_token');

/** Get stored user object */
const getUser = () => {
    try { return JSON.parse(localStorage.getItem('sm_user')); } catch { return null; }
};

/** Check if user is logged in */
const isLoggedIn = () => !!getToken();

/** Save auth data to localStorage */
const saveAuth = (token, user) => {
    localStorage.setItem('sm_token', token);
    localStorage.setItem('sm_user', JSON.stringify(user));
};

/** Clear auth data */
const clearAuth = () => {
    localStorage.removeItem('sm_token');
    localStorage.removeItem('sm_user');
};

/** Redirect to login if not authenticated */
const requireAuth = () => {
    if (!isLoggedIn()) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
};

/** Redirect to home if already authenticated */
const redirectIfLoggedIn = () => {
    if (isLoggedIn()) {
        window.location.href = '/dashboard.html';
    }
};

/** Show/hide nav elements based on auth state */
const updateNavbar = () => {
    const user = getUser();
    const navActions = document.getElementById('navActions');
    const navActionsLoggedIn = document.getElementById('navActionsLoggedIn');
    const userAvatar = document.getElementById('userAvatar');
    const navUser = document.getElementById('navUser');

    if (isLoggedIn() && user) {
        if (navActions) navActions.classList.add('hidden');
        if (navActionsLoggedIn) navActionsLoggedIn.classList.remove('hidden');
        if (userAvatar) userAvatar.textContent = user.name?.charAt(0)?.toUpperCase() || 'U';
        if (navUser) navUser.textContent = `👋 ${user.name}`;
    } else {
        if (navActions) navActions.classList.remove('hidden');
        if (navActionsLoggedIn) navActionsLoggedIn.classList.add('hidden');
    }
};

/** Logout handler */
const handleLogout = () => {
    clearAuth();
    window.location.href = '/';
};

/** API helper with JWT header */
const apiRequest = async (method, endpoint, body = null) => {
    const headers = {
        'Content-Type': 'application/json',
    };
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`/api${endpoint}`, opts);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
};

/** API helper for FormData (file upload) */
const apiUpload = async (endpoint, formData) => {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
    });
    const data = await res.json();
    return { ok: res.ok, data };
};

// ── Toast Notification System ─────────────────────────────────────────────

/**
 * Show a toast notification
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration ms
 */
const showToast = (message, type = 'info', duration = 4000) => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
    <span style="font-size:18px;">${icons[type] || 'ℹ️'}</span>
    <span>${message}</span>
  `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
};

// ── Logout button binding ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateNavbar();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
});

// Export for use in other files (window scope since no bundler)
window.SM = {
    getToken, getUser, isLoggedIn, saveAuth, clearAuth,
    requireAuth, redirectIfLoggedIn, updateNavbar, handleLogout,
    apiRequest, apiUpload, showToast,
};
