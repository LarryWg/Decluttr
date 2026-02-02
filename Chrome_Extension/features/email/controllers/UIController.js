/**
 * UI Controller - Handles all UI rendering and updates
 */
import { INBOX_CATEGORIES, DEFAULT_INBOX, JOB_TYPE_LABELS, VALID_JOB_TYPES } from '../config/constants.js';
import { escapeHtml, convertUrlsToLinks } from '../utils/textUtils.js';
import { formatDate } from '../utils/dateUtils.js';

export class UIController {
    constructor(domRefs, emailRepository, emailClassificationService, backendApiService, unsubscribeService, onJobEmailClassified = null, onBeforeShowEmailModal = null) {
        this.domRefs = domRefs;
        this.emailRepository = emailRepository;
        this.emailClassificationService = emailClassificationService;
        this.backendApiService = backendApiService;
        this.unsubscribeService = unsubscribeService;
        this.onJobEmailClassified = onJobEmailClassified;
        this.onBeforeShowEmailModal = onBeforeShowEmailModal;
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
                } else if (selected && selected.startsWith('custom:')) {
                    const labelId = selected.slice(7);
                    const label = this.emailRepository.getCustomLabels().find((l) => l.id === labelId);
                    emptyStateText.textContent = label ? `No emails in "${label.name}"` : 'No emails with this label';
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
        const jobType = cachedResults ? cachedResults.jobType : null;
        const hasUnsubscribe = cachedResults ? cachedResults.hasUnsubscribe : false;
        const isJobApplication = category === 'Job' || email.inboxCategory === INBOX_CATEGORIES.JOB || (jobType && VALID_JOB_TYPES.includes(jobType));
        const jobStageLabel = isJobApplication && jobType && JOB_TYPE_LABELS[jobType] ? JOB_TYPE_LABELS[jobType] : (isJobApplication ? 'Applications Sent' : null);

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
                    ${jobStageLabel ? `<span class="jobApplicationBadge">${escapeHtml(jobStageLabel)}</span>` : ''}
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

        viewBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.showEmailModal(email);
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

            // Update email's inbox category: Job → Job; hasUnsubscribe → Promotions; else Primary
            email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category, results.jobType, results.hasUnsubscribe);
            
            // Update card with results
            this.updateEmailCardWithResults(card, results);

