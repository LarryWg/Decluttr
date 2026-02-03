/**
 * UI Controller - Handles all UI rendering and updates
 */
import { INBOX_CATEGORIES, DEFAULT_INBOX, JOB_TYPE_LABELS, VALID_JOB_TYPES, CARD_STAGGER_MS, CARD_STAGGER_MAX_MS } from '../config/constants.js';
import { escapeHtml, convertUrlsToLinks } from '../utils/textUtils.js';
import { formatDate } from '../utils/dateUtils.js';

export class UIController {
    constructor(domRefs, emailRepository, emailClassificationService, backendApiService, unsubscribeService, onJobEmailClassified = null, onBeforeShowEmailModal = null, onPipelineNeedsRefresh = null) {
        this.domRefs = domRefs;
        this.emailRepository = emailRepository;
        this.emailClassificationService = emailClassificationService;
        this.backendApiService = backendApiService;
        this.unsubscribeService = unsubscribeService;
        this.onJobEmailClassified = onJobEmailClassified;
        this.onBeforeShowEmailModal = onBeforeShowEmailModal;
        this.onPipelineNeedsRefresh = onPipelineNeedsRefresh;
        this.openDropdownId = null; // Track which dropdown is open
        
        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.jobLabelSelector')) {
                this.closeAllDropdowns();
            }
        });
    }

    /**
     * Close all open label dropdowns.
     */
    closeAllDropdowns() {
        const dropdowns = document.querySelectorAll('.jobLabelDropdown.open');
        dropdowns.forEach(d => d.classList.remove('open'));
        this.openDropdownId = null;
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
        
        // Display filtered emails with staggered entrance animation
        filteredEmails.forEach((email, index) => {
            const emailCard = this.createEmailCard(email);
            // Stagger animation delay (shorter in demo mode for faster visual feedback)
            const delay = Math.min(index * CARD_STAGGER_MS, CARD_STAGGER_MAX_MS);
            emailCard.style.animationDelay = `${delay}ms`;
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
        const jobType = cachedResults ? (cachedResults.userOverrideJobType || cachedResults.jobType) : null;
        const hasUnsubscribe = cachedResults ? cachedResults.hasUnsubscribe : false;
        const isJobApplication = category === 'Job' || email.inboxCategory === INBOX_CATEGORIES.JOB || (jobType && VALID_JOB_TYPES.includes(jobType));
        const jobStageLabel = isJobApplication && jobType && JOB_TYPE_LABELS[jobType] ? JOB_TYPE_LABELS[jobType] : (isJobApplication ? 'Applications Sent' : null);
        const jobStageKey = jobType || 'applications_sent';

        // Format date (relative time)
        const dateStr = formatDate(email.date);

        // Check if we're in job tab (editable badges)
        const isJobTab = this.emailRepository.getSelectedInbox() === INBOX_CATEGORIES.JOB;

        card.innerHTML = `
            <div class="emailCardHeader">
                <div class="emailSubject">${escapeHtml(email.subject)}</div>
                <div class="emailDate">${dateStr}</div>
            </div>
            <div class="emailSender">${escapeHtml(email.from)}</div>
            <div class="emailPreview">${escapeHtml(email.snippet)}</div>
            <div class="emailActions">
                <div class="emailBadges">
                    ${jobStageLabel ? this._createJobBadgeHtml(email.id, jobStageLabel, jobStageKey, isJobTab) : ''}
                    ${hasUnsubscribe ? '<span class="unsubscribeBadge">Unsubscribe</span>' : ''}
                </div>
            </div>
        `;

        // Add click handler for the whole card to open modal
        card.addEventListener('click', async (e) => {
            // Don't open modal if clicking on dropdown or badge
            if (e.target.closest('.jobLabelSelector') || e.target.closest('.jobLabelDropdown')) {
                return;
            }
            await this.showEmailModal(email);
        });

        // Add job label dropdown functionality if in job tab
        if (isJobTab && jobStageLabel) {
            this._setupJobLabelDropdown(card, email);
        }

        return card;
    }

    /**
     * Create HTML for job application badge (editable or not).
     * @param {string} emailId - Email ID
     * @param {string} label - Display label
     * @param {string} stageKey - The job type key
     * @param {boolean} editable - Whether the badge should be editable
     * @returns {string} HTML string
     */
    _createJobBadgeHtml(emailId, label, stageKey, editable) {
        if (!editable) {
            return `<span class="jobApplicationBadge" data-stage="${escapeHtml(stageKey)}">${escapeHtml(label)}</span>`;
        }
        
        // Build dropdown options
        const options = Object.entries(JOB_TYPE_LABELS)
            .filter(([key]) => !['application_confirmation', 'rejection'].includes(key)) // Hide duplicates
            .map(([key, value]) => {
                const selected = key === stageKey ? 'selected' : '';
                return `<button type="button" class="jobLabelOption ${selected}" data-value="${escapeHtml(key)}">${escapeHtml(value)}</button>`;
            })
            .join('');
        
        return `
            <div class="jobLabelSelector" data-email-id="${emailId}">
                <span class="jobApplicationBadge editable" data-stage="${escapeHtml(stageKey)}">${escapeHtml(label)}</span>
                <div class="jobLabelDropdown" data-email-id="${emailId}">
                    ${options}
                </div>
            </div>
        `;
    }

    /**
     * Setup click handlers for job label dropdown.
     * @param {HTMLElement} card - Email card element
     * @param {Object} email - Email object
     */
    _setupJobLabelDropdown(card, email) {
        const selector = card.querySelector('.jobLabelSelector');
        if (!selector) return;

        const badge = selector.querySelector('.jobApplicationBadge');
        const dropdown = selector.querySelector('.jobLabelDropdown');

        // Toggle dropdown on badge click
        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.contains('open');
            this.closeAllDropdowns();
            if (!isOpen) {
                dropdown.classList.add('open');
                this.openDropdownId = email.id;
            }
        });

        // Handle option selection
        dropdown.querySelectorAll('.jobLabelOption').forEach(option => {
            option.addEventListener('click', async (e) => {
                e.stopPropagation();
                const newStage = option.dataset.value;
                await this._handleJobLabelChange(email, newStage);
                this.closeAllDropdowns();
            });
        });
    }

    /**
     * Handle job label change by user.
     * @param {Object} email - Email object
     * @param {string} newStage - New job stage key
     */
    async _handleJobLabelChange(email, newStage) {
        // Update cache with user override
        const cached = this.emailRepository.getCachedResult(email.id) || {};
        cached.userOverrideJobType = newStage;
        cached.jobType = newStage; // Also update jobType for stats calculation
        this.emailRepository.setCache(email.id, cached);
        
        // Save to storage
        await this.emailRepository.saveToStorage();
        
        // Re-render the email list to reflect changes
        this.renderEmailList();
        
        // Refresh pipeline diagram if callback is set (updates the Sankey code)
        if (typeof this.onPipelineNeedsRefresh === 'function') {
            this.onPipelineNeedsRefresh();
        }
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
        const existingBadges = badgesContainer.querySelectorAll('.categoryBadge, .jobApplicationBadge, .unsubscribeBadge, .jobLabelSelector');
        existingBadges.forEach(badge => badge.remove());
        
        // Remove aiSummary if it exists (it's not in badges container)
        const existingSummary = actionsDiv.querySelector('.aiSummary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Add job stage badge (Applications Sent, Interview, Accepted, Rejected, etc.)
        const isJobResult = results.category === 'Job' || (results.jobType && VALID_JOB_TYPES.includes(results.jobType));
        if (isJobResult) {
            const stageKey = results.userOverrideJobType || results.jobType || 'applications_sent';
            const stageLabel = JOB_TYPE_LABELS[stageKey] || 'Applications Sent';
            const jobBadge = document.createElement('span');
            jobBadge.className = 'jobApplicationBadge';
            jobBadge.dataset.stage = stageKey;
            jobBadge.textContent = stageLabel;
            badgesContainer.appendChild(jobBadge);
        }

        // Add unsubscribe badge
        if (results.hasUnsubscribe) {
            const unsubscribeBadge = document.createElement('span');
            unsubscribeBadge.className = 'unsubscribeBadge';
            unsubscribeBadge.textContent = 'Unsubscribe';
            badgesContainer.appendChild(unsubscribeBadge);
        }
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
            const jobStageKey = cachedResults.userOverrideJobType || cachedResults.jobType || 'applications_sent';
            const jobStageLabel = isJobCached && JOB_TYPE_LABELS[jobStageKey] ? JOB_TYPE_LABELS[jobStageKey] : (isJobCached ? 'Applications Sent' : null);
            
            let badgeHtml = '';
            if (jobStageLabel) {
                badgeHtml = this._createJobBadgeHtml(email.id, jobStageLabel, jobStageKey, true);
            } else if (cachedResults.category) {
                badgeHtml = `<div class="categoryBadge ${cachedResults.category.toLowerCase()}" style="margin-bottom: 10px;">${escapeHtml(cachedResults.category)}</div>`;
            }
            
            this.domRefs.modalAiResults.innerHTML = `
                <h4>AI Analysis</h4>
                <div class="aiResults">
                    <div class="emailBadges" style="margin-bottom: 12px;">
                        ${badgeHtml}
                        ${cachedResults.hasUnsubscribe ? '<span class="unsubscribeBadge">Unsubscribe</span>' : ''}
                    </div>
                    <div class="aiSummary">
                        <strong>Summary:</strong><br>
                        ${escapeHtml(cachedResults.summary)}
                    </div>
                    ${cachedResults.hasUnsubscribe && cachedResults.unsubscribeLink ? `
                        <a href="${cachedResults.unsubscribeLink}" target="_blank" class="unsubscribeLink" style="display: block; margin-top: 12px;">
                            Click to Unsubscribe
                        </a>
                    ` : ''}
                </div>
            `;
            
            // Setup dropdown in modal if job email
            if (isJobCached) {
                const selector = this.domRefs.modalAiResults.querySelector('.jobLabelSelector');
                if (selector) {
                    const badge = selector.querySelector('.jobApplicationBadge');
                    const dropdown = selector.querySelector('.jobLabelDropdown');
                    
                    badge.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isOpen = dropdown.classList.contains('open');
                        this.closeAllDropdowns();
                        if (!isOpen) {
                            dropdown.classList.add('open');
                        }
                    });
                    
                    dropdown.querySelectorAll('.jobLabelOption').forEach(option => {
                        option.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const newStage = option.dataset.value;
                            await this._handleJobLabelChange(email, newStage);
                            this.closeAllDropdowns();
                            // Refresh modal with new label
                            this.showEmailModal(email);
                        });
                    });
                }
            }
        } else {
            // Show process button in modal
            this.domRefs.modalAiResults.innerHTML = `
                <h4>AI Analysis</h4>
                <button class="button primary" id="processInModalBtn">Process with AI</button>
            `;
            
            document.getElementById('processInModalBtn').addEventListener('click', async () => {
                try {
                    // Use cache if already processed (e.g. from card or double-click) to avoid duplicate API calls
                    let results = this.emailRepository.getCachedResult(email.id);
                    if (!results) {
                        results = await this.backendApiService.processEmailWithAI(email);
                        this.emailRepository.setCache(email.id, results);
                    }
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
     * Update inbox tabs UI: render custom-label tabs, add count badges, highlight active tab
     */
    updateInboxTabsUI() {
        if (!this.domRefs.inboxTabs) return;

        const addBtn = this.domRefs.addCustomLabelTabBtn;
        const emails = this.emailRepository.getEmails();
        
        // Calculate counts for each category
        const counts = {
            primary: 0,
            promotions: 0,
            job: 0
        };
        
        const jobLabelId = this.emailRepository.getJobLabelId();
        emails.forEach(email => {
            const cached = this.emailRepository.getCachedResult(email.id);
            const isJob = email.inboxCategory === INBOX_CATEGORIES.JOB || 
                (jobLabelId && email.labelIds?.includes(jobLabelId)) ||
                (cached?.jobType && cached.jobType !== null);
            
            if (isJob) {
                counts.job++;
            } else if (email.inboxCategory === INBOX_CATEGORIES.PROMOTIONS || cached?.hasUnsubscribe) {
                counts.promotions++;
            } else {
                counts.primary++;
            }
        });

        // Remove existing custom tabs
        if (addBtn) {
            const customLabels = this.emailRepository.getCustomLabels();
            this.domRefs.inboxTabs.querySelectorAll('.inboxTab[data-inbox^="custom:"]').forEach((el) => el.remove());
            
            // Add custom label tabs with counts
            customLabels.forEach((label) => {
                const count = emails.filter(e => e.labelIds?.includes(label.gmailLabelId)).length;
                const tab = document.createElement('button');
                tab.type = 'button';
                tab.className = 'inboxTab';
                tab.dataset.inbox = `custom:${label.id}`;
                tab.innerHTML = `${this._escapeHtml(label.name)}<span class="tabCount">${count}</span>`;
                this.domRefs.inboxTabs.insertBefore(tab, addBtn);
            });
        }

        // Update all tabs
        const tabs = this.domRefs.inboxTabs.querySelectorAll('.inboxTab');
        tabs.forEach(tab => {
            const inbox = tab.dataset.inbox;
            
            // Update active state
            if (inbox === this.emailRepository.getSelectedInbox()) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
            
            // Update count badges for built-in tabs
            if (inbox === 'primary' || inbox === 'promotions' || inbox === 'job') {
                let countBadge = tab.querySelector('.tabCount');
                if (!countBadge) {
                    countBadge = document.createElement('span');
                    countBadge.className = 'tabCount';
                    tab.appendChild(countBadge);
                }
                countBadge.textContent = counts[inbox] || 0;
            }
        });
    }
    
    /**
     * Simple HTML escape helper.
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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

    /**
     * Show categorization progress bar.
     * @param {number} current - Current count
     * @param {number} total - Total count
     */
    showCategorizationProgress(current, total) {
        if (!this.domRefs.categorizationProgress) return;
        
        this.domRefs.categorizationProgress.style.display = 'block';
        
        if (this.domRefs.categorizationProgressCount) {
            this.domRefs.categorizationProgressCount.textContent = `${current}/${total}`;
        }
        
        if (this.domRefs.categorizationProgressFill) {
            const percent = total > 0 ? Math.round((current / total) * 100) : 0;
            this.domRefs.categorizationProgressFill.style.width = `${percent}%`;
        }
    }

    /**
     * Hide categorization progress bar.
     */
    hideCategorizationProgress() {
        if (!this.domRefs.categorizationProgress) return;
        this.domRefs.categorizationProgress.style.display = 'none';
    }

    /**
     * Set processing shimmer on an email card.
     * @param {string} emailId - Email ID
     * @param {boolean} isProcessing - Whether it's processing
     */
    setEmailProcessing(emailId, isProcessing) {
        const card = this.domRefs.emailList?.querySelector(`.emailCard[data-email-id="${emailId}"]`);
        if (!card) return;
        
        if (isProcessing) {
            card.classList.add('processing');
        } else {
            card.classList.remove('processing');
            // Add categorized flash effect
            card.classList.add('categorized');
            setTimeout(() => card.classList.remove('categorized'), 600);
        }
    }

    /**
     * Render the stats dashboard with animated values.
     * @param {Object} stats - Stats object from calculateStats()
     */
    renderStatsDashboard(stats) {
        if (!this.domRefs.statsDashboard) return;

        // Animate total emails
        if (this.domRefs.statTotalEmails) {
            this.animateStatValue(this.domRefs.statTotalEmails, stats.totalEmails);
        }

        // Animate job applications
        if (this.domRefs.statJobApps) {
            this.animateStatValue(this.domRefs.statJobApps, stats.jobApps);
        }

        // Animate response rate
        if (this.domRefs.statResponseRate) {
            this.animateStatValue(this.domRefs.statResponseRate, stats.responseRate, '%');
        }

        // Render mini chart
        if (this.domRefs.statJobMiniChart) {
            this.renderMiniChart(stats.stages);
        }
    }

    /**
     * Animate a stat value with a pop effect.
     * @param {HTMLElement} element - The stat value element
     * @param {number} value - The value to display
     * @param {string} suffix - Optional suffix (e.g., '%')
     */
    animateStatValue(element, value, suffix = '') {
        const currentValue = parseInt(element.textContent) || 0;
        if (currentValue === value) return;

        element.setAttribute('data-animate', 'true');
        element.textContent = value + suffix;

        setTimeout(() => {
            element.removeAttribute('data-animate');
        }, 400);
    }

    /**
     * Render mini bar chart for job stages.
     * @param {Object} stages - Stages object with applied, interview, offer, rejected
     */
    renderMiniChart(stages) {
        const chart = this.domRefs.statJobMiniChart;
        if (!chart) return;

        const total = stages.applied + stages.interview + stages.offer + stages.rejected;
        if (total === 0) {
            chart.innerHTML = '';
            return;
        }

        const maxVal = Math.max(stages.applied, stages.interview, stages.offer, stages.rejected, 1);
        const scale = (val) => val > 0 ? Math.max(3, (val / maxVal) * 20) : 0;

        chart.innerHTML = `
            <div class="statMiniBar applied" style="height: ${scale(stages.applied)}px;" title="Applied: ${stages.applied}"></div>
            <div class="statMiniBar interview" style="height: ${scale(stages.interview)}px;" title="Interview: ${stages.interview}"></div>
            <div class="statMiniBar offer" style="height: ${scale(stages.offer)}px;" title="Offers: ${stages.offer}"></div>
            <div class="statMiniBar rejected" style="height: ${scale(stages.rejected)}px;" title="Rejected: ${stages.rejected}"></div>
        `;
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

