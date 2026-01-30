/**
 * Gmail API Service - Handles Gmail API calls
 */
import { MAX_EMAILS_TO_FETCH } from '../config/constants.js';
import { EmailParserService } from './EmailParserService.js';

export class GmailApiService {
    constructor() {
        this.parser = new EmailParserService();
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

