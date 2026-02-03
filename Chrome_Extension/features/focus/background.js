// background.js

let isDistracted = false;
let statsInterval = null;
let cameraShouldBeActive = false;
let sessionStats = { focusedSeconds: 0, distractedSeconds: 0 };

async function closeOffscreen() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) {
      await chrome.offscreen.closeDocument();
      console.log("Offscreen document closed.");
    }
  } catch (e) {
    console.error("Error closing offscreen:", e);
  }
}

function startStatsTimer() {
    if (statsInterval) return;
    statsInterval = setInterval(() => {
        if (cameraShouldBeActive) {
            if (isDistracted) sessionStats.distractedSeconds++;
            else sessionStats.focusedSeconds++;

            chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: sessionStats }).catch(() => {});
        }
    }, 1000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FOCUS_UI_OPEN') {
        closeOffscreen().then(() => {
        startStatsTimer();
        sendResponse({ ok: true });
    });
        return true; 
    }

    if (message.type === 'SET_CAMERA_STATE') {
        cameraShouldBeActive = message.active;
        if (cameraShouldBeActive) {
            startStatsTimer();
        } else {
            closeOffscreen();
            isDistracted = false;
    }
        sendResponse({ ok: true });
    }

    if (message.type === 'ALARM_STATE') {
        isDistracted = message.active;
        sendResponse({ ok: true });
    }

    if (message.type === 'GET_STATS') {
        sendResponse(sessionStats);
    }

    if (message.type === 'RESET_STATS') {
        sessionStats = { focusedSeconds: 0, distractedSeconds: 0 };
        chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: sessionStats }).catch(() => {});
    }
});