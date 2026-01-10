// background.js

// Listens for a message from the popup script.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getGmailData") {
    console.log("Background script received request to get Gmail data.");
    getGmailAuthToken();
    sendResponse({ status: "Authentication process started." });
  }
  return true; // Indicates you will send a response asynchronously.
});

function getGmailAuthToken() {
  // The 'interactive': true option will prompt the user to sign in and grant consent
  // if they haven't already.
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError || !token) {
      console.error("Failed to get auth token:", chrome.runtime.lastError.message);
      return;
    }
    console.log("Successfully received Access Token:", token);
    // Now that we have a token, we can make a request to the Gmail API.
    fetchGmailMessages(token);
  });
}

function fetchGmailMessages(accessToken) {
  // Using the fetch API to call the Gmail endpoint.
  // This example fetches a list of the user's message IDs.
  fetch('https://www.googleapis.com/gmail/v1/users/me/messages', {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  })
  .then(response => {
    // Check if the request was successful.
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log("Gmail API Response:", data);
    // You can now process the data. For example, send it to the popup or store it.
    // Example: chrome.storage.local.set({ messages: data.messages });
  })
  .catch(error => {
    console.error("Error fetching Gmail messages:", error);
  });
}
