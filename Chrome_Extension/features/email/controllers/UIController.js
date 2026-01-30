/**
 * UI Controller - Handles all UI rendering and updates
 */
import { INBOX_CATEGORIES, DEFAULT_INBOX } from '../config/constants.js';
import { escapeHtml, convertUrlsToLinks } from '../utils/textUtils.js';
import { formatDate } from '../utils/dateUtils.js';

export class UIController {
    constructor(domRefs, emailRepository, emailClassificationService, backendApiService, unsubscribeService, onJobEmailClassified = null) {
        this.domRefs = domRefs;
        this.emailRepository = emailRepository;
        this.emailClassificationService = emailClassificationService;
        this.backendApiService = backendApiService;
        this.unsubscribeService = unsubscribeService;
        this.onJobEmailClassified = onJobEmailClassified;
    }

    /**
     * Render the email list based on current filter
     */
    renderEmailList() {
        this.domRefs.emailList.innerHTML = '';
        
        const filteredEmails = this.emailRepository.getFilteredEmails();
        
        if (filteredEmails.length === 0) {
            this.domRefs.emptyState.style.display = 'block';
            this.domRefs.emailListSection.style.display = 'block';
            // Update empty state message based on selected inbox
            const emptyStateText = this.domRefs.emptyState.querySelector('p');
            if (emptyStateText) {
                const selected = this.emailRepository.getSelectedInbox();
                if (selected === INBOX_CATEGORIES.PROMOTIONS) {
                    emptyStateText.textContent = 'No promotional emails found';
                } else if (selected === INBOX_CATEGORIES.JOB) {
                    emptyStateText.textContent = 'No job application emails found';
                } else {
                    emptyStateText.textContent = 'No emails found';
                }
            }
            // Hide load more button when no emails
            if (this.domRefs.loadMoreBtn) {
                this.domRefs.loadMoreBtn.style.display = 'none';
            }
            return;
        }
        
        this.domRefs.emptyState.style.display = 'none';
        this.domRefs.emailListSection.style.display = 'block';
        
        // Display filtered emails
        filteredEmails.forEach(email => {
            const emailCard = this.createEmailCard(email);
            this.domRefs.emailList.appendChild(emailCard);
        });
        
        // Update load more button visibility
        this.updateLoadMoreButton();
        
        // Update manage promotions button visibility
        this.updateManagePromotionsButton();
    }

