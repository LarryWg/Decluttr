/**
 * Gmail API Service - Handles Gmail API calls
 */
import { MAX_EMAILS_TO_FETCH, STORAGE_KEY_JOB_LABEL_ID, JOB_LABEL_NAME, CUSTOM_LABEL_PREFIX } from '../config/constants.js';
import { EmailParserService } from './EmailParserService.js';

export class GmailApiService {
    constructor() {
        this.parser = new EmailParserService();
    }

    /**
     * Fetch message IDs only (lightweight; no full details).
     * @param {string|null} pageToken - Optional page token for pagination
     * @returns {Promise<{messageIds: string[], nextPageToken: string|null}>}
     */
    async fetchMessageIds(pageToken = null) {
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_TO_FETCH}&q=in:inbox`;
        if (pageToken) {
            url += `&pageToken=${pageToken}`;
        }
        const listResponse = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listResponse.ok) {
            if (listResponse.status === 401) {
                await refreshToken();
                return this.fetchMessageIds(pageToken);
            }
            throw new Error(`Gmail API error: ${listResponse.status} ${listResponse.statusText}`);
        }
        const listData = await listResponse.json();
        const messageIds = (listData.messages || []).map((msg) => msg.id);
        return {
            messageIds,
            nextPageToken: listData.nextPageToken || null
        };
    }

    /**
     * Fetch full details for a list of message IDs (for incremental load: new IDs only).
     * @param {string[]} messageIds - Gmail message IDs
     * @returns {Promise<Object[]>} Parsed email objects
     */
    async fetchEmailsByIds(messageIds) {
        if (!messageIds || messageIds.length === 0) {
            return [];
        }
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        const results = await Promise.all(
            messageIds.map(async (id) => {
                try {
                    return await this.fetchEmailDetails(id, token);
                } catch (error) {
                    console.error(`Failed to fetch email ${id}:`, error);
                    return null;
                }
            })
        );
        return results.filter((e) => e !== null);
    }

    /**
     * Fetch email list from Gmail API
     * @param {string} pageToken - Optional page token for pagination
     * @returns {Promise<{emails: Array, nextPageToken: string|null}>} Object with emails array and next page token
     */
    async fetchEmailList(pageToken = null) {
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }

        // Build URL with pagination
        let url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${MAX_EMAILS_TO_FETCH}&q=in:inbox`;
        if (pageToken) {
            url += `&pageToken=${pageToken}`;
        }

