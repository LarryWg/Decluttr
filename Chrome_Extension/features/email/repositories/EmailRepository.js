/**
 * Email Repository - Manages email state and cache
 */
import { DEFAULT_INBOX, STORAGE_KEY_UNSUBSCRIBED, STORAGE_KEY_JOB_LABEL_ID, STORAGE_KEY_EMAILS, STORAGE_KEY_EMAIL_CACHE, STORAGE_KEY_NEXT_PAGE_TOKEN, STORAGE_KEY_SELECTED_INBOX, INBOX_CATEGORIES, VALID_JOB_TYPES } from '../config/constants.js';

export class EmailRepository {
    constructor() {
        this.currentEmails = [];
        this.processingEmails = new Set();
        this.emailCache = new Map();
        this.selectedInbox = DEFAULT_INBOX;
        this.nextPageToken = null;
        this._loadingMore = false;
        this.unsubscribedSenders = new Set();
        this.jobLabelId = null;
    }

    // Email management
    getEmails() {
        return this.currentEmails;
    }

    setEmails(emails) {
        this.currentEmails = emails;
    }

    addEmails(emails) {
        this.currentEmails = [...this.currentEmails, ...emails];
    }

    getEmailById(id) {
        return this.currentEmails.find(email => email.id === id);
    }

    /**
     * Returns true if the email is a job application email (same logic as Job tab).
     * @param {Object} e - Email object
     * @returns {boolean}
     */
    _isJobEmail(e) {
        if (e.inboxCategory === INBOX_CATEGORIES.JOB) return true;
        if (this.jobLabelId && e.labelIds && Array.isArray(e.labelIds) && e.labelIds.includes(this.jobLabelId)) return true;
        const cached = this.getCachedResult(e.id);
        return cached?.jobType && VALID_JOB_TYPES.includes(cached.jobType);
    }

    getFilteredEmails() {
        if (this.selectedInbox === INBOX_CATEGORIES.JOB) {
            return this.currentEmails.filter((e) => this._isJobEmail(e));
        }
        return this.currentEmails.filter((email) => email.inboxCategory === this.selectedInbox);
    }

    /**
     * Returns the same set of emails as the Job tab (for pipeline/Sankey).
     * @returns {Array<Object>}
     */
    getJobEmails() {
        return this.currentEmails.filter((e) => this._isJobEmail(e));
    }

    getJobLabelId() {
        return this.jobLabelId;
    }

    setJobLabelId(id) {
        this.jobLabelId = id;
    }

    // Cache management
    getCache() {
        return this.emailCache;
    }

    getCachedResult(emailId) {
        return this.emailCache.get(emailId);
    }

    setCache(emailId, results) {
        this.emailCache.set(emailId, results);
    }

    clearCache() {
        this.emailCache.clear();
    }

    // Inbox management
    getSelectedInbox() {
        return this.selectedInbox;
    }

    setSelectedInbox(inbox) {
        this.selectedInbox = inbox;
    }

    // Pagination
    getNextPageToken() {
        return this.nextPageToken;
    }

    setNextPageToken(token) {
        this.nextPageToken = token;
    }

    isLoadingMore() {
        return this._loadingMore;
    }

    setLoadingMore(loading) {
        this._loadingMore = loading;
    }

    // Processing state
    addProcessing(emailId) {
        this.processingEmails.add(emailId);
    }

    removeProcessing(emailId) {
        this.processingEmails.delete(emailId);
    }

    isProcessing(emailId) {
        return this.processingEmails.has(emailId);
    }

    // Unsubscribed senders
    getUnsubscribedSenders() {
        return this.unsubscribedSenders;
    }

    async markUnsubscribed(domain) {
        this.unsubscribedSenders.add(domain);
        try {
            await chrome.storage.local.set({
                [STORAGE_KEY_UNSUBSCRIBED]: Array.from(this.unsubscribedSenders)
            });
        } catch (error) {
            console.error('Failed to save unsubscribed sender:', error);
        }
    }

    isUnsubscribed(domain) {
        return this.unsubscribedSenders.has(domain);
    }

