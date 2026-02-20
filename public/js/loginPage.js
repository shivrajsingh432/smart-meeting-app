/**
 * loginPage.js – Login form handler
 */
document.addEventListener('DOMContentLoaded', () => {
    // Redirect if already logged in
    window.SM.redirectIfLoggedIn();

    const form = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    const loginSpinner = document.getElementById('loginSpinner');
    const pwToggle = document.getElementById('pwToggle');
    const pwInput = document.getElementById('password');

    // Password visibility toggle
    if (pwToggle && pwInput) {
        pwToggle.addEventListener('click', () => {
            pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!email || !password) {
            return window.SM.showToast('Please fill in all fields.', 'warning');
        }

        // Show loading state
        loginBtnText.textContent = 'Signing in...';
        loginSpinner.classList.remove('hidden');
        loginBtn.disabled = true;

        const { ok, data } = await window.SM.apiRequest('POST', '/auth/login', { email, password });

        loginBtnText.textContent = 'Sign In';
        loginSpinner.classList.add('hidden');
        loginBtn.disabled = false;

        if (ok) {
            window.SM.saveAuth(data.token, data.user);
            window.SM.showToast('Login successful! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            window.SM.showToast(data.message || 'Login failed. Check your credentials.', 'error');
        }
    });
});
