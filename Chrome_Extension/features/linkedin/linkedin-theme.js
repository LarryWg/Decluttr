/**
 * Apply theme on LinkedIn page load (external script so CSP allows it).
 * Reads settings_theme from chrome.storage and sets data-theme on <html>.
 */
(function() {
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  function resolveTheme(stored) {
    if (stored === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return stored === 'light' ? 'light' : 'dark';
  }
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['settings_theme'], function(result) {
      var stored = result && result.settings_theme ? result.settings_theme : 'system';
      applyTheme(resolveTheme(stored));
    });
    chrome.storage.onChanged.addListener(function(changes, area) {
      if (area === 'local' && changes.settings_theme) {
        var stored = changes.settings_theme.newValue || 'system';
        applyTheme(resolveTheme(stored));
      }
    });
  } else {
    applyTheme('light');
  }
})();