    async loadUnsubscribedSenders() {
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY_UNSUBSCRIBED]);
            if (result[STORAGE_KEY_UNSUBSCRIBED]) {
                this.unsubscribedSenders = new Set(result[STORAGE_KEY_UNSUBSCRIBED]);
            }
        } catch (error) {
            console.error('Failed to load unsubscribed senders:', error);
        }
    }

    async loadJobLabelId() {
        try {
            const result = await chrome.storage.local.get([STORAGE_KEY_JOB_LABEL_ID]);
            this.jobLabelId = result[STORAGE_KEY_JOB_LABEL_ID] || null;
        } catch (error) {
            console.error('Failed to load job label id:', error);
        }
    }

    /**
     * Minimal email shape for persistence (omit body, fullContent to save space).
     * @param {Object} email - Full email object
     * @returns {Object}
     */
    minimalEmailForStorage(email) {
        return {
            id: email.id,
            threadId: email.threadId,
            subject: email.subject,
            from: email.from,
            date: email.date,
            snippet: email.snippet,
            inboxCategory: email.inboxCategory,
            labelIds: email.labelIds || [],
            listUnsubscribeUrls: email.listUnsubscribeUrls,
            listUnsubscribeMailto: email.listUnsubscribeMailto,
            listUnsubscribePost: email.listUnsubscribePost
        };
    }

    /**
     * Save current emails (minimal), cache, nextPageToken, selectedInbox to chrome.storage.local.
     */
    async saveToStorage() {
        try {
            const emails = this.currentEmails.map((e) => this.minimalEmailForStorage(e));
            const cache = Object.fromEntries(this.emailCache);
            await chrome.storage.local.set({
                [STORAGE_KEY_EMAILS]: emails,
                [STORAGE_KEY_EMAIL_CACHE]: cache,
                [STORAGE_KEY_NEXT_PAGE_TOKEN]: this.nextPageToken,
                [STORAGE_KEY_SELECTED_INBOX]: this.selectedInbox
            });
        } catch (error) {
            console.error('Failed to save emails to storage:', error);
            if (error.message && error.message.includes('QUOTA')) {
                const maxKeep = 300;
                if (this.currentEmails.length > maxKeep) {
                    this.currentEmails = this.currentEmails.slice(0, maxKeep);
                    const idsToKeep = new Set(this.currentEmails.map((e) => e.id));
                    for (const id of this.emailCache.keys()) {
                        if (!idsToKeep.has(id)) this.emailCache.delete(id);
                    }
                    await this.saveToStorage();
                }
            }
        }
    }

    /**
     * Load emails (minimal), cache, nextPageToken, selectedInbox from chrome.storage.local.
     * Restored emails have body and fullContent set to '' (fetch on demand for View Details).
     * @returns {Promise<boolean>} True if we had stored data (emails length > 0)
     */
    async loadFromStorage() {
        try {
            const result = await chrome.storage.local.get([
                STORAGE_KEY_EMAILS,
                STORAGE_KEY_EMAIL_CACHE,
                STORAGE_KEY_NEXT_PAGE_TOKEN,
                STORAGE_KEY_SELECTED_INBOX
            ]);
            const emails = result[STORAGE_KEY_EMAILS];
            const cacheObj = result[STORAGE_KEY_EMAIL_CACHE];
            if (Array.isArray(emails) && emails.length > 0) {
                this.currentEmails = emails.map((e) => ({
                    ...e,
                    body: '',
                    fullContent: ''
                }));
            }
            if (cacheObj && typeof cacheObj === 'object') {
                this.emailCache = new Map(Object.entries(cacheObj));
            }
            if (result[STORAGE_KEY_NEXT_PAGE_TOKEN] != null) {
                this.nextPageToken = result[STORAGE_KEY_NEXT_PAGE_TOKEN];
            }
            if (result[STORAGE_KEY_SELECTED_INBOX] != null) {
                this.selectedInbox = result[STORAGE_KEY_SELECTED_INBOX];
            }
            return Array.isArray(emails) && emails.length > 0;
        } catch (error) {
            console.error('Failed to load emails from storage:', error);
            return false;
        }
    }
}

