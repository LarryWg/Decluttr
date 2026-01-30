/**
 * Settings Service - Manages application settings
 */
import {
    DEFAULT_BACKEND_URL,
    STORAGE_KEY_BACKEND_URL,
    STORAGE_KEY_THEME,
    STORAGE_KEY_AUTO_CATEGORIZE,
    DEFAULT_THEME,
    DEFAULT_AUTO_CATEGORIZE
} from '../config/constants.js';

export class SettingsService {
    constructor(domRefs) {
        this.domRefs = domRefs;
    }

    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get([
                STORAGE_KEY_BACKEND_URL,
                STORAGE_KEY_THEME,
                STORAGE_KEY_AUTO_CATEGORIZE
            ], (result) => {
                if (this.domRefs.backendUrlInput) {
                    this.domRefs.backendUrlInput.value = result[STORAGE_KEY_BACKEND_URL] || DEFAULT_BACKEND_URL;
                }
                if (this.domRefs.themeSelect) {
                    this.domRefs.themeSelect.value = result[STORAGE_KEY_THEME] || DEFAULT_THEME;
                }
                if (this.domRefs.autoCategorizeCheckbox) {
                    this.domRefs.autoCategorizeCheckbox.checked = result[STORAGE_KEY_AUTO_CATEGORIZE] !== false;
                }
                if (this.domRefs.redirectUriDisplay) {
                    try {
                        const redirectUri = chrome.identity.getRedirectURL();
                        const normalized = redirectUri.endsWith('/') ? redirectUri : redirectUri + '/';
                        this.domRefs.redirectUriDisplay.value = normalized;
                    } catch (error) {
                        this.domRefs.redirectUriDisplay.value = 'Unable to get redirect URI';
                    }
                }
                resolve();
            });
        });
    }

    /**
     * Save backend URL to storage
     */
    async saveBackendUrl() {
        const backendUrl = this.domRefs.backendUrlInput.value.trim();
        
        if (!backendUrl) {
            throw new Error('Backend URL cannot be empty');
        }

        // Basic URL validation
        try {
            new URL(backendUrl);
        } catch (error) {
            throw new Error('Invalid backend URL format');
        }

        await chrome.storage.local.set({ [STORAGE_KEY_BACKEND_URL]: backendUrl });
    }

    /**
     * Get backend URL from storage
     * @returns {Promise<string>} Backend URL
     */
    async getBackendUrl() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY_BACKEND_URL], (result) => {
                resolve(result[STORAGE_KEY_BACKEND_URL] || DEFAULT_BACKEND_URL);
            });
        });
    }

    getRedirectUri() {
        try {
            const redirectUri = chrome.identity.getRedirectURL();
            return redirectUri.endsWith('/') ? redirectUri : redirectUri + '/';
        } catch (error) {
            return '';
        }
    }

    async getTheme() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY_THEME], (result) => {
                resolve(result[STORAGE_KEY_THEME] || DEFAULT_THEME);
            });
        });
    }

    async setTheme(theme) {
        const value = ['light', 'dark', 'system'].includes(theme) ? theme : DEFAULT_THEME;
        await chrome.storage.local.set({ [STORAGE_KEY_THEME]: value });
        return value;
    }

    async getAutoCategorize() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY_AUTO_CATEGORIZE], (result) => {
                resolve(result[STORAGE_KEY_AUTO_CATEGORIZE] !== false);
            });
        });
    }

    async setAutoCategorize(enabled) {
        await chrome.storage.local.set({ [STORAGE_KEY_AUTO_CATEGORIZE]: !!enabled });
    }
}