        // Fetch message list
        const listResponse = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!listResponse.ok) {
            if (listResponse.status === 401) {
                // Token expired, refresh and retry
                await refreshToken();
                return this.fetchEmailList(pageToken);
            }
            throw new Error(`Gmail API error: ${listResponse.status} ${listResponse.statusText}`);
        }

        const listData = await listResponse.json();
        
        if (!listData.messages || listData.messages.length === 0) {
            return { emails: [], nextPageToken: null };
        }

        // Fetch full message details for each message
        const emailPromises = listData.messages.map(async (msg) => {
            try {
                return await this.fetchEmailDetails(msg.id, token);
            } catch (error) {
                console.error(`Failed to fetch email ${msg.id}:`, error);
                return null;
            }
        });

        const emails = await Promise.all(emailPromises);
        const validEmails = emails.filter(email => email !== null);
        
        return {
            emails: validEmails,
            nextPageToken: listData.nextPageToken || null
        };
    }

    /**
     * Fetch full email details from Gmail API
     * @param {string} messageId - Gmail message ID
     * @param {string} token - Access token
     * @returns {Promise<Object>} Parsed email object
     */
    async fetchEmailDetails(messageId, token) {
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
        return this.parser.parseEmailData(data);
    }

    /**
     * Fetch full email details by ID (gets token internally). Use for View Details when body is missing.
     * @param {string} messageId - Gmail message ID
     * @returns {Promise<Object>} Parsed email object with body, fullContent, etc.
     */
    async fetchEmailDetailsById(messageId) {
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        return this.fetchEmailDetails(messageId, token);
    }

    async getOrCreateJobLabel() {
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listRes.ok) {
            if (listRes.status === 401) {
                await refreshToken();
                return this.getOrCreateJobLabel();
            }
            throw new Error(`Gmail labels list failed: ${listRes.status}`);
        }
        const listData = await listRes.json();
        const labels = listData.labels || [];

        const stored = await new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY_JOB_LABEL_ID], (r) => resolve(r[STORAGE_KEY_JOB_LABEL_ID] || null));
        });
        if (stored && labels.some((l) => l.id === stored)) {
            return stored;
        }
        if (stored) {
            await new Promise((resolve) => {
                chrome.storage.local.remove([STORAGE_KEY_JOB_LABEL_ID], resolve);
            });
        }

        const found = labels.find((l) => l.name === JOB_LABEL_NAME);
        if (found) {
            await new Promise((resolve) => {
                chrome.storage.local.set({ [STORAGE_KEY_JOB_LABEL_ID]: found.id }, resolve);
            });
            return found.id;
        }
        const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: JOB_LABEL_NAME })
        });
        if (!createRes.ok) {
            if (createRes.status === 401) {
                await refreshToken();
                return this.getOrCreateJobLabel();
            }
            const errBody = await createRes.text().catch(() => '');
            throw new Error(`Gmail label create failed: ${createRes.status} ${errBody.slice(0, 100)}`);
        }
        const createData = await createRes.json();
        const labelId = createData.id;
        await new Promise((resolve) => {
            chrome.storage.local.set({ [STORAGE_KEY_JOB_LABEL_ID]: labelId }, resolve);
        });
        return labelId;
    }

    /**
     * Get or create a custom Gmail label (e.g. Decluttr/Work). Used for user-defined auto-labels.
     * @param {string} userLabelName - User-facing name (e.g. "Work"); full Gmail name will be Decluttr/Work
     * @returns {Promise<string>} Gmail label ID
     */
    async getOrCreateCustomLabel(userLabelName) {
        const trimmed = (userLabelName || '').trim();
        if (!trimmed) {
            throw new Error('Label name is required');
        }
        const fullName = CUSTOM_LABEL_PREFIX + trimmed;
        const token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!listRes.ok) {
            if (listRes.status === 401) {
                await refreshToken();
                return this.getOrCreateCustomLabel(userLabelName);
            }
            throw new Error(`Gmail labels list failed: ${listRes.status}`);
        }
        const listData = await listRes.json();
        const labels = listData.labels || [];
        const found = labels.find((l) => l.name === fullName);
        if (found) {
            return found.id;
        }
        const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: fullName })
        });
        if (!createRes.ok) {
            if (createRes.status === 401) {
                await refreshToken();
                return this.getOrCreateCustomLabel(userLabelName);
            }
            const errBody = await createRes.text().catch(() => '');
            throw new Error(`Gmail label create failed: ${createRes.status} ${errBody.slice(0, 100)}`);
        }
        const createData = await createRes.json();
        return createData.id;
    }

    async addLabelToMessages(messageIds, labelId) {
        let token = await getAuthToken();
        if (!token) {
            throw new Error('Not authenticated');
        }
        const results = { success: [], failed: [] };
        const batchSize = 5;
        for (let i = 0; i < messageIds.length; i += batchSize) {
            const batch = messageIds.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(async (messageId) => {
                try {
                    let response = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ addLabelIds: [labelId] })
                        }
                    );
                    if (response.status === 401) {
                        await refreshToken();
                        token = await getAuthToken();
                        response = await fetch(
                            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
                            {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ addLabelIds: [labelId] })
                            }
                        );
                    }
                    if (response.ok) {
                        return { success: true, id: messageId };
                    }
                    return { success: false, id: messageId, error: `HTTP ${response.status}` };
                } catch (error) {
                    return { success: false, id: messageId, error: error.message };
                }
            }));
            batchResults.forEach((r) => {
                if (r.success) {
                    results.success.push(r.id);
                } else {
                    results.failed.push({ id: r.id, error: r.error });
                }
            });
            if (i + batchSize < messageIds.length) {
                await new Promise((resolve) => setTimeout(resolve, 200));
            }
        }
        return results;
    }

    /**
 * Delete multiple emails by their IDs (permanent deletion)
 * @param {Array<string>} emailIds - Array of email IDs to delete
 * @returns {Promise<{success: Array<string>, failed: Array<{id: string, error: string}>}>}
 */
async deleteEmails(emailIds) {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const results = {
        success: [],
        failed: []
    };

    // Delete emails in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < emailIds.length; i += batchSize) {
        const batch = emailIds.slice(i, i + batchSize);
        
        const deleteBatch = batch.map(async (emailId) => {
            try {
                const response = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}`,
                    {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                if (response.ok || response.status === 204) {
                    results.success.push(emailId);
                } else {
                    results.failed.push({
                        id: emailId,
                        error: `HTTP ${response.status}`
                    });
                }
            } catch (error) {
                results.failed.push({
                    id: emailId,
                    error: error.message
                });
            }
        });
        await Promise.all(deleteBatch);

        if (i + batchSize < emailIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return results;
}

/**
 * Trash multiple emails by their IDs (moves to trash - recoverable)
 * @param {Array<string>} emailIds - Array of email IDs to trash
 * @returns {Promise<{success: Array<string>, failed: Array<{id: string, error: string}>}>}
 */
async trashEmails(emailIds) {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Not authenticated');
    }

    const results = {
        success: [],
        failed: []
    };

    // Trash emails in batches
    const batchSize = 5;
    for (let i = 0; i < emailIds.length; i += batchSize) {
        const batch = emailIds.slice(i, i + batchSize);
        
        const trashBatch = batch.map(async (emailId) => {
            try {
                const response = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/trash`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    }
                );
                if (response.ok) {
                    results.success.push(emailId);
                } else {
                    const status = response.status;
                    const body = await response.text().catch(() => '');
                    results.failed.push({
                        id: emailId,
                        error: `HTTP ${status}`,
                        status,
                        body: body ? body.slice(0, 200) : ''
                    });
                }
            } catch (error) {
                results.failed.push({
                    id: emailId,
                    error: error.message
                });
            }
        });
        await Promise.all(trashBatch);

        if (i + batchSize < emailIds.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return results;
}
}

