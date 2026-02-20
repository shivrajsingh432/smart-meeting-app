/**
 * registerPage.js – Register form handler
 */
document.addEventListener('DOMContentLoaded', () => {
    window.SM.redirectIfLoggedIn();

    const form = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const registerBtnText = document.getElementById('registerBtnText');
    const registerSpinner = document.getElementById('registerSpinner');
    const pwToggle = document.getElementById('pwToggle');
    const pwInput = document.getElementById('password');

    if (pwToggle && pwInput) {
        pwToggle.addEventListener('click', () => {
            pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;

        if (!name || !email || !password) {
            return window.SM.showToast('Please fill in all fields.', 'warning');
        }
        if (password.length < 6) {
            return window.SM.showToast('Password must be at least 6 characters.', 'warning');
        }

        registerBtnText.textContent = 'Creating account...';
        registerSpinner.classList.remove('hidden');
        registerBtn.disabled = true;

        const { ok, data } = await window.SM.apiRequest('POST', '/auth/register', { name, email, password });

        registerBtnText.textContent = 'Create Account';
        registerSpinner.classList.add('hidden');
        registerBtn.disabled = false;

        if (ok) {
            window.SM.saveAuth(data.token, data.user);
            window.SM.showToast('Account created! Redirecting...', 'success');
            setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
        } else {
            window.SM.showToast(data.message || 'Registration failed.', 'error');
        }
    });
});
