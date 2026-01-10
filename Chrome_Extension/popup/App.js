// popup/App.js

document.addEventListener('DOMContentLoaded', () => {
  const connectButton = document.getElementById('connectGmailButton');

  if (connectButton) {
    connectButton.addEventListener('click', () => {
      console.log("Button clicked. Sending message to background script.");
      // Send a message to the background script to initiate the action.
      chrome.runtime.sendMessage({ action: "getGmailData" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
        } else {
            console.log("Response from background:", response.status);
            // You can update the popup UI here, e.g., show a "Loading..." message.
            connectButton.textContent = "Fetching...";
            connectButton.disabled = true;
        }
      });
    });
  }
});
