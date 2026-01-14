/**
 * Text processing utility functions
 */

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Decode base64-encoded string (Gmail API uses URL-safe base64)
 * Properly handles UTF-8 encoding
 * @param {string} base64String - Base64 encoded string
 * @returns {string} Decoded string
 */
export function decodeBase64(base64String) {
    try {
        // Gmail API uses URL-safe base64, convert to standard base64
        let standardBase64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
        
        // Add padding if needed
        const padding = 4 - (standardBase64.length % 4);
        if (padding !== 4) {
            standardBase64 += '='.repeat(padding);
        }
        
        // Decode base64 to binary string
        const binaryString = atob(standardBase64);
        
        // Convert binary string (Latin-1) to UTF-8 string
        // Use TextDecoder for proper UTF-8 decoding (available in Chrome extensions)
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Use TextDecoder to properly decode UTF-8
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(bytes);
    } catch (error) {
        console.error('Base64 decode error:', error);
        // Fallback: try simple decode without UTF-8 handling
        try {
            const standardBase64 = base64String.replace(/-/g, '+').replace(/_/g, '/');
            return atob(standardBase64);
        } catch (fallbackError) {
            console.error('Fallback decode also failed:', fallbackError);
            return '';
        }
    }
}

/**
 * Strip HTML tags from string and clean up HTML entities and zero-width characters
 * @param {string} html - HTML string
 * @returns {string} Plain text
 */
export function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    let text = tmp.textContent || tmp.innerText || '';
    
    // Clean up HTML entities that might not have been decoded
    text = decodeHtmlEntities(text);
    
    // Remove zero-width characters and entities
    text = text.replace(/&zwnj;/gi, '');  // Zero Width Non-Joiner
    text = text.replace(/&zwj;/gi, '');   // Zero Width Joiner
    text = text.replace(/&nbsp;/gi, ' '); // Non-breaking space (convert to regular space)
    text = text.replace(/&#8203;/g, '');  // Zero-width space (numeric entity)
    text = text.replace(/\u200B/g, '');   // Zero-width space (Unicode)
    text = text.replace(/\u200C/g, '');   // Zero-width non-joiner (Unicode)
    text = text.replace(/\u200D/g, '');   // Zero-width joiner (Unicode)
    text = text.replace(/\uFEFF/g, '');   // Zero-width no-break space
    
    // Clean up multiple spaces
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
}

/**
 * Decode HTML entities to their actual characters
 * @param {string} str - String with HTML entities
 * @returns {string} Decoded string
 */
export function decodeHtmlEntities(str) {
    const tmp = document.createElement('div');
    tmp.innerHTML = str;
    return tmp.textContent || tmp.innerText || str;
}

/**
 * Convert URLs in text to clickable links with domain names as text
 * @param {string} text - Text that may contain URLs
 * @returns {string} HTML with clickable links
 */
export function convertUrlsToLinks(text) {
    if (!text) return '';
    
    // Escape HTML to prevent XSS
    const escaped = escapeHtml(text);
    
    // URL regex pattern (matches http://, https://, and www.)
    const urlRegex = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
    
    return escaped.replace(urlRegex, (url) => {
        // Ensure URL has protocol
        let fullUrl = url;
        if (url.startsWith('www.')) {
            fullUrl = 'https://' + url;
        }
        
        try {
            // Extract domain name from URL
            const urlObj = new URL(fullUrl);
            let domain = urlObj.hostname;
            
            // Remove www. prefix for cleaner display
            domain = domain.replace(/^www\./i, '');
            
            // Create clickable link with domain name as text
            return `<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="emailLink">${escapeHtml(domain)}</a>`;
        } catch (e) {
            // If URL parsing fails, just escape and return the original
            return escapeHtml(url);
        }
    });
}

