/**
 * Email Assistant - Main JavaScript
 * Handles Gmail API integration, backend API calls, and UI management
 */

// Configuration
const DEFAULT_BACKEND_URL = 'http://localhost:3000';
const MAX_EMAILS_TO_FETCH = 20;
const STORAGE_KEY_BACKEND_URL = 'backend_url';

// DOM Element References
const backBtn = document.getElementById('backBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const backendUrlInput = document.getElementById('backendUrlInput');
const saveBackendUrlBtn = document.getElementById('saveBackendUrlBtn');
const redirectUriDisplay = document.getElementById('redirectUriDisplay');
const copyRedirectUriBtn = document.getElementById('copyRedirectUriBtn');
const logoutBtn = document.getElementById('logoutBtn');
const authSection = document.getElementById('authSection');
const connectGmailBtn = document.getElementById('connectGmailBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const successMessage = document.getElementById('successMessage');
const emailListSection = document.getElementById('emailListSection');
const emailList = document.getElementById('emailList');
const accountEmailSpan = document.getElementById('accountEmail');
const refreshBtn = document.getElementById('refreshBtn');
const emptyState = document.getElementById('emptyState');
const emailModal = document.getElementById('emailModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalSubject = document.getElementById('modalSubject');
const modalSender = document.getElementById('modalSender');
const modalDate = document.getElementById('modalDate');
const modalBodyContent = document.getElementById('modalBodyContent');
const modalAiResults = document.getElementById('modalAiResults');

// State
let currentEmails = [];
let processingEmails = new Set(); // Track which emails are being processed
let emailCache = new Map(); // Cache AI results per email ID

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Load stored settings
    await loadSettings();
    
    // Setup event listeners
    setupEventListeners();
    
    // Check authentication state and initialize UI
    await checkAuthAndInit();
});

// ============================================================================
// Event Listeners Setup
// ============================================================================

function setupEventListeners() {
    // Navigation
    backBtn.addEventListener('click', () => {
        window.location.href = '../../popup/App.html';
    });

    // Settings
    settingsBtn.addEventListener('click', () => {
        const isVisible = settingsPanel.style.display !== 'none';
        settingsPanel.style.display = isVisible ? 'none' : 'block';
    });

    saveBackendUrlBtn.addEventListener('click', async () => {
        await saveBackendUrl();
    });

    copyRedirectUriBtn.addEventListener('click', async () => {
        if (redirectUriDisplay.value) {
            try {
                await navigator.clipboard.writeText(redirectUriDisplay.value);
                showSuccess('Redirect URI copied to clipboard!');
                setTimeout(hideSuccess, 2000);
            } catch (error) {
                // Fallback: select text for manual copy
                redirectUriDisplay.select();
                document.execCommand('copy');
                showSuccess('Redirect URI selected - press Ctrl+C (or Cmd+C) to copy');
                setTimeout(hideSuccess, 2000);
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await handleLogout();
    });

    // Authentication
    connectGmailBtn.addEventListener('click', async () => {
        await handleGmailConnect();
    });

    // Email list
    refreshBtn.addEventListener('click', async () => {
        await fetchAndDisplayEmails();
    });

    // Modal
    closeModalBtn.addEventListener('click', () => {
        emailModal.style.display = 'none';
    });

    emailModal.addEventListener('click', (e) => {
        if (e.target === emailModal) {
            emailModal.style.display = 'none';
        }
    });
}

// ============================================================================
// Settings Management
// ============================================================================

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY_BACKEND_URL], (result) => {
            if (result[STORAGE_KEY_BACKEND_URL]) {
                backendUrlInput.value = result[STORAGE_KEY_BACKEND_URL];
            } else {
                backendUrlInput.value = DEFAULT_BACKEND_URL;
            }
            
            // Populate redirect URI for OAuth configuration
            try {
                const redirectUri = chrome.identity.getRedirectURL();
                const normalizedRedirectUri = redirectUri.endsWith('/') ? redirectUri : redirectUri + '/';
                redirectUriDisplay.value = normalizedRedirectUri;
            } catch (error) {
                console.error('Failed to get redirect URI:', error);
                redirectUriDisplay.value = 'Unable to get redirect URI';
            }
            
            resolve();
        });
    });
}

