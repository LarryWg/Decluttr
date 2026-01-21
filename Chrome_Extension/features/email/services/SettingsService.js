/**
 * Settings Service - Manages application settings
 */
import { DEFAULT_BACKEND_URL, STORAGE_KEY_BACKEND_URL } from '../config/constants.js';

export class SettingsService {
    constructor(domRefs) {
        this.domRefs = domRefs;
    }

    /**
     * Load settings from storage and populate UI
     */
    async loadSettings() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY_BACKEND_URL], (result) => {
                if (result[STORAGE_KEY_BACKEND_URL]) {
                    this.domRefs.backendUrlInput.value = result[STORAGE_KEY_BACKEND_URL];
                } else {
                    this.domRefs.backendUrlInput.value = DEFAULT_BACKEND_URL;
                }
                
                // Populate redirect URI for OAuth configuration
                try {
                    const redirectUri = chrome.identity.getRedirectURL();
                    const normalizedRedirectUri = redirectUri.endsWith('/') ? redirectUri : redirectUri + '/';
                    this.domRefs.redirectUriDisplay.value = normalizedRedirectUri;
                } catch (error) {
                    console.error('Failed to get redirect URI:', error);
                    this.domRefs.redirectUriDisplay.value = 'Unable to get redirect URI';
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

    /**
     * Get redirect URI for OAuth
     * @returns {string} Redirect URI
     */
    getRedirectUri() {
        try {
            const redirectUri = chrome.identity.getRedirectURL();
            return redirectUri.endsWith('/') ? redirectUri : redirectUri + '/';
        } catch (error) {
            console.error('Failed to get redirect URI:', error);
            return '';
        }
    }
}

