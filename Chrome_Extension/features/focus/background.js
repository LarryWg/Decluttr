// background.js

async function setupOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: 'features/focus/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'To monitor eye tracking for focus mode in the background.'
    });
  } catch (e) {
    console.log('Offscreen setup skipped:', e.message);
  }
}

async function closeOffscreen() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.offscreen.closeDocument();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FOCUS_UI_OPEN') {
    closeOffscreen().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true; // async response
  }
  if (message.type === 'FOCUS_UI_CLOSED') {
    setupOffscreen().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (message.type === 'ALARM_STATE') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.url.startsWith("http")) {
        chrome.scripting.executeScript({
          target: {tabId: activeTab.id},
          func: (active) => {
            const id = 'decluttr-distraction-overlay';
            let el = document.getElementById(id);
            if (active) {
              if (!el) {
                el = document.createElement('div');
                el.id = id;
                el.className = 'decluttr-distraction-overlay';
                el.innerHTML = '<div class="decluttr-distraction-card"><div class="decluttr-distraction-icon">👀</div><p class="decluttr-distraction-title">Look at your screen</p><p class="decluttr-distraction-sub">Stay focused — you\'ve been looking away</p></div>';
                document.body.appendChild(el);
              }
              el.classList.add('decluttr-distraction-visible');
            } else {
              if (el) el.classList.remove('decluttr-distraction-visible');
            }
          },
          args: [message.active]
        }).catch(() => {});
      }
    });
  }
});

chrome.runtime.onStartup.addListener(setupOffscreen);
chrome.runtime.onInstalled.addListener(setupOffscreen);