            // If classified as Job (category or jobType), apply Gmail label (same as auto-categorize)
            const isJob = results.category === 'Job' || (results.jobType && VALID_JOB_TYPES.includes(results.jobType));
            if (isJob && typeof this.onJobEmailClassified === 'function') {
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

        // Add job stage badge (Applications Sent, Interview, Accepted, Rejected, etc.)
        const isJobResult = results.category === 'Job' || (results.jobType && VALID_JOB_TYPES.includes(results.jobType));
        if (isJobResult) {
            const jobBadge = document.createElement('span');
            jobBadge.className = 'jobApplicationBadge';
            jobBadge.textContent = results.jobType && JOB_TYPE_LABELS[results.jobType] ? JOB_TYPE_LABELS[results.jobType] : 'Applications Sent';
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
     * Show email detail modal. If onBeforeShowEmailModal is set, awaits it first (e.g. fetch body when loaded from storage).
     * @param {Object} email - Email object
     */
    async showEmailModal(email) {
        if (typeof this.onBeforeShowEmailModal === 'function') {
            await this.onBeforeShowEmailModal(email);
        }
        this.domRefs.modalSubject.textContent = email.subject;
        this.domRefs.modalSender.textContent = `From: ${email.from}`;
        this.domRefs.modalDate.textContent = `Date: ${formatDate(email.date)}`;
        this.domRefs.modalBodyContent.innerHTML = convertUrlsToLinks(email.body || '');

        // Check for cached AI results
        const cachedResults = this.emailRepository.getCachedResult(email.id);
        
        if (cachedResults) {
            const isJobCached = cachedResults.category === 'Job' || (cachedResults.jobType && VALID_JOB_TYPES.includes(cachedResults.jobType));
            const jobStageLabel = isJobCached && cachedResults.jobType && JOB_TYPE_LABELS[cachedResults.jobType] ? JOB_TYPE_LABELS[cachedResults.jobType] : (isJobCached ? 'Applications Sent' : null);
            const badgeHtml = jobStageLabel
                ? `<div class="jobApplicationBadge" style="margin-bottom: 10px;">${escapeHtml(jobStageLabel)}</div>`
                : (cachedResults.category ? `<div class="categoryBadge ${cachedResults.category.toLowerCase()}" style="margin-bottom: 10px;">${escapeHtml(cachedResults.category)}</div>` : '');
            this.domRefs.modalAiResults.innerHTML = `
                <h4>AI Analysis</h4>
                <div class="aiResults">
                    ${badgeHtml}
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
                    // Update email's inbox category based on AI category and jobType
                    email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category, results.jobType, results.hasUnsubscribe);
                    // If jobType set, apply Gmail job label
                    const isJob = results.category === 'Job' || (results.jobType && VALID_JOB_TYPES.includes(results.jobType));
                    if (isJob && typeof this.onJobEmailClassified === 'function') {
                        this.onJobEmailClassified(email).catch(err => console.warn('Job label apply failed:', err));
                    }
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
     * Update inbox tabs UI: render custom-label tabs and highlight active tab
     */
    updateInboxTabsUI() {
        if (!this.domRefs.inboxTabs) return;

        const addBtn = this.domRefs.addCustomLabelTabBtn;
        if (addBtn) {
            const customLabels = this.emailRepository.getCustomLabels();
            this.domRefs.inboxTabs.querySelectorAll('.inboxTab[data-inbox^="custom:"]').forEach((el) => el.remove());
            customLabels.forEach((label) => {
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'inboxTab';
                tab.dataset.inbox = `custom:${label.id}`;
                tab.textContent = label.name;
                this.domRefs.inboxTabs.insertBefore(tab, addBtn);
            });
        }

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

    /**
     * Show Pipeline (Sankey) view and set textarea content. Defaults to Code view.
     * @param {string} sankeyText - SankeyMATIC-format text
     */
    showPipelineView(sankeyText) {
        if (this.domRefs.sankeySection) this.domRefs.sankeySection.style.display = 'block';
        if (this.domRefs.sankeyTextarea) this.domRefs.sankeyTextarea.value = sankeyText || '';
        if (this.domRefs.emailList) this.domRefs.emailList.style.display = 'none';
        if (this.domRefs.loadMoreBtn) this.domRefs.loadMoreBtn.style.display = 'none';
        if (this.domRefs.managePromotionsBtn) this.domRefs.managePromotionsBtn.style.display = 'none';
        if (this.domRefs.emptyState) this.domRefs.emptyState.style.display = 'none';
        this.showPipelineCodeView();
    }

    /**
     * Show Code view (textarea + actions); hide Diagram view.
     */
    showPipelineCodeView() {
        if (this.domRefs.sankeyCodeView) this.domRefs.sankeyCodeView.style.display = 'block';
        if (this.domRefs.sankeyDiagramContainer) this.domRefs.sankeyDiagramContainer.style.display = 'none';
        if (this.domRefs.sankeyCodeViewBtn) {
            this.domRefs.sankeyCodeViewBtn.classList.add('active');
            this.domRefs.sankeyCodeViewBtn.setAttribute('aria-selected', 'true');
        }
        if (this.domRefs.sankeyDiagramViewBtn) {
            this.domRefs.sankeyDiagramViewBtn.classList.remove('active');
            this.domRefs.sankeyDiagramViewBtn.setAttribute('aria-selected', 'false');
        }
    }

    /**
     * Show Diagram view: render D3 Sankey diagram from current flow data (no iframe).
     */
    showPipelineDiagramView() {
        if (this.domRefs.sankeyCodeView) this.domRefs.sankeyCodeView.style.display = 'none';
        if (this.domRefs.sankeyDiagramContainer) this.domRefs.sankeyDiagramContainer.style.display = 'block';
        if (this.domRefs.sankeyCodeViewBtn) {
            this.domRefs.sankeyCodeViewBtn.classList.remove('active');
            this.domRefs.sankeyCodeViewBtn.setAttribute('aria-selected', 'false');
        }
        if (this.domRefs.sankeyDiagramViewBtn) {
            this.domRefs.sankeyDiagramViewBtn.classList.add('active');
            this.domRefs.sankeyDiagramViewBtn.setAttribute('aria-selected', 'true');
        }

        const container = this.domRefs.sankeyDiagramContainer;
        container.innerHTML = '';

        const text = this.domRefs.sankeyTextarea ? this.domRefs.sankeyTextarea.value : '';
        if (!this._hasSankeyFlowLines(text)) {
            const msg = document.createElement('p');
            msg.className = 'sankeyDiagramEmpty';
            msg.textContent = 'Enter flow data in Code view and click Refresh, or paste SankeyMATIC text (e.g. Source [10] Target).';
            container.appendChild(msg);
            return;
        }

        import('../services/SankeyDiagramRenderer.js').then(({ parseSankeyText, renderSankey }) => {
            const data = parseSankeyText(text);
            if (!data.nodes.length || !data.links.length) {
                const msg = document.createElement('p');
                msg.className = 'sankeyDiagramEmpty';
                msg.textContent = 'No valid flow lines found. Use format: Source [amount] Target';
                container.appendChild(msg);
                return;
            }
            renderSankey(container, data);
        }).catch((err) => {
            console.error('Sankey render failed:', err);
            const errEl = document.createElement('p');
            errEl.className = 'sankeyDiagramError';
            errEl.textContent = 'Could not load diagram. Reload the extension.';
            container.appendChild(errEl);
        });
    }

    /**
     * Check if text has at least one SankeyMATIC flow line (Source [amount] Target).
     * @param {string} text
     * @returns {boolean}
     */
    _hasSankeyFlowLines(text) {
        if (!text || typeof text !== 'string') return false;
        const flowLineRegex = /^.+\s*\[\s*[\d.+]+\s*\]\s*.+$/;
        const lines = text.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('//')) continue;
            if (flowLineRegex.test(trimmed)) return true;
        }
        return false;
    }

    /**
     * Show email list view (hide Pipeline)
     */
    showEmailListView() {
        if (this.domRefs.sankeySection) this.domRefs.sankeySection.style.display = 'none';
        if (this.domRefs.emailList) this.domRefs.emailList.style.display = 'block';
    }

    /**
     * Update Pipeline textarea content (e.g. on Refresh)
     * @param {string} sankeyText - SankeyMATIC-format text
     */
    setPipelineContent(sankeyText) {
        if (this.domRefs.sankeyTextarea) this.domRefs.sankeyTextarea.value = sankeyText || '';
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