async function saveBackendUrl() {
    const backendUrl = backendUrlInput.value.trim();
    
    if (!backendUrl) {
        showError('Backend URL cannot be empty');
        return;
    }

    // Basic URL validation
    try {
        new URL(backendUrl);
    } catch (error) {
        showError('Invalid backend URL format');
        return;
    }

    try {
        await chrome.storage.local.set({ [STORAGE_KEY_BACKEND_URL]: backendUrl });
        showSuccess('Backend URL saved successfully');
        
        setTimeout(() => {
            settingsPanel.style.display = 'none';
        }, 1500);
    } catch (error) {
        showError('Failed to save backend URL: ' + error.message);
    }
}

async function getBackendUrl() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY_BACKEND_URL], (result) => {
            resolve(result[STORAGE_KEY_BACKEND_URL] || DEFAULT_BACKEND_URL);
        });
    });
}

// ============================================================================
// Authentication
// ============================================================================

async function checkAuthAndInit() {
    try {
        const isAuth = await isAuthenticated();
        if (isAuth) {
            // Load account email
            const email = await getStoredAccountEmail();
            if (email) {
                accountEmailSpan.textContent = email;
            }
            
            // Hide auth section, show email list section
            authSection.style.display = 'none';
            emailListSection.style.display = 'block';
            
            // Fetch emails
            await fetchAndDisplayEmails();
        } else {
            // Show auth section
            authSection.style.display = 'block';
            emailListSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        showError('Failed to check authentication status');
    }
}

async function handleGmailConnect() {
    try {
        showLoading('Connecting to Gmail...');
        hideError();
        hideSuccess();

        // Clear any existing token to force account selection
        // This ensures users can choose which account to use
        const existingToken = await new Promise((resolve) => {
            chrome.storage.local.get(['gmail_access_token'], (result) => {
                resolve(result.gmail_access_token || null);
            });
        });
        
        if (existingToken) {
            // Remove cached token to force account selection
            chrome.identity.removeCachedAuthToken({ token: existingToken }, () => {
                // Continue regardless of result
            });
            await chrome.storage.local.remove(['gmail_access_token', 'gmail_account_email']);
        }

        // Get auth token (this will trigger OAuth flow with account selection)
        const token = await getAuthToken();
        
        if (!token) {
            throw new Error('Failed to get authentication token');
        }

        // Get account email
        const email = await getStoredAccountEmail();
        if (email) {
            accountEmailSpan.textContent = email;
        }

        // Hide auth section, show email list
        authSection.style.display = 'none';
        emailListSection.style.display = 'block';
        hideLoading();

        // Fetch emails
        await fetchAndDisplayEmails();
        
        showSuccess('Successfully connected to Gmail');
        setTimeout(hideSuccess, 3000);
    } catch (error) {
        hideLoading();
        console.error('Gmail connection error:', error);
        
        if (error.message.includes('OAuth') || error.message.includes('auth')) {
            showError('Failed to authenticate with Gmail. Please try again.');
        } else {
            showError('Failed to connect to Gmail: ' + error.message);
        }
    }
}

async function handleLogout() {
    try {
        showLoading('Logging out...');
        await revokeToken();
        
        // Clear UI
        authSection.style.display = 'block';
        emailListSection.style.display = 'none';
        emailList.innerHTML = '';
        currentEmails = [];
        emailCache.clear();
        
        hideLoading();
        showSuccess('Logged out successfully');
        setTimeout(hideSuccess, 2000);
    } catch (error) {
        hideLoading();
        console.error('Logout error:', error);
        showError('Failed to logout: ' + error.message);
    }
}

// ============================================================================
// Gmail API Client Functions
// ============================================================================

/**
 * Fetch email list from Gmail API
 * @returns {Promise<Array>} Array of email message objects
 */
async function fetchEmailList() {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    // Fetch message list
    const listResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_TO_FETCH}&q=in:inbox`,
        {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!listResponse.ok) {
        if (listResponse.status === 401) {
            // Token expired, refresh and retry
            await refreshToken();
            return fetchEmailList();
        }
        throw new Error(`Gmail API error: ${listResponse.status} ${listResponse.statusText}`);
    }

    const listData = await listResponse.json();
    
    if (!listData.messages || listData.messages.length === 0) {
        return [];
    }

    // Fetch full message details for each message
    const emailPromises = listData.messages.slice(0, MAX_EMAILS_TO_FETCH).map(async (msg) => {
        try {
            return await fetchEmailDetails(msg.id, token);
        } catch (error) {
            console.error(`Failed to fetch email ${msg.id}:`, error);
            return null;
        }
    });

    const emails = await Promise.all(emailPromises);
    return emails.filter(email => email !== null);
}

/**
 * Fetch full email details from Gmail API
 * @param {string} messageId - Gmail message ID
 * @param {string} token - Access token
 * @returns {Promise<Object>} Parsed email object
 */
async function fetchEmailDetails(messageId, token) {
    const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
        {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch email: ${response.status}`);
    }

    const data = await response.json();
    return parseEmailData(data);
}

