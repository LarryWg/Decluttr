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
}

