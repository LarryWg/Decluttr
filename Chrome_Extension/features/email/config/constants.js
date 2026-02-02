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

// Job application pipeline stages (backend jobType / transition slugs)
// New 8-stage transition model + legacy 4 for backward compatibility
export const VALID_JOB_TYPES = [
    'applications_sent',
    'oa_screening',
    'interview',
    'offer',
    'accepted',
    'rejected',
    'no_response',
    'declined',
    'application_confirmation',
    'rejection'
];

/** Display labels for job stage (user-facing wording) */
export const JOB_TYPE_LABELS = {
    applications_sent: 'Applications Sent',
    oa_screening: 'OA / Screening',
    interview: 'Interview',
    offer: 'Offer',
    accepted: 'Accepted',
    rejected: 'Rejected',
    no_response: 'No Response',
    declined: 'Declined',
    application_confirmation: 'Applications Sent',
    rejection: 'Rejected'
};

export const DEFAULT_INBOX = INBOX_CATEGORIES.PRIMARY;
export const STORAGE_KEY_UNSUBSCRIBED = 'unsubscribed_senders';

// Persisted email list and AI cache (survive extension close)
export const STORAGE_KEY_EMAILS = 'decluttr_emails';
export const STORAGE_KEY_EMAIL_CACHE = 'decluttr_email_cache';
export const STORAGE_KEY_NEXT_PAGE_TOKEN = 'decluttr_next_page_token';
export const STORAGE_KEY_SELECTED_INBOX = 'decluttr_selected_inbox';

export const STORAGE_KEY_SANKEY_EMBEDDED = 'decluttr_sankey_embedded';

