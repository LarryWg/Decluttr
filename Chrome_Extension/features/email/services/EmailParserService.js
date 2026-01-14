/**
 * Email Parser Service - Parses Gmail API responses into structured email objects
 */
import { DEFAULT_INBOX, INBOX_CATEGORIES } from '../config/constants.js';
import { decodeBase64, stripHtml } from '../utils/textUtils.js';

export class EmailParserService {
    /**
     * Recursively extract email body from payload (handles nested multipart structures)
     * @param {Object} payload - Gmail API payload object
     * @returns {string} Extracted email body
     */
    extractEmailBody(payload) {
        // If this is a multipart structure, recurse into parts
        if (payload.parts && payload.parts.length > 0) {
            // Prefer text/plain, fallback to text/html
            let textPart = null;
            let htmlPart = null;
            
            for (const part of payload.parts) {
                // Handle nested multipart (multipart/alternative, multipart/related, etc.)
                if (part.mimeType && part.mimeType.startsWith('multipart/')) {
                    const nestedBody = this.extractEmailBody(part);
                    if (nestedBody) return nestedBody;
                }
                
                // Collect text and HTML parts
                if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                    textPart = part;
                } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                    htmlPart = part;
                }
            }
            
            // Return plain text if available, otherwise HTML stripped
            if (textPart) {
                return decodeBase64(textPart.body.data);
            } else if (htmlPart) {
                const html = decodeBase64(htmlPart.body.data);
                return stripHtml(html);
            }
        }
        
        // Single part email
        if (payload.body && payload.body.data) {
            if (payload.mimeType === 'text/plain') {
                return decodeBase64(payload.body.data);
            } else if (payload.mimeType === 'text/html') {
                const html = decodeBase64(payload.body.data);
                return stripHtml(html);
            }
        }
        
        return '';
    }

    /**
     * Parse List-Unsubscribe header (RFC 2369 format)
     * Format: <url1>, <url2> or mailto:address or combination
     * @param {string} headerValue - Raw header value
     * @returns {{urls: Array<string>, mailto: string|null}}
     */
    parseListUnsubscribeHeader(headerValue) {
        if (!headerValue || typeof headerValue !== 'string') {
            return { urls: [], mailto: null };
        }
        
        const urls = [];
        let mailto = null;
        
        // Split by comma and process each part
        const parts = headerValue.split(',').map(part => part.trim());
        
        for (const part of parts) {
            // Check for mailto links
            if (part.toLowerCase().startsWith('mailto:')) {
                mailto = part;
            }
            // Check for URL in angle brackets <url>
            else if (part.startsWith('<') && part.endsWith('>')) {
                const url = part.slice(1, -1).trim();
                if (url && !url.toLowerCase().startsWith('mailto:')) {
                    urls.push(url);
                }
            }
            // Check for plain URL (without brackets)
            else if (part.startsWith('http://') || part.startsWith('https://')) {
                urls.push(part);
            }
        }
        
        return { urls, mailto };
    }

    /**
     * Parse List-Unsubscribe-Post header (RFC 8058)
     * @param {string} headerValue - Header value
     * @returns {{requiresPost: boolean, oneClick: boolean}}
     */
    parseListUnsubscribePost(headerValue) {
        if (!headerValue || typeof headerValue !== 'string') {
            return { requiresPost: false, oneClick: false };
        }
        
        // Format: List-Unsubscribe-Post: List-Unsubscribe=One-Click
        if (headerValue.includes('One-Click')) {
            return { requiresPost: true, oneClick: true };
        }
        
        return { requiresPost: false, oneClick: false };
    }

    /**
     * Normalize sender address to extract domain
     * @param {string} fromHeader - From header value (e.g., "Name <email@domain.com>" or "email@domain.com")
     * @returns {string} Normalized domain
     */
    normalizeSenderAddress(fromHeader) {
        if (!fromHeader) return 'unknown';
        
        // Extract email from "Name <email@domain.com>" format
        const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        
        if (emailMatch) {
            const email = emailMatch[1];
            const domain = email.split('@')[1];
            return domain ? domain.toLowerCase() : 'unknown';
        }
        
        return 'unknown';
    }

    /**
     * Parse Gmail API response into a structured email object
     * @param {Object} data - Raw Gmail API response
     * @returns {Object} Parsed email object
     */
    parseEmailData(data) {
        const headers = data.payload.headers || [];
        
        const getHeader = (name) => {
            const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
            return header ? header.value : '';
        };

        const subject = getHeader('Subject') || '(No Subject)';
        const from = getHeader('From') || 'Unknown Sender';
        const date = getHeader('Date') || new Date().toISOString();
        
        // Extract List-Unsubscribe headers
        const listUnsubscribeHeader = getHeader('List-Unsubscribe');
        const listUnsubscribe = this.parseListUnsubscribeHeader(listUnsubscribeHeader);
        
        // Extract List-Unsubscribe-Post header
        const listUnsubscribePostHeader = getHeader('List-Unsubscribe-Post');
        const unsubscribePost = this.parseListUnsubscribePost(listUnsubscribePostHeader);
        
        // Check Gmail labels for category (CATEGORY_PROMOTIONS, CATEGORY_SOCIAL, etc.)
        let inboxCategory = DEFAULT_INBOX;
        if (data.labelIds && Array.isArray(data.labelIds)) {
            if (data.labelIds.includes('CATEGORY_PROMOTIONS')) {
                inboxCategory = INBOX_CATEGORIES.PROMOTIONS;
            } else if (data.labelIds.includes('CATEGORY_SOCIAL')) {
                // Future: could add social category
                inboxCategory = INBOX_CATEGORIES.PRIMARY;
            } else if (data.labelIds.includes('CATEGORY_UPDATES')) {
                // Future: could add updates category
                inboxCategory = INBOX_CATEGORIES.PRIMARY;
            }
        }
        
        // Extract email body (prefer plain text, fallback to HTML)
        // Handle nested multipart structures recursively
        let body = this.extractEmailBody(data.payload);
        
        // If no body found, try direct body
        if (!body && data.payload.body && data.payload.body.data) {
            body = decodeBase64(data.payload.body.data);
            // Strip HTML if it's HTML content
            if (data.payload.mimeType === 'text/html') {
                body = stripHtml(body);
            }
        }

        // Clean up HTML entities, zero-width characters, and metadata from body text
        if (body) {
            // Remove email IDs and hashes (32-40 character hex strings at start of lines)
            body = body.replace(/^[0-9a-f]{32,40}\s+/gmi, '');
            
            // Clean HTML entities and zero-width characters
            body = body.replace(/&zwnj;/gi, '');  // Zero Width Non-Joiner
            body = body.replace(/&zwj;/gi, '');   // Zero Width Joiner
            body = body.replace(/&nbsp;/gi, ' '); // Non-breaking space
            body = body.replace(/&#8203;/g, '');   // Zero-width space
            body = body.replace(/\u200B/g, '');   // Zero-width space (Unicode)
            body = body.replace(/\u200C/g, '');   // Zero-width non-joiner (Unicode)
            body = body.replace(/\u200D/g, '');   // Zero-width joiner (Unicode)
            body = body.replace(/\uFEFF/g, '');   // Zero-width no-break space
            
            // Remove lines that look like IDs or hashes (standalone)
            body = body.replace(/^[0-9a-f]{20,}\s*$/gmi, '');
            
            // Clean up multiple spaces and newlines (but preserve single spaces between words)
            body = body.replace(/\n\s*\n/g, '\n'); // Multiple blank lines to single
            body = body.replace(/[ \t]+/g, ' '); // Multiple spaces/tabs to single space
            body = body.trim();
            
            // Note: URLs are preserved and will be converted to clickable links in the UI
        }

        // Combine subject and body for AI processing
        const fullContent = `Subject: ${subject}\n\nFrom: ${from}\n\n${body}`;

        return {
            id: data.id,
            threadId: data.threadId,
            subject: subject,
            from: from,
            date: date,
            body: body,
            fullContent: fullContent,
            snippet: data.snippet || body.substring(0, 100) + '...',
            inboxCategory: inboxCategory, // Use Gmail category if available, otherwise default to primary
            listUnsubscribeUrls: listUnsubscribe.urls,
            listUnsubscribeMailto: listUnsubscribe.mailto,
            listUnsubscribePost: unsubscribePost
        };
    }
}

