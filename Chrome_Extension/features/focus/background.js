// background.js

let isDistracted = false;
let statsInterval = null;
let cameraShouldBeActive = false;
let sessionStats = { focusedSeconds: 0, distractedSeconds: 0 };

const STORAGE_KEY_CAMERA = 'focus_cameraActive';
const STORAGE_KEY_STATS = 'focus_sessionStats';

async function persistSessionState() {
    await chrome.storage.session.set({
        [STORAGE_KEY_CAMERA]: cameraShouldBeActive,
        [STORAGE_KEY_STATS]: sessionStats
    });
}

async function loadSessionState() {
    const raw = await chrome.storage.session.get([STORAGE_KEY_CAMERA, STORAGE_KEY_STATS]);
    if (raw[STORAGE_KEY_CAMERA] === true) cameraShouldBeActive = true;
    if (raw[STORAGE_KEY_STATS] && typeof raw[STORAGE_KEY_STATS].focusedSeconds === 'number')
        sessionStats = raw[STORAGE_KEY_STATS];
}

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

// --- Listeners ---
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
        persistSessionState().then(() => sendResponse({ ok: true }));
        return true;
    }

    if (message.type === 'ALARM_STATE') {
        isDistracted = message.active;
        // 1. Show overlay on all web tabs in current window (so it shows no matter which tab is active)
        chrome.tabs.query({ currentWindow: true }, async (tabs) => {
            const webTabs = tabs.filter(t => {
                const u = t.url || '';
                return u.startsWith('http://') || u.startsWith('https://');
            });
            const payload = { type: 'DISTRACTION_VISUAL', active: isDistracted };
            for (const tab of webTabs) {
                if (!tab?.id) continue;
                try {
                    await chrome.tabs.sendMessage(tab.id, payload);
                } catch (err) {
                    try {
                        await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            files: ['features/focus/red_alert.js']
                        });
                        await new Promise(r => setTimeout(r, 50));
                        await chrome.tabs.sendMessage(tab.id, payload);
                    } catch (e) {
                        console.log('Distraction overlay could not be shown in tab:', tab.id, e?.message);
                    }
                }
            }
        });
        // 2. Relay to popup (onscreen red square)
        chrome.runtime.sendMessage({
            type: 'UI_UPDATE_STATE',
            active: isDistracted
        }).catch(() => {});
        sendResponse({ ok: true });
        return;
    }

    if (message.type === 'GET_CAMERA_STATE') {
        loadSessionState().then(() => {
            sendResponse({ active: cameraShouldBeActive });
        });
        return true;
    }

    if (message.type === 'GET_STATS') {
        loadSessionState().then(() => sendResponse(sessionStats));
        return true;
    }

    if (message.type === 'RESET_STATS') {
        sessionStats = { focusedSeconds: 0, distractedSeconds: 0 };
        chrome.runtime.sendMessage({ type: 'STATS_UPDATE', stats: sessionStats }).catch(() => {});
        persistSessionState().then(() => sendResponse({ ok: true }));
        return true;
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "popup") {
        port.onDisconnect.addListener(async () => {
            // Check if the camera was supposed to be active when the popup closed
            if (cameraShouldBeActive) {
                console.log("Popup closed: Initializing background camera...");
                setTimeout(async () => {
                    await setupOffscreen();
                }, 500);
            }
        });
    }
});

async function setupOffscreen() {
    // Check if it already exists to avoid errors
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
        try {
        await chrome.offscreen.createDocument({
            url: 'features/focus/offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Continue eye tracking while popup is closed'
        });
        console.log(" Offscreen document created successfully.");
        } catch (error) {
            console.error("Failed to create offscreen document:", error);
        }
    }
}