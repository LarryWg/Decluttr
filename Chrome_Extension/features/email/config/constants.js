/**
 * Configuration Constants
 */

export const DEFAULT_BACKEND_URL = 'http://localhost:3000';
export const MAX_EMAILS_TO_FETCH = 50;
export const STORAGE_KEY_BACKEND_URL = 'backend_url';
export const STORAGE_KEY_THEME = 'settings_theme';
export const STORAGE_KEY_AUTO_CATEGORIZE = 'settings_auto_categorize';
export const DEFAULT_THEME = 'system';
export const DEFAULT_AUTO_CATEGORIZE = true;

// Inbox Categories
export const INBOX_CATEGORIES = {
    PRIMARY: 'primary',
    PROMOTIONS: 'promotions'
};

export const DEFAULT_INBOX = INBOX_CATEGORIES.PRIMARY;
export const STORAGE_KEY_UNSUBSCRIBED = 'unsubscribed_senders';

