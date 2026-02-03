import { initTheme, toggleTheme } from '../utils/theme.js';

// SVG icons for theme toggle
const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

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
    btn.innerHTML = effective === 'dark' ? moonIcon : sunIcon;
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