/**
 * Recursively extract email body from payload (handles nested multipart structures)
 * @param {Object} payload - Gmail API payload object
 * @returns {string} Extracted email body
 */
function extractEmailBody(payload) {
    // If this is a multipart structure, recurse into parts
    if (payload.parts && payload.parts.length > 0) {
        // Prefer text/plain, fallback to text/html
        let textPart = null;
        let htmlPart = null;
        
        for (const part of payload.parts) {
            // Handle nested multipart (multipart/alternative, multipart/related, etc.)
            if (part.mimeType && part.mimeType.startsWith('multipart/')) {
                const nestedBody = extractEmailBody(part);
                if (nestedBody) return nestedBody;
            }
            
            // Collect text and HTML parts
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                textPart = part;
            } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                htmlPart = part;
            }
        }
        
        // Return plain text if available, otherwise HTML stripped
        if (textPart) {
            return decodeBase64(textPart.body.data);
        } else if (htmlPart) {
            const html = decodeBase64(htmlPart.body.data);
            return stripHtml(html);
        }
    }
    
    // Single part email
    if (payload.body && payload.body.data) {
        if (payload.mimeType === 'text/plain') {
            return decodeBase64(payload.body.data);
        } else if (payload.mimeType === 'text/html') {
            const html = decodeBase64(payload.body.data);
            return stripHtml(html);
        }
    }
    
    return '';
}

/**
 * Parse Gmail API response into a structured email object
 * @param {Object} data - Raw Gmail API response
 * @returns {Object} Parsed email object
 */
