// background.js

async function setupOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'To monitor eye tracking for focus mode in the background.'
  });
}

chrome.runtime.onStartup.addListener(setupOffscreen);
chrome.runtime.onInstalled.addListener(setupOffscreen);

//Wait for look away alert from AI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ALARM_STATE') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const activeTab = tabs[0];
      // Only inject into actual websites (ignores chrome:// pages)
      if (activeTab && activeTab.url.startsWith("http")) {
        chrome.scripting.executeScript({
          target: {tabId: activeTab.id},
          func: (state) => {
            if (state) {
              document.body.classList.add('alert-active-global');
            } else {
              document.body.classList.remove('alert-active-global');
            }
          },
          args: [message.active]
        }).catch(err => console.log("Alert blocked on this page."));
      }
    });
  }
});