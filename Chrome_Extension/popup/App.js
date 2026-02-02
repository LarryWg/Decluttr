import { initTheme, toggleTheme } from '../utils/theme.js';

// Init theme and toggle button
initTheme().then(updateThemeIcon);
document.getElementById('themeToggle')?.addEventListener('click', async () => {
    await toggleTheme();
    updateThemeIcon();
});
function updateThemeIcon() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const effective = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.textContent = effective === 'dark' ? '🌙' : '☀️';
    btn.title = effective === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

// Start background tracking when main UI opens (user not in Focus)
chrome.runtime.sendMessage({ type: 'FOCUS_UI_CLOSED' });

// Buttons open feature pages (in popup)
document.getElementById("emailBtn").addEventListener("click", () => {
    window.location.href = "../features/email/email.html";
});

document.getElementById("linkedinBtn").addEventListener("click", () => {
    window.location.href = "../features/linkedin/linkedin.html";
});

document.getElementById("focusBtn").addEventListener("click", () => {
    window.location.href = "../features/focus/focus.html";
});