function parseEmailData(data) {
    const headers = data.payload.headers || [];
    
    const getHeader = (name) => {
        const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
    };

    const subject = getHeader('Subject') || '(No Subject)';
    const from = getHeader('From') || 'Unknown Sender';
    const date = getHeader('Date') || new Date().toISOString();
    
    // Extract email body (prefer plain text, fallback to HTML)
    // Handle nested multipart structures recursively
    let body = extractEmailBody(data.payload);
    
    // If no body found, try direct body
    if (!body && data.payload.body && data.payload.body.data) {
        body = decodeBase64(data.payload.body.data);
    }

    // Clean up HTML entities, zero-width characters, and metadata from body text
    if (body) {
        // Remove email IDs and hashes (32-40 character hex strings at start of lines)
        body = body.replace(/^[0-9a-f]{32,40}\s+/gmi, '');
        
        // Clean HTML entities and zero-width characters
        body = body.replace(/&zwnj;/gi, '');  // Zero Width Non-Joiner
        body = body.replace(/&zwj;/gi, '');   // Zero Width Joiner
        body = body.replace(/&nbsp;/gi, ' '); // Non-breaking space
        body = body.replace(/&#8203;/g, '');   // Zero-width space
        body = body.replace(/\u200B/g, '');   // Zero-width space (Unicode)
        body = body.replace(/\u200C/g, '');   // Zero-width non-joiner (Unicode)
        body = body.replace(/\u200D/g, '');   // Zero-width joiner (Unicode)
        body = body.replace(/\uFEFF/g, '');   // Zero-width no-break space
        
        // Remove lines that look like IDs or hashes (standalone)
        body = body.replace(/^[0-9a-f]{20,}\s*$/gmi, '');
        
        // Clean up multiple spaces and newlines (but preserve single spaces between words)
        body = body.replace(/\n\s*\n/g, '\n'); // Multiple blank lines to single
        body = body.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
        body = body.trim();
        
        // Note: URLs are preserved and will be converted to clickable links in the UI
    }

    // Combine subject and body for AI processing
    const fullContent = `Subject: ${subject}\n\nFrom: ${from}\n\n${body}`;

    return {
        id: data.id,
        threadId: data.threadId,
        subject: subject,
        from: from,
        date: date,
        body: body,
        fullContent: fullContent,
        snippet: data.snippet || body.substring(0, 100) + '...'
    };
}

/**
 * Decode base64-encoded string (Gmail API uses URL-safe base64)
 * Properly handles UTF-8 encoding
 * @param {string} base64String - Base64 encoded string
 * @returns {string} Decoded string
 */
function decodeBase64(base64String) {
    try {
        // Gmail API uses URL-safe base64, convert to standard base64
        let standardBase64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
        
        // Add padding if needed
        const padding = 4 - (standardBase64.length % 4);
        if (padding !== 4) {
            standardBase64 += '='.repeat(padding);
        }
        
        // Decode base64 to binary string
        const binaryString = atob(standardBase64);
        
        // Convert binary string (Latin-1) to UTF-8 string
        // Use TextDecoder for proper UTF-8 decoding (available in Chrome extensions)
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Use TextDecoder to properly decode UTF-8
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
    } catch (error) {
        console.error('Base64 decode error:', error);
        // Fallback: try simple decode without UTF-8 handling
        try {
            const standardBase64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
            return atob(standardBase64);
        } catch (fallbackError) {
            console.error('Fallback decode also failed:', fallbackError);
            return '';
        }
    }
}

/**
 * Strip HTML tags from string and clean up HTML entities and zero-width characters
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    let text = tmp.textContent || tmp.innerText || '';
    
    // Clean up HTML entities that might not have been decoded
    text = decodeHtmlEntities(text);
    
    // Remove zero-width characters and entities
    text = text.replace(/&zwnj;/gi, '');  // Zero Width Non-Joiner
    text = text.replace(/&zwj;/gi, '');   // Zero Width Joiner
    text = text.replace(/&nbsp;/gi, ' '); // Non-breaking space (convert to regular space)
    text = text.replace(/&#8203;/g, '');  // Zero-width space (numeric entity)
    text = text.replace(/\u200B/g, '');   // Zero-width space (Unicode)
    text = text.replace(/\u200C/g, '');   // Zero-width non-joiner (Unicode)
    text = text.replace(/\u200D/g, '');   // Zero-width joiner (Unicode)
    text = text.replace(/\uFEFF/g, '');   // Zero-width no-break space
    
    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
}

/**
 * Decode HTML entities to their actual characters
 * @param {string} str - String with HTML entities
 * @returns {string} Decoded string
 */
function decodeHtmlEntities(str) {
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    return tmp.textContent || tmp.innerText || str;
}

// ============================================================================
// Backend API Calls
// ============================================================================

/**
 * Process email through backend AI API
 * @param {Object} email - Email object
 * @returns {Promise<Object>} AI analysis results
 */
async function processEmailWithAI(email) {
    const backendUrl = await getBackendUrl();
    const url = `${backendUrl}/api/email/summarize`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                emailContent: email.fullContent
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Backend error: ${response.status}`);
        }

        const result = await response.json();
        
        // Validate response structure
        if (!result.summary || !result.category) {
            throw new Error('Invalid response format from backend');
        }

        return result;
    } catch (error) {
        if (error.message.includes('fetch')) {
            throw new Error('Failed to connect to backend server. Make sure it is running.');
        }
        throw error;
    }
}

// ============================================================================
// UI Management
// ============================================================================

async function fetchAndDisplayEmails() {
    try {
        showLoading('Fetching emails...');
        hideError();
        hideSuccess();
        emailList.innerHTML = '';
        
        const emails = await fetchEmailList();
        currentEmails = emails;
        
        hideLoading();

        if (emails.length === 0) {
            emptyState.style.display = 'block';
            emailListSection.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        emailListSection.style.display = 'block';

        // Display emails
        emails.forEach(email => {
            const emailCard = createEmailCard(email);
            emailList.appendChild(emailCard);
        });

    } catch (error) {
        hideLoading();
        console.error('Fetch emails error:', error);
        
        if (error.message.includes('Not authenticated')) {
            showError('Not authenticated. Please connect your Gmail account.');
            authSection.style.display = 'block';
            emailListSection.style.display = 'none';
        } else if (error.message.includes('401')) {
            showError('Authentication expired. Please reconnect your Gmail account.');
            authSection.style.display = 'block';
            emailListSection.style.display = 'none';
        } else {
            showError('Failed to fetch emails: ' + error.message);
        }
    }
}

function createEmailCard(email) {
    const card = document.createElement('div');
    card.className = 'emailCard';
    card.dataset.emailId = email.id;

    // Check if we have cached AI results
    const cachedResults = emailCache.get(email.id);
    const category = cachedResults ? cachedResults.category : null;
    const hasUnsubscribe = cachedResults ? cachedResults.hasUnsubscribe : false;

    // Format date (relative time)
    const dateStr = formatDate(email.date);

    card.innerHTML = `
        <div class="emailCardHeader">
            <div class="emailSubject">${escapeHtml(email.subject)}</div>
            <div class="emailDate">${dateStr}</div>
        </div>
        <div class="emailSender">${escapeHtml(email.from)}</div>
        <div class="emailPreview">${escapeHtml(email.snippet)}</div>
        <div class="emailActions">
            ${category ? `<span class="categoryBadge ${category.toLowerCase()}">${category}</span>` : ''}
            ${hasUnsubscribe ? '<span class="unsubscribeBadge">Unsubscribe Available</span>' : ''}
            <button class="button small processEmailBtn" style="margin-top: 8px; width: 100%;">Process with AI</button>
            <button class="button small viewEmailBtn" style="margin-top: 4px; width: 100%;">View Details</button>
        </div>
    `;

    // Add event listeners
    const processBtn = card.querySelector('.processEmailBtn');
    const viewBtn = card.querySelector('.viewEmailBtn');

    processBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleProcessEmail(email, card);
    });

    viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showEmailModal(email);
    });

    return card;
}

async function handleProcessEmail(email, card) {
    // Prevent duplicate processing
    if (processingEmails.has(email.id)) {
        return;
    }

    try {
        processingEmails.add(email.id);
        const processBtn = card.querySelector('.processEmailBtn');
        const originalText = processBtn.textContent;
        processBtn.textContent = 'Processing...';
        processBtn.disabled = true;

        // Check cache first
        let results = emailCache.get(email.id);
        
        if (!results) {
            // Process with AI
            results = await processEmailWithAI(email);
            emailCache.set(email.id, results);
        }

        // Update card with results
        updateEmailCardWithResults(card, results);

        processingEmails.delete(email.id);
        processBtn.textContent = originalText;
        processBtn.disabled = false;
        processBtn.style.display = 'none'; // Hide button after processing

    } catch (error) {
        processingEmails.delete(email.id);
        const processBtn = card.querySelector('.processEmailBtn');
        processBtn.textContent = 'Process with AI';
        processBtn.disabled = false;
        
        console.error('Process email error:', error);
        showError('Failed to process email: ' + error.message);
    }
}

function updateEmailCardWithResults(card, results) {
    const actionsDiv = card.querySelector('.emailActions');
    
    // Remove existing badges
    const existingBadges = actionsDiv.querySelectorAll('.categoryBadge, .unsubscribeBadge, .aiSummary');
    existingBadges.forEach(badge => badge.remove());

    // Add category badge
    if (results.category) {
        const categoryBadge = document.createElement('span');
        categoryBadge.className = `categoryBadge ${results.category.toLowerCase()}`;
        categoryBadge.textContent = results.category;
        actionsDiv.insertBefore(categoryBadge, actionsDiv.firstChild);
    }

    // Add unsubscribe badge/link
    if (results.hasUnsubscribe) {
        const unsubscribeBadge = document.createElement('span');
        unsubscribeBadge.className = 'unsubscribeBadge';
        unsubscribeBadge.textContent = 'Unsubscribe Available';
        actionsDiv.appendChild(unsubscribeBadge);

        if (results.unsubscribeLink) {
            const unsubscribeLink = document.createElement('a');
            unsubscribeLink.href = results.unsubscribeLink;
            unsubscribeLink.target = '_blank';
            unsubscribeLink.className = 'unsubscribeLink';
            unsubscribeLink.textContent = 'Click to Unsubscribe';
            actionsDiv.appendChild(unsubscribeLink);
        }
    }

    // Add summary (collapsible)
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'aiSummary';
    summaryDiv.innerHTML = `<strong>Summary:</strong> ${escapeHtml(results.summary)}`;
    actionsDiv.appendChild(summaryDiv);
}

function showEmailModal(email) {
    modalSubject.textContent = email.subject;
    modalSender.textContent = `From: ${email.from}`;
    modalDate.textContent = `Date: ${formatDate(email.date)}`;
    // Convert URLs to clickable links with domain names
    modalBodyContent.innerHTML = convertUrlsToLinks(email.body);

    // Check for cached AI results
    const cachedResults = emailCache.get(email.id);
    
    if (cachedResults) {
        modalAiResults.innerHTML = `
            <h4>AI Analysis</h4>
            <div class="aiResults">
                <div class="categoryBadge ${cachedResults.category.toLowerCase()}" style="margin-bottom: 10px;">
                    ${cachedResults.category}
                </div>
                <div class="aiSummary">
                    <strong>Summary:</strong><br>
                    ${escapeHtml(cachedResults.summary)}
                </div>
                ${cachedResults.hasUnsubscribe ? `
                    <div style="margin-top: 10px;">
                        <span class="unsubscribeBadge">Unsubscribe Available</span>
                        ${cachedResults.unsubscribeLink ? `
                            <a href="${cachedResults.unsubscribeLink}" target="_blank" class="unsubscribeLink" style="display: block; margin-top: 8px;">
                                Click to Unsubscribe
                            </a>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        // Show process button in modal
        modalAiResults.innerHTML = `
            <h4>AI Analysis</h4>
            <button class="button primary" id="processInModalBtn">Process with AI</button>
        `;
        
        document.getElementById('processInModalBtn').addEventListener('click', async () => {
            try {
                const results = await processEmailWithAI(email);
                emailCache.set(email.id, results);
                showEmailModal(email); // Refresh modal with results
            } catch (error) {
                showError('Failed to process email: ' + error.message);
            }
        });
    }

    emailModal.style.display = 'flex';
}

// ============================================================================
// Utility Functions
// ============================================================================

function showLoading(message = 'Loading...') {
    loadingSpinner.querySelector('p').textContent = message;
    loadingSpinner.style.display = 'block';
}

function hideLoading() {
    loadingSpinner.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
        errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    setTimeout(() => {
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function hideSuccess() {
    successMessage.style.display = 'none';
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    } catch (error) {
        return dateString;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Convert URLs in text to clickable links with domain names as text
 * @param {string} text - Text that may contain URLs
 * @returns {string} HTML with clickable links
 */
function convertUrlsToLinks(text) {
    if (!text) return '';
    
    // Escape HTML to prevent XSS
    const escaped = escapeHtml(text);
    
    // URL regex pattern (matches http://, https://, and www.)
    const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
    
    return escaped.replace(urlRegex, (url) => {
        // Ensure URL has protocol
        let fullUrl = url;
        if (url.startsWith('www.')) {
            fullUrl = 'https://' + url;
        }
        
        try {
            // Extract domain name from URL
            const urlObj = new URL(fullUrl);
            let domain = urlObj.hostname;
            
            // Remove www. prefix for cleaner display
            domain = domain.replace(/^www\./i, '');
            
            // Create clickable link with domain name as text
            return `<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="emailLink">${escapeHtml(domain)}</a>`;
        } catch (e) {
            // If URL parsing fails, just escape and return the original
            return escapeHtml(url);
        }
    });
}
