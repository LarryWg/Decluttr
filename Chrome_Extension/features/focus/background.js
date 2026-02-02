// background.js

import { FilesetResolver } from "./lib/vision_bundle";


// --- Global Variables ---
let isDistracted = false;
let statsInterval = null;
let cameraShouldBeActive = false;
let sessionStats = {
    focusedSeconds: 0,
    distractedSeconds: 0,
}

function startStatsTimer() {
  if (statsInterval) return;
  statsInterval = setInterval(() => {
    if (cameraShouldBeActive) {
        if (isDistracted) {
            sessionStats.distractedSeconds++;
        } else {
            sessionStats.focusedSeconds++;
        }
    }

    chrome.runtime.sendMessage({
      type: 'STATS_UPDATE',
      stats: sessionStats
    }).catch(() => {});
  }, 1000);
}

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

// --- Chrome Listeners ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FOCUS_UI_OPEN') {
    closeOffscreen()
      .then(() => {
        startStatsTimer();
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true; 
  }

  if (message.type === 'FOCUS_UI_CLOSED') {
    // Only start background tracking if the user hasn't hidden the camera
    if (cameraShouldBeActive) {
      setupOffscreen();
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'SET_CAMERA_STATE') {
    cameraShouldBeActive = message.active;
    if (!cameraShouldBeActive) {
      closeOffscreen();
    } else {
    sendResponse({ ok: false, reason: 'Camera was not enabled by user' });
    }
    return true;
  }

  if (message.type === 'RESET_STATS') {
    isDistracted = message.active;
    sessionStats.focusedSeconds = 0;
    sessionStats.distractedSeconds = 0;
    chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: sessionStats }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'ALARM_STATE') {
    isDistracted = message.active;
    
    // Manage the distraction overlay on the active tab
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

  if (message.type === 'GET_STATS') {
    sendResponse(sessionStats);
  }
});


chrome.runtime.onStartup.addListener(setupOffscreen);
chrome.runtime.onInstalled.addListener(setupOffscreen);