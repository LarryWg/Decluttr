/**
 * Unsubscribe Service - Handles unsubscribe operations
 */
export class UnsubscribeService {
    constructor(emailRepository) {
        this.emailRepository = emailRepository;
    }

    /**
     * Unsubscribe via HTTP URL
     * @param {string} url - Unsubscribe URL
     * @param {boolean} requiresPost - Whether POST is required
     * @returns {Promise<{success: boolean, error: string|null, verified: boolean, status?: number}>}
     */
    async unsubscribeViaUrl(url, requiresPost = false) {
        try {
            // First try with CORS to read response
            try {
                const options = {
                    method: requiresPost ? 'POST' : 'GET',
                    credentials: 'omit',
                    redirect: 'follow',
                    headers: {}
                };
                
                if (requiresPost) {
                    // Some senders require List-Unsubscribe=One-Click in POST body
                    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                    options.body = 'List-Unsubscribe=One-Click';
                }
                
                const response = await fetch(url, options);
                
                // Check response status
                if (response.ok) {
                    // Try to read response body for success indicators
                    let text = '';
                    try {
                        text = await response.text();
                    } catch (readError) {
                        // Can't read body, but status is OK
                        return { 
                            success: true, 
                            error: null,
                            verified: true,
                            status: response.status
                        };
                    }
                    
                    // Common success indicators
                    const successPatterns = [
                        /unsubscribed|success|confirmed|removed/i,
                        /you have been|successfully/i,
                        /removed from|no longer receive/i
                    ];
                    
                    // Common failure indicators
                    const failurePatterns = [
                        /error|failed|invalid|not found/i,
                        /unable to|cannot/i
                    ];
                    
                    const hasSuccess = successPatterns.some(pattern => pattern.test(text));
                    const hasFailure = failurePatterns.some(pattern => pattern.test(text));
                    
                    // If we see explicit failure, mark as failed
                    if (hasFailure) {
                        return { 
                            success: false, 
                            error: 'Unsubscribe failed (server response)',
                            verified: true,
                            status: response.status
                        };
                    }
                    
                    // If we see success indicators or status is 200, mark as success
                    const isSuccess = hasSuccess || response.status === 200;
                    
                    return { 
                        success: isSuccess, 
                        error: isSuccess ? null : 'Unsubscribe may have failed',
                        verified: true,
                        status: response.status
                    };
                } else {
                    return { 
                        success: false, 
                        error: `HTTP ${response.status}`,
                        verified: true,
                        status: response.status
                    };
                }
            } catch (corsError) {
                // CORS blocked - fallback to no-cors
                // We can't verify, but we attempted
                try {
                    const options = {
                        method: requiresPost ? 'POST' : 'GET',
                        mode: 'no-cors',
                        credentials: 'omit'
                    };
                    
                    if (requiresPost) {
                        options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
                        options.body = 'List-Unsubscribe=One-Click';
                    }
                    
                    await fetch(url, options);
                    
                    return { 
                        success: true, 
                        error: null,
                        verified: false, // Can't verify due to CORS
                        note: 'Request sent but cannot verify response (CORS blocked)'
                    };
                } catch (fetchError) {
                    return { 
                        success: false, 
                        error: fetchError.message,
                        verified: false
                    };
                }
            }
        } catch (error) {
            return { success: false, error: error.message, verified: false };
        }
    }

    /**
     * Unsubscribe via mailto link
     * @param {string} mailtoAddress - Mailto address (e.g., "mailto:unsubscribe@example.com")
     * @param {string} senderDomain - Sender domain for context
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async unsubscribeViaMailto(mailtoAddress, senderDomain) {
        try {
            // Extract email from mailto: link
            const emailMatch = mailtoAddress.match(/mailto:([^?]+)/);
            if (!emailMatch) {
                return { success: false, error: 'Invalid mailto format' };
            }
            
            const unsubscribeEmail = emailMatch[1];
            
            // Check if we have gmail.send scope (would need to check token scopes)
            // For now, we'll attempt to use Gmail API to send
            const token = await getAuthToken();
            if (!token) {
                return { success: false, error: 'Not authenticated' };
            }
            
            // Create unsubscribe email message
            const subject = 'Unsubscribe';
            const body = 'Please unsubscribe me from your mailing list.';
            const to = unsubscribeEmail;
            
            // Encode message in RFC 2822 format
            const rawMessage = [
                `To: ${to}`,
                `Subject: ${subject}`,
                '',
                body
            ].join('\n');
            
            // Base64 encode
            const encodedMessage = btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            
            // Try to send via Gmail API
            try {
                const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        raw: encodedMessage
                    })
                });
                
                if (response.ok) {
                    return { success: true, error: null };
                } else if (response.status === 403) {
                    return { success: false, error: 'Gmail send permission required. Please grant send email permission.' };
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
                }
            } catch (apiError) {
                return { success: false, error: 'Gmail API error: ' + apiError.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create Gmail filter to auto-archive emails from sender
     * @param {string} senderDomain - Sender domain
     * @returns {Promise<{success: boolean, filterId: string|null, error: string|null}>}
     */
    async createGmailFilter(senderDomain) {
        try {
            const token = await getAuthToken();
            if (!token) {
                return { success: false, filterId: null, error: 'Not authenticated' };
            }
            
            const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/settings/filters', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    criteria: {
                        from: `*@${senderDomain}`
                    },
                    action: {
                        removeLabelIds: ['INBOX']
                    }
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                return { success: true, filterId: data.id, error: null };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return { success: false, filterId: null, error: errorData.error?.message || `HTTP ${response.status}` };
            }
        } catch (error) {
            return { success: false, filterId: null, error: error.message };
        }
    }

    /**
     * Check if unsubscribed senders are still sending emails
     * @param {Object} emailParserService - Email parser service for normalizing addresses
     * @returns {{stillReceiving: Array<string>, effective: boolean}}
     */
    checkUnsubscribeEffectiveness(emailParserService) {
        const promotionalEmails = this.emailRepository.getEmails().filter(
            email => email.inboxCategory === 'promotions'
        );
        
        const stillReceiving = [];
        for (const email of promotionalEmails) {
            const domain = emailParserService.normalizeSenderAddress(email.from);
            if (domain && this.emailRepository.isUnsubscribed(domain)) {
                stillReceiving.push(domain);
            }
        }
        
        if (stillReceiving.length > 0) {
            const uniqueDomains = [...new Set(stillReceiving)];
            console.warn('Still receiving emails from unsubscribed senders:', uniqueDomains);
            return {
                stillReceiving: uniqueDomains,
                effective: false
            };
        }
        
        return { stillReceiving: [], effective: true };
    }
}

