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
        sendResponse({ ok: true });
    }

    if (message.type === 'ALARM_STATE') {
    isDistracted = message.active;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                type: 'DISTRACTION_VISUAL', 
                active: isDistracted 
            }).catch(() => {
                // Silently catch the "Receiving end does not exist" error
                // This happens on system pages like chrome://extensions
            });
        }
    });

    // 2. Relay back to Popup if it's open (Onscreen Square)
    chrome.runtime.sendMessage({ 
        type: 'UI_UPDATE_STATE', 
        active: isDistracted 
    }).catch(() => {});
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