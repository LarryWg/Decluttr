/**
 * Shared theme utility - applies light/dark mode across all extension pages.
 * Uses chrome.storage key: settings_theme
 */
const STORAGE_KEY_THEME = 'settings_theme';

function resolveTheme(stored) {
  if (stored === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return stored === 'light' ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export async function initTheme() {
  const result = await chrome.storage.local.get([STORAGE_KEY_THEME]);
  const stored = result[STORAGE_KEY_THEME] || 'dark';
  applyTheme(resolveTheme(stored));
}

export async function getTheme() {
  const result = await chrome.storage.local.get([STORAGE_KEY_THEME]);
  return result[STORAGE_KEY_THEME] || 'dark';
}

export async function setTheme(theme) {
  const value = ['light', 'dark', 'system'].includes(theme) ? theme : 'dark';
  await chrome.storage.local.set({ [STORAGE_KEY_THEME]: value });
  applyTheme(resolveTheme(value));
  return value;
}

export async function toggleTheme() {
  const current = await getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  await setTheme(next);
  return next;
}

// Listen for changes from other pages (e.g. email settings)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY_THEME]) {
    applyTheme(resolveTheme(changes[STORAGE_KEY_THEME].newValue || 'dark'));
  }
});
