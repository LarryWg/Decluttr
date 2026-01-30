/**
 * Email Classification Service - Handles email categorization and grouping
 */
import { INBOX_CATEGORIES } from '../config/constants.js';

export class EmailClassificationService {
    constructor(emailRepository, emailParserService) {
        this.emailRepository = emailRepository;
        this.emailParserService = emailParserService;
    }

    mapAiCategoryToInboxCategory(aiCategory) {
        if (aiCategory === 'Job') return INBOX_CATEGORIES.JOB;
        if (aiCategory === 'Promotional') return INBOX_CATEGORIES.PROMOTIONS;
        return INBOX_CATEGORIES.PRIMARY;
    }

    /**
     * Get unsubscribe info for a group of emails from the same sender
     * @param {Array} emails - Array of email objects from the same sender
     * @returns {{hasUnsubscribe: boolean, method: string, unsubscribeUrl: string|null, requiresPost: boolean}}
     */
    getSenderUnsubscribeInfo(emails) {
        // Prefer List-Unsubscribe header (RFC 2369)
        for (const email of emails) {
            // Check List-Unsubscribe URLs first
            if (email.listUnsubscribeUrls && email.listUnsubscribeUrls.length > 0) {
                const requiresPost = email.listUnsubscribePost && email.listUnsubscribePost.requiresPost;
                return {
                    hasUnsubscribe: true,
                    method: 'url',
                    unsubscribeUrl: email.listUnsubscribeUrls[0],
                    requiresPost: requiresPost || false
                };
            }
            
            // Check List-Unsubscribe mailto
            if (email.listUnsubscribeMailto) {
                return {
                    hasUnsubscribe: true,
                    method: 'mailto',
                    unsubscribeUrl: email.listUnsubscribeMailto
                };
            }
        }
        
        // Fallback to body-based detection (from AI processing)
        for (const email of emails) {
            const cachedResults = this.emailRepository.getCachedResult(email.id);
            if (cachedResults && cachedResults.hasUnsubscribe && cachedResults.unsubscribeLink) {
                return {
                    hasUnsubscribe: true,
                    method: 'url',
                    unsubscribeUrl: cachedResults.unsubscribeLink
                };
            }
        }
        
        return {
            hasUnsubscribe: false,
            method: 'none',
            unsubscribeUrl: null
        };
    }

    /**
     * Group emails by normalized sender domain
     * @returns {Map<string, Object>} Map of domain -> sender group object
     */
    groupEmailsBySender() {
        const promotionalEmails = this.emailRepository.getEmails().filter(
            email => email.inboxCategory === INBOX_CATEGORIES.PROMOTIONS
        );
        const senderGroups = new Map();
        
        for (const email of promotionalEmails) {
            const domain = this.emailParserService.normalizeSenderAddress(email.from);
            
            if (!senderGroups.has(domain)) {
                const unsubscribeInfo = this.getSenderUnsubscribeInfo([email]);
                senderGroups.set(domain, {
                    domain: domain,
                    displayName: email.from.split('<')[0].trim() || domain,
                    emailCount: 0,
                    emails: [],
                    emailIds: [],
                    hasUnsubscribe: unsubscribeInfo.hasUnsubscribe,
                    unsubscribeMethod: unsubscribeInfo.method,
                    unsubscribeUrl: unsubscribeInfo.unsubscribeUrl,
                    requiresPost: unsubscribeInfo.requiresPost || false
                });
            }
            
            const group = senderGroups.get(domain);
            group.emailCount++;
            group.emails.push(email);
            group.emailIds.push(email.id);
            
            // Update unsubscribe info if this email has better support
            const emailUnsubscribeInfo = this.getSenderUnsubscribeInfo([email]);
            if (emailUnsubscribeInfo.hasUnsubscribe && !group.hasUnsubscribe) {
                group.hasUnsubscribe = true;
                group.unsubscribeMethod = emailUnsubscribeInfo.method;
                group.unsubscribeUrl = emailUnsubscribeInfo.unsubscribeUrl;
                group.requiresPost = emailUnsubscribeInfo.requiresPost || false;
            }
        }
        
        return senderGroups;
    }
}

