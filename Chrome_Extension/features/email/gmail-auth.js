/**
 * Gmail OAuth Authentication Handler
 * Uses Chrome Identity API for OAuth token management
 */

const STORAGE_KEY_TOKEN = 'gmail_access_token';
const STORAGE_KEY_ACCOUNT = 'gmail_account_email';

/**
 * Get Gmail OAuth token using Chrome Identity API
 * Uses chrome.identity.launchWebAuthFlow for Gmail API with custom scopes
 * The redirect URI must be configured in Google Cloud Console OAuth client
 * @returns {Promise<string>} Access token
 */
async function getAuthToken() {
  return new Promise(async (resolve, reject) => {
    // Check if we have a stored token first
    chrome.storage.local.get([STORAGE_KEY_TOKEN], async (result) => {
      if (result[STORAGE_KEY_TOKEN]) {
        // Verify token is still valid by attempting a simple API call
        try {
          const isValid = await verifyToken(result[STORAGE_KEY_TOKEN]);
          if (isValid) {
            resolve(result[STORAGE_KEY_TOKEN]);
            return;
          }
        } catch (error) {
          // Token invalid, continue to get new token
          console.log('Stored token invalid, refreshing...');
        }
      }

      try {
        // Get redirect URI for Chrome extension
        // chrome.identity.getRedirectURL() returns: https://<extension-id>.chromiumapp.org/
        const redirectUri = chrome.identity.getRedirectURL();
        
        // Get client ID from manifest
        const manifest = chrome.runtime.getManifest();
        const clientId = manifest?.oauth2?.client_id;
        
        if (!clientId || clientId.includes('YOUR_GOOGLE_CLIENT_ID')) {
          reject(new Error('OAuth client ID not configured. Please set it in manifest.json oauth2.client_id field'));
          return;
        }

        console.log('OAuth Redirect URI:', redirectUri);
        console.log('Make sure this URI is added to your Google Cloud Console OAuth client');

        // Build OAuth URL for Gmail API
        // Add prompt=select_account to allow users to choose which Google account to use
        const scope = 'https://www.googleapis.com/auth/gmail.readonly';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(clientId)}&` +
          `response_type=token&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scope)}&` +
          `prompt=select_account`;

        // Launch OAuth flow
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl,
            interactive: true
          },
          async (responseUrl) => {
            if (chrome.runtime.lastError) {
              const errorMsg = chrome.runtime.lastError.message;
              console.error('OAuth flow error:', errorMsg);
              
              if (errorMsg.includes('invalid_request') || errorMsg.includes('400') || errorMsg.includes('redirect_uri_mismatch')) {
                reject(new Error(`Redirect URI mismatch!\n\nPlease add this EXACT redirect URI to your Google Cloud Console:\n\n${redirectUri}\n\nSteps:\n1. Go to Google Cloud Console > APIs & Services > Credentials\n2. Click your OAuth 2.0 Client ID\n3. Under "Authorized redirect URIs", click "ADD URI"\n4. Paste: ${redirectUri}\n5. Click "Save"\n6. Reload extension and try again`));
              } else {
                reject(new Error('OAuth error: ' + errorMsg));
              }
              return;
            }

            if (!responseUrl) {
              reject(new Error('OAuth flow cancelled or failed'));
              return;
            }

            // Check for error in response URL
            const errorMatch = responseUrl.match(/[#&]error=([^&]*)/);
            if (errorMatch) {
              const error = errorMatch[1];
              const errorDescMatch = responseUrl.match(/[#&]error_description=([^&]*)/);
              const errorDesc = errorDescMatch ? decodeURIComponent(errorDescMatch[1].replace(/\+/g, ' ')) : '';
              
              console.error('OAuth error in response:', error, errorDesc);
              
              if (error === 'access_denied') {
                reject(new Error('Access denied. Please grant Gmail access permission.'));
              } else if (error === 'invalid_request' || error === 'redirect_uri_mismatch') {
                reject(new Error(`Redirect URI mismatch!\n\nPlease add this EXACT redirect URI to Google Cloud Console:\n\n${redirectUri}\n\nSteps:\n1. Google Cloud Console > APIs & Services > Credentials\n2. Click your OAuth Client ID\n3. Under "Authorized redirect URIs", add: ${redirectUri}\n4. Save and reload extension`));
              } else {
                reject(new Error('OAuth error: ' + error + (errorDesc ? ' - ' + errorDesc : '')));
              }
              return;
            }

            // Extract access token from callback URL
            // Format: https://<extension-id>.chromiumapp.org/#access_token=TOKEN&token_type=Bearer&expires_in=3600
            const tokenMatch = responseUrl.match(/[#&]access_token=([^&]*)/);
            if (!tokenMatch || !tokenMatch[1]) {
              console.error('Failed to extract token from response URL');
              reject(new Error('Failed to extract access token from OAuth response. Please check console for details.'));
              return;
            }

            const token = decodeURIComponent(tokenMatch[1]);

            // Store token for future use
            try {
              await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
              
              // Get user email from token (optional, for display)
              const email = await getAccountEmail(token);
              if (email) {
                await chrome.storage.local.set({ [STORAGE_KEY_ACCOUNT]: email });
              }

              resolve(token);
            } catch (error) {
              // Even if storage fails, return token (it's valid)
              console.warn('Failed to store token:', error);
              resolve(token);
            }
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  });
}


/**
 * Verify if a token is still valid by making a test API call
 * @param {string} token - Access token to verify
 * @returns {Promise<boolean>} True if token is valid
 */
async function verifyToken(token) {
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      // Token expired or invalid
      return false;
    }

    return response.ok;
  } catch (error) {
    console.error('Token verification error:', error);
    return false;
  }
}

/**
 * Get user's Gmail account email from token
 * @param {string} token - Access token
 * @returns {Promise<string|null>} User email or null
 */
async function getAccountEmail(token) {
  try {
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.emailAddress || null;
  } catch (error) {
    console.error('Failed to get account email:', error);
    return null;
  }
}

/**
 * Refresh the access token
 * @returns {Promise<string>} New access token
 */
async function refreshToken() {
  // Remove old token and cached auth
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_TOKEN], (result) => {
      if (result[STORAGE_KEY_TOKEN]) {
        // Remove cached token from Chrome Identity API
        chrome.identity.removeCachedAuthToken({ token: result[STORAGE_KEY_TOKEN] }, () => {
          // Continue regardless of result
          chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_ACCOUNT], () => {
            // Get new token (this will trigger OAuth flow)
            getAuthToken().then(resolve).catch(resolve);
          });
        });
      } else {
        // No token to remove, just get new one
        chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_ACCOUNT], () => {
          getAuthToken().then(resolve).catch(resolve);
        });
      }
    });
  });
}

/**
 * Revoke token and sign out
 * @returns {Promise<void>}
 */
async function revokeToken() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORAGE_KEY_TOKEN], async (result) => {
      if (!result[STORAGE_KEY_TOKEN]) {
        resolve();
        return;
      }

      const token = result[STORAGE_KEY_TOKEN];

      // Revoke token from Google (optional - we'll just clear local storage)
      // Note: For launchWebAuthFlow tokens, we don't have a direct revoke API
      // The token will expire naturally
      
      // Clear stored token
      chrome.storage.local.remove([STORAGE_KEY_TOKEN, STORAGE_KEY_ACCOUNT], () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if authenticated
 */
async function isAuthenticated() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_TOKEN], async (result) => {
      if (!result[STORAGE_KEY_TOKEN]) {
        resolve(false);
        return;
      }

      // Verify token is still valid
      const isValid = await verifyToken(result[STORAGE_KEY_TOKEN]);
      resolve(isValid);
    });
  });
}

/**
 * Get stored account email
 * @returns {Promise<string|null>} Account email or null
 */
async function getStoredAccountEmail() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY_ACCOUNT], (result) => {
      resolve(result[STORAGE_KEY_ACCOUNT] || null);
    });
  });
}

// Export functions for use in email.js
// Chrome Extension context: attach to window for global access
if (typeof window !== 'undefined') {
  // Make functions available both as window.gmailAuth.* and as globals
  window.gmailAuth = {
    getAuthToken,
    refreshToken,
    revokeToken,
    isAuthenticated,
    getStoredAccountEmail,
    verifyToken
  };
  
  // Also attach directly to window for easier access (email.js can call directly)
  window.getAuthToken = getAuthToken;
  window.refreshToken = refreshToken;
  window.revokeToken = revokeToken;
  window.isAuthenticated = isAuthenticated;
  window.getStoredAccountEmail = getStoredAccountEmail;
  window.verifyToken = verifyToken;
}

// Node.js context: export as module
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAuthToken,
    refreshToken,
    revokeToken,
    isAuthenticated,
    getStoredAccountEmail,
    verifyToken
  };
}

