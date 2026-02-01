/**
 * Email Repository - Manages email state and cache
 */
import { DEFAULT_INBOX, STORAGE_KEY_UNSUBSCRIBED, STORAGE_KEY_JOB_LABEL_ID, INBOX_CATEGORIES, VALID_JOB_TYPES } from '../config/constants.js';

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

    getFilteredEmails() {
        if (this.selectedInbox === INBOX_CATEGORIES.JOB) {
            return this.currentEmails.filter((e) => {
                if (e.inboxCategory === INBOX_CATEGORIES.JOB) return true;
                if (this.jobLabelId && e.labelIds && Array.isArray(e.labelIds) && e.labelIds.includes(this.jobLabelId)) return true;
                const cached = this.getCachedResult(e.id);
                return cached?.jobType && VALID_JOB_TYPES.includes(cached.jobType);
            });
        }
        return this.currentEmails.filter((email) => email.inboxCategory === this.selectedInbox);
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
}

