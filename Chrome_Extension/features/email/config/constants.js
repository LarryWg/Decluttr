/**
 * Configuration Constants
 */

export const DEFAULT_BACKEND_URL = 'http://localhost:3000';
export const MAX_EMAILS_TO_FETCH = 50;
export const STORAGE_KEY_BACKEND_URL = 'backend_url';
export const STORAGE_KEY_THEME = 'settings_theme';
export const STORAGE_KEY_AUTO_CATEGORIZE = 'settings_auto_categorize';
export const DEFAULT_THEME = 'dark';
export const DEFAULT_AUTO_CATEGORIZE = true;

// Inbox Categories
export const INBOX_CATEGORIES = {
    PRIMARY: 'primary',
    PROMOTIONS: 'promotions',
    JOB: 'job'
};

export const STORAGE_KEY_JOB_LABEL_ID = 'gmail_job_label_id';
export const JOB_LABEL_NAME = 'Decluttr/Job';

// Job application stages (backend jobType values)
export const VALID_JOB_TYPES = ['application_confirmation', 'interview', 'rejection', 'offer'];

/** Display labels for job stage (user-facing wording) */
export const JOB_TYPE_LABELS = {
    application_confirmation: 'Application submitted',
    interview: 'Interview',
    rejection: 'Rejected',
    offer: 'Accepted'
};

export const DEFAULT_INBOX = INBOX_CATEGORIES.PRIMARY;
export const STORAGE_KEY_UNSUBSCRIBED = 'unsubscribed_senders';