    /**
     * Create email card DOM element
     * @param {Object} email - Email object
     * @returns {HTMLElement} Email card element
     */
    createEmailCard(email) {
        const card = document.createElement('div');
        card.className = 'emailCard';
        card.dataset.emailId = email.id;

        // Check if we have cached AI results
        const cachedResults = this.emailRepository.getCachedResult(email.id);
        const category = cachedResults ? cachedResults.category : null;
        const hasUnsubscribe = cachedResults ? cachedResults.hasUnsubscribe : false;
        const isJobApplication = category === 'Job' || email.inboxCategory === INBOX_CATEGORIES.JOB;

        // Format date (relative time)
        const dateStr = formatDate(email.date);

        card.innerHTML = `
            <div class="emailCardHeader">
                <div class="emailSubject">${escapeHtml(email.subject)}</div>
                <div class="emailDate">${dateStr}</div>
            </div>
            <div class="emailSender">${escapeHtml(email.from)}</div>
            <div class="emailPreview">${escapeHtml(email.snippet)}</div>
            <div class="emailActions">
                <div class="emailBadges">
                    ${category && category !== 'Job' ? `<span class="categoryBadge ${category.toLowerCase()}">${category}</span>` : ''}
                    ${isJobApplication ? '<span class="jobApplicationBadge">Job application</span>' : ''}
                    ${hasUnsubscribe ? '<span class="unsubscribeBadge">Unsubscribe Available</span>' : ''}
                </div>
                <button class="button small processEmailBtn" style="margin-top: 8px; width: 100%;">Process with AI</button>
                <button class="button small viewEmailBtn" style="margin-top: 4px; width: 100%;">View Details</button>
            </div>
        `;

        // Add event listeners
        const processBtn = card.querySelector('.processEmailBtn');
        const viewBtn = card.querySelector('.viewEmailBtn');

        processBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.handleProcessEmail(email, card);
        });

        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showEmailModal(email);
        });

        return card;
    }

    /**
     * Handle processing email with AI
     * @param {Object} email - Email object
     * @param {HTMLElement} card - Email card element
     */
    async handleProcessEmail(email, card) {
        // Prevent duplicate processing
        if (this.emailRepository.isProcessing(email.id)) {
            return;
        }

        try {
            this.emailRepository.addProcessing(email.id);
            const processBtn = card.querySelector('.processEmailBtn');
            const originalText = processBtn.textContent;
            processBtn.textContent = 'Processing...';
            processBtn.disabled = true;

            // Check cache first
            let results = this.emailRepository.getCachedResult(email.id);
            
            if (!results) {
                // Process with AI
                results = await this.backendApiService.processEmailWithAI(email);
                this.emailRepository.setCache(email.id, results);
            }

            // Update email's inbox category based on AI category
            email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category);
            
            // Update card with results
            this.updateEmailCardWithResults(card, results);

            // If classified as Job, apply Gmail label (same as auto-categorize)
            if (results.category === 'Job' && typeof this.onJobEmailClassified === 'function') {
                this.onJobEmailClassified(email).catch(err => console.warn('Job label apply failed:', err));
            }

            this.emailRepository.removeProcessing(email.id);
            processBtn.textContent = originalText;
            processBtn.disabled = false;
            processBtn.style.display = 'none'; // Hide button after processing
            
            // If email no longer matches current inbox, remove it from view
            if (email.inboxCategory !== this.emailRepository.getSelectedInbox()) {
                card.remove();
                // Check if we need to show empty state
                const filteredEmails = this.emailRepository.getFilteredEmails();
                if (filteredEmails.length === 0) {
                    this.domRefs.emptyState.style.display = 'block';
                }
            }

        } catch (error) {
            this.emailRepository.removeProcessing(email.id);
            const processBtn = card.querySelector('.processEmailBtn');
            processBtn.textContent = 'Process with AI';
            processBtn.disabled = false;
            
            console.error('Process email error:', error);
            this.showError('Failed to process email: ' + error.message);
        }
    }

    /**
     * Update email card with AI results
     * @param {HTMLElement} card - Email card element
     * @param {Object} results - AI analysis results
     */
    updateEmailCardWithResults(card, results) {
        const actionsDiv = card.querySelector('.emailActions');
        
        // Get or create emailBadges container
        let badgesContainer = actionsDiv.querySelector('.emailBadges');
        if (!badgesContainer) {
            badgesContainer = document.createElement('div');
            badgesContainer.className = 'emailBadges';
            // Insert at the beginning of emailActions
            actionsDiv.insertBefore(badgesContainer, actionsDiv.firstChild);
        }
        
        // Remove existing badges from container
        const existingBadges = badgesContainer.querySelectorAll('.categoryBadge, .jobApplicationBadge, .unsubscribeBadge');
        existingBadges.forEach(badge => badge.remove());
        
        // Remove aiSummary if it exists (it's not in badges container)
        const existingSummary = actionsDiv.querySelector('.aiSummary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Add category badge (skip "Job" — we show Job application badge instead)
        if (results.category && results.category !== 'Job') {
            const categoryBadge = document.createElement('span');
            categoryBadge.className = `categoryBadge ${results.category.toLowerCase()}`;
            categoryBadge.textContent = results.category;
            badgesContainer.appendChild(categoryBadge);
        }

        // Add Job application badge (like Unsubscribe Available)
        if (results.category === 'Job') {
            const jobBadge = document.createElement('span');
            jobBadge.className = 'jobApplicationBadge';
            jobBadge.textContent = 'Job application';
            badgesContainer.appendChild(jobBadge);
        }

        // Add unsubscribe badge
        if (results.hasUnsubscribe) {
            const unsubscribeBadge = document.createElement('span');
            unsubscribeBadge.className = 'unsubscribeBadge';
            unsubscribeBadge.textContent = 'Unsubscribe Available';
            badgesContainer.appendChild(unsubscribeBadge);

            if (results.unsubscribeLink) {
                const unsubscribeLink = document.createElement('a');
                unsubscribeLink.href = results.unsubscribeLink;
                unsubscribeLink.target = '_blank';
                unsubscribeLink.className = 'unsubscribeLink';
                unsubscribeLink.textContent = 'Click to Unsubscribe';
                actionsDiv.appendChild(unsubscribeLink);
            }
        }

        // Add summary (collapsible)
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'aiSummary';
        summaryDiv.innerHTML = `<strong>Summary:</strong> ${escapeHtml(results.summary)}`;
        actionsDiv.appendChild(summaryDiv);
    }

    /**
     * Show email detail modal
     * @param {Object} email - Email object
     */
    showEmailModal(email) {
        this.domRefs.modalSubject.textContent = email.subject;
        this.domRefs.modalSender.textContent = `From: ${email.from}`;
        this.domRefs.modalDate.textContent = `Date: ${formatDate(email.date)}`;
        // Convert URLs to clickable links with domain names
        this.domRefs.modalBodyContent.innerHTML = convertUrlsToLinks(email.body);

        // Check for cached AI results
        const cachedResults = this.emailRepository.getCachedResult(email.id);
        
        if (cachedResults) {
            this.domRefs.modalAiResults.innerHTML = `
                <h4>AI Analysis</h4>
                <div class="aiResults">
                    ${cachedResults.category === 'Job'
                        ? '<div class="jobApplicationBadge" style="margin-bottom: 10px;">Job application</div>'
                        : `<div class="categoryBadge ${cachedResults.category.toLowerCase()}" style="margin-bottom: 10px;">${cachedResults.category}</div>`
                    }
                    <div class="aiSummary">
                        <strong>Summary:</strong><br>
                        ${escapeHtml(cachedResults.summary)}
                    </div>
                    ${cachedResults.hasUnsubscribe ? `
                        <div style="margin-top: 10px;">
                            <span class="unsubscribeBadge">Unsubscribe Available</span>
                            ${cachedResults.unsubscribeLink ? `
                                <a href="${cachedResults.unsubscribeLink}" target="_blank" class="unsubscribeLink" style="display: block; margin-top: 8px;">
                                    Click to Unsubscribe
                                </a>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Show process button in modal
            this.domRefs.modalAiResults.innerHTML = `
                <h4>AI Analysis</h4>
                <button class="button primary" id="processInModalBtn">Process with AI</button>
            `;
            
            document.getElementById('processInModalBtn').addEventListener('click', async () => {
                try {
                    const results = await this.backendApiService.processEmailWithAI(email);
                    this.emailRepository.setCache(email.id, results);
                    // Update email's inbox category based on AI category
                    email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category);
                    this.showEmailModal(email); // Refresh modal with results
                } catch (error) {
                    this.showError('Failed to process email: ' + error.message);
                }
            });
        }

        this.domRefs.emailModal.style.display = 'flex';
    }

    /**
     * Show unsubscribe modal with sender list
     */
    showUnsubscribeModal() {
        if (!this.domRefs.unsubscribeModal || !this.domRefs.senderList) return;
        
        const senderGroups = this.emailClassificationService.groupEmailsBySender();
        
        if (senderGroups.size === 0) {
            this.showError('No promotional senders found');
            return;
        }
        
        this.domRefs.unsubscribeModal.style.display = 'flex';
        this.renderSenderList(senderGroups);
    }

    /**
     * Render sender list in the unsubscribe modal
     * @param {Map} senderGroups - Map of sender groups
     */
    renderSenderList(senderGroups) {
        if (!this.domRefs.senderList) return;
        
        this.domRefs.senderList.innerHTML = '';
        
        const sortedSenders = Array.from(senderGroups.values()).sort((a, b) => b.emailCount - a.emailCount);
        
        for (const sender of sortedSenders) {
            const senderItem = document.createElement('div');
            senderItem.className = 'senderItem';
            senderItem.dataset.domain = sender.domain;
            
            const methodLabel = sender.unsubscribeMethod === 'url' ? 'URL' : 
                               sender.unsubscribeMethod === 'mailto' ? 'Mailto' : 'None';
            const methodClass = sender.hasUnsubscribe ? 'supported' : 'unsupported';
            
            senderItem.innerHTML = `
                <label class="senderCheckboxLabel">
                    <input type="checkbox" class="senderCheckbox" data-domain="${sender.domain}" ${sender.hasUnsubscribe ? '' : 'disabled'}>
                    <div class="senderCheckboxText">
                        <div class="senderDisplayName">${escapeHtml(sender.displayName)}</div>
                        <div class="senderMeta">${sender.emailCount} email${sender.emailCount !== 1 ? 's' : ''} • <span class="methodBadge ${methodClass}">${methodLabel}</span></div>
                    </div>
                </label>
            `;
            
            this.domRefs.senderList.appendChild(senderItem);
        }
    }

    /**
     * Show unsubscribe and delete results to user
     * @param {Object} results - Results object with success, failed, needsFilter, deleted arrays
     * @param {boolean} deleteEmails - Whether emails were deleted
     */
    showUnsubscribeResults(results, deleteEmails = false) {
        const total = results.success.length + results.failed.length + results.needsFilter.length;
        let message = `Processed ${total} sender${total !== 1 ? 's' : ''}:\n\n`;
        
        if (results.success.length > 0) {
            const verified = results.success.filter(s => s.verified !== false).length;
            const unverified = results.success.length - verified;
            
            message += `✓ Successfully unsubscribed from ${results.success.length} sender${results.success.length !== 1 ? 's' : ''}`;
            if (unverified > 0) {
                message += `\n   (${verified} verified, ${unverified} pending verification)`;
            }
            message += '\n';
        }
        
        if (deleteEmails && results.deleted && results.deleted.length > 0) {
            const totalDeleted = results.deleted.reduce((sum, d) => sum + d.count, 0);
            message += `🗑️ Moved ${totalDeleted} email${totalDeleted !== 1 ? 's' : ''} to trash from ${results.deleted.length} sender${results.deleted.length !== 1 ? 's' : ''}\n`;
            
            // Show details for first few
            const detailsToShow = results.deleted.slice(0, 3);
            detailsToShow.forEach(d => {
                message += `   • ${d.domain}: ${d.count} email${d.count !== 1 ? 's' : ''}\n`;
            });
            if (results.deleted.length > 3) {
                message += `   • ...and ${results.deleted.length - 3} more\n`;
            }
        }
        
        if (results.failed.length > 0) {
            message += `✗ Failed to unsubscribe from ${results.failed.length} sender${results.failed.length !== 1 ? 's' : ''}\n`;
            // Show first few errors
            const errorDetails = results.failed.slice(0, 3).map(f => {
                const domain = f.sender?.domain || 'unknown';
                const error = f.error || 'Unknown error';
                return `   • ${domain}: ${error}`;
            }).join('\n');
            if (errorDetails) {
                message += errorDetails + '\n';
            }
        }
        
        if (results.needsFilter.length > 0) {
            message += `⚠ ${results.needsFilter.length} sender${results.needsFilter.length !== 1 ? 's' : ''} need${results.needsFilter.length === 1 ? 's' : ''} filter creation\n`;
        }
        
        if (results.success.length > 0 || (deleteEmails && results.deleted && results.deleted.length > 0)) {
            this.showSuccess(message);
        } else if (results.failed.length > 0 || results.needsFilter.length > 0) {
            this.showError(message);
        }
        
        // Close modal after a delay
        setTimeout(() => {
            if (this.domRefs.unsubscribeModal) {
                this.domRefs.unsubscribeModal.style.display = 'none';
            }
            // Refresh email list to reflect changes
            this.renderEmailList();
        }, results.success.length > 0 || (deleteEmails && results.deleted && results.deleted.length > 0) ? 2500 : 3000);
    }

    /**
     * Update inbox tabs UI to highlight active tab
     */
    updateInboxTabsUI() {
        if (!this.domRefs.inboxTabs) return;
        
        const tabs = this.domRefs.inboxTabs.querySelectorAll('.inboxTab');
        tabs.forEach(tab => {
            if (tab.dataset.inbox === this.emailRepository.getSelectedInbox()) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
    }

    /**
     * Update Manage Promotions button visibility
     */
    updateManagePromotionsButton() {
        if (!this.domRefs.managePromotionsBtn) return;
        
        if (this.emailRepository.getSelectedInbox() === INBOX_CATEGORIES.PROMOTIONS) {
            const promotionalEmails = this.emailRepository.getFilteredEmails();
            this.domRefs.managePromotionsBtn.style.display = promotionalEmails.length > 0 ? 'block' : 'none';
        } else {
            this.domRefs.managePromotionsBtn.style.display = 'none';
        }
    }

    updateLoadMoreButton() {
        if (!this.domRefs.loadMoreBtn) return;
        const hasMore = !!this.emailRepository.getNextPageToken();
        const loading = this.emailRepository.isLoadingMore();
        this.domRefs.loadMoreBtn.style.display = hasMore ? 'block' : 'none';
        this.domRefs.loadMoreBtn.disabled = !!loading;
    }

    // UI feedback methods
    showLoading(message = 'Loading...') {
        this.domRefs.loadingSpinner.querySelector('p').textContent = message;
        this.domRefs.loadingSpinner.style.display = 'block';
    }

    hideLoading() {
        this.domRefs.loadingSpinner.style.display = 'none';
    }

    showError(message) {
        this.domRefs.errorMessage.textContent = message;
        this.domRefs.errorMessage.style.display = 'block';
        setTimeout(() => {
            this.domRefs.errorMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    hideError() {
        this.domRefs.errorMessage.style.display = 'none';
    }

    showSuccess(message) {
        this.domRefs.successMessage.textContent = message;
        this.domRefs.successMessage.style.display = 'block';
        setTimeout(() => {
            this.domRefs.successMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    hideSuccess() {
        this.domRefs.successMessage.style.display = 'none';
    }
}

