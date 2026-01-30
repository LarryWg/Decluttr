/**
 * Configuration Constants
 */

export const DEFAULT_BACKEND_URL = 'http://localhost:3000';
export const MAX_EMAILS_TO_FETCH = 50;
export const STORAGE_KEY_BACKEND_URL = 'backend_url';
export const AUTO_CATEGORIZE_ON_LOAD = true; // Automatically categorize emails when Gmail is connected

// Inbox Categories
export const INBOX_CATEGORIES = {
    PRIMARY: 'primary',
    PROMOTIONS: 'promotions'
};

export const DEFAULT_INBOX = INBOX_CATEGORIES.PRIMARY;
export const STORAGE_KEY_UNSUBSCRIBED = 'unsubscribed_senders';

