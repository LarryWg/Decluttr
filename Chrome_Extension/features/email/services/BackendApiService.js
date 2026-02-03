/**
 * Backend API Service - Handles backend AI API calls
 */
import { SettingsService } from './SettingsService.js';

export class BackendApiService {
    constructor(settingsService) {
        this.settingsService = settingsService;
    }

    /**
     * Process email through backend AI API
     * Also extracts action items and sentiment for job emails
     * @param {Object} email - Email object
     * @returns {Promise<Object>} AI analysis results
     */
    async processEmailWithAI(email) {
        const backendUrl = await this.settingsService.getBackendUrl();
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

            // For job emails, also extract action items and analyze sentiment (non-blocking)
            if (result.category === 'Job' || result.jobType) {
                const emailContent = email.fullContent;
                
                // Run action items and sentiment in parallel
                const [actionsResult, sentimentResult] = await Promise.allSettled([
                    this.extractActionItems(emailContent).catch(() => ({ actionItems: [] })),
                    this.analyzeSentiment(emailContent).catch(() => ({ sentiment: 'neutral', confidence: 0.5 }))
                ]);

                result.actionItems = actionsResult.status === 'fulfilled' ? actionsResult.value.actionItems : [];
                
                if (sentimentResult.status === 'fulfilled') {
                    result.sentiment = sentimentResult.value.sentiment;
                    result.sentimentConfidence = sentimentResult.value.confidence;
                }
            }

            return result;
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error('Failed to connect to backend server. Make sure it is running.');
            }
            throw error;
        }
    }

    /**
     * Check if an email matches a user-defined label (name + description)
     * @param {string} emailContent - Full email content
     * @param {string} labelName - User-facing label name
     * @param {string} labelDescription - User's description of what emails should get this label
     * @returns {Promise<{match: boolean}>}
     */
    async matchCustomLabel(emailContent, labelName, labelDescription) {
        const backendUrl = await this.settingsService.getBackendUrl();
        const url = `${backendUrl}/api/email/match-custom-label`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                emailContent,
                labelName,
                labelDescription
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `Backend error: ${response.status}`);
        }

        const result = await response.json();
        if (typeof result.match !== 'boolean') {
            throw new Error('Invalid response format from backend');
        }
        return result;
    }

    /**
     * Extract action items and deadlines from a job application email
     * @param {string} emailContent - Full email content
     * @returns {Promise<{actionItems: Array<{text: string, deadline: string|null, urgent: boolean}>}>}
     */
    async extractActionItems(emailContent) {
        const backendUrl = await this.settingsService.getBackendUrl();
        const url = `${backendUrl}/api/email/extract-actions`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailContent })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Backend error: ${response.status}`);
            }

            const result = await response.json();
            return { actionItems: Array.isArray(result.actionItems) ? result.actionItems : [] };
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error('Failed to connect to backend server.');
            }
            throw error;
        }
    }

    /**
     * Analyze the sentiment/tone of a job application email
     * @param {string} emailContent - Full email content
     * @returns {Promise<{sentiment: string, confidence: number}>}
     */
    async analyzeSentiment(emailContent) {
        const backendUrl = await this.settingsService.getBackendUrl();
        const url = `${backendUrl}/api/email/analyze-sentiment`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailContent })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || `Backend error: ${response.status}`);
            }

            const result = await response.json();
            return {
                sentiment: result.sentiment || 'neutral',
                confidence: typeof result.confidence === 'number' ? result.confidence : 0.5
            };
        } catch (error) {
            if (error.message.includes('fetch')) {
                throw new Error('Failed to connect to backend server.');
            }
            throw error;
        }
    }
}

