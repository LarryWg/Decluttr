/**
 * Email Assistant - Main Controller
 * Orchestrates all services and controllers
 */
import { initTheme } from '../../utils/theme.js';
import { DOMReferences } from './utils/domUtils.js';
import { EmailRepository } from './repositories/EmailRepository.js';
import { GmailApiService } from './services/GmailApiService.js';
import { EmailParserService } from './services/EmailParserService.js';
import { BackendApiService } from './services/BackendApiService.js';
import { EmailClassificationService } from './services/EmailClassificationService.js';
import { UnsubscribeService } from './services/UnsubscribeService.js';
import { SettingsService } from './services/SettingsService.js';
import { UIController } from './controllers/UIController.js';
import { EventController } from './controllers/EventController.js';
import { buildSankeyMaticText } from './services/SankeyPipelineService.js';
import { DEFAULT_INBOX, INBOX_CATEGORIES, CATEGORIZATION_CONCURRENCY, CATEGORIZATION_DELAY_MS } from './config/constants.js';

/**
 * Main Email Controller
 */
class EmailController {
    constructor() {
        // Initialize DOM references
        this.domRefs = new DOMReferences();
        
        // Initialize repository
        this.emailRepository = new EmailRepository();
        
        // Initialize services
        this.emailParserService = new EmailParserService();
        this.gmailApiService = new GmailApiService();
        this.settingsService = new SettingsService(this.domRefs);
        this.backendApiService = new BackendApiService(this.settingsService);
        this.emailClassificationService = new EmailClassificationService(
            this.emailRepository,
            this.emailParserService
        );
        this.unsubscribeService = new UnsubscribeService(this.emailRepository);
        
        // Initialize controllers
        this.uiController = new UIController(
            this.domRefs,
            this.emailRepository,
            this.emailClassificationService,
            this.backendApiService,
            this.unsubscribeService,
            (email) => this.applyJobLabelForEmail(email),
            (email) => this.ensureEmailFullContent(email),
            () => this.refreshPipelineView()
        );
        
        this.eventController = new EventController(
            this.domRefs,
            this,
            this.settingsService,
            this.uiController
        );
    }

    /**
     * Initialize the application
     */
    async init() {
        await this.settingsService.loadSettings();
        await initTheme();
        await this.emailRepository.loadUnsubscribedSenders();
        await this.emailRepository.loadJobLabelId();
        this.eventController.setupEventListeners();
        if (this.domRefs.inboxTabs) {
            this.uiController.updateInboxTabsUI();
        }
        await this.checkAuthAndInit();
    }

    /**
     * Check authentication and initialize UI.
     * Loads from storage first; if we have stored emails, show them immediately then incremental fetch (new only).
     */
    async checkAuthAndInit() {
        try {
            const isAuth = await isAuthenticated();
            if (isAuth) {
                const accountEmail = await getStoredAccountEmail();
                if (accountEmail) {
                    this.domRefs.accountEmailSpan.textContent = accountEmail;
                }
                this.domRefs.authSection.style.display = 'none';
                this.domRefs.emailListSection.style.display = 'block';

                await this.ensureJobLabel();
                await this.loadCustomLabelsIntoRepository();

                const hadStoredData = await this.emailRepository.loadFromStorage();
                if (hadStoredData) {
                    this.applyCacheToEmailList();
                    this.uiController.updateInboxTabsUI();
                    this.uiController.updateManagePromotionsButton();
                    this.uiController.renderEmailList();
                    this.uiController.updateLoadMoreButton();
                    this.uiController.renderStatsDashboard(this.calculateStats());
                    this.uiController.hideLoading();
                    this.runIncrementalFetch();
                    return;
                }
                await this.fetchAndDisplayEmails();
            } else {
                this.domRefs.authSection.style.display = 'block';
                this.domRefs.emailListSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Auth check error:', error);
            this.uiController.showError('Failed to check authentication status');
        }
    }

    /**
     * Fetch first page of message IDs, get only new emails, categorize new only, merge, save.
     */
    async runIncrementalFetch() {
        try {
            const { messageIds, nextPageToken } = await this.gmailApiService.fetchMessageIds();
            const existingIds = new Set(this.emailRepository.getEmails().map((e) => e.id));
            const newIds = messageIds.filter((id) => !existingIds.has(id));
            if (newIds.length === 0) {
                this.emailRepository.setNextPageToken(nextPageToken);
                await this.emailRepository.saveToStorage();
                return;
            }
            const newEmails = await this.gmailApiService.fetchEmailsByIds(newIds);
            const existing = this.emailRepository.getEmails();
            this.emailRepository.setEmails([...newEmails, ...existing]);
            this.emailRepository.setNextPageToken(nextPageToken);
            const autoCategorize = await this.settingsService.getAutoCategorize();
            if (autoCategorize && newEmails.length > 0) {
                await this.autoCategorizeEmails(newEmails);
            }
            await this.emailRepository.saveToStorage();
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();
            this.uiController.renderStatsDashboard(this.calculateStats());
        } catch (error) {
            console.error('Incremental fetch error:', error);
            if (!error.message.includes('Not authenticated') && !error.message.includes('401')) {
                this.uiController.showError('Failed to fetch new emails: ' + error.message);
            }
        }
    }

    /**
     * Ensure email has body and fullContent (fetch from Gmail if missing, e.g. after load from storage).
     * @param {Object} email - Email object (may be minimal)
     * @returns {Promise<void>}
     */
    async ensureEmailFullContent(email) {
        if (email.body != null && email.body !== '' && email.fullContent != null && email.fullContent !== '') {
            return;
        }
        const full = await this.gmailApiService.fetchEmailDetailsById(email.id);
        email.body = full.body || '';
        email.fullContent = full.fullContent || '';
    }

    /**
     * Handle Gmail connection
     */
    async handleGmailConnect() {
        try {
            this.uiController.showLoading('Connecting to Gmail...');
            this.uiController.hideError();
            this.uiController.hideSuccess();

            // Clear any existing token to force account selection
            const existingToken = await new Promise((resolve) => {
                chrome.storage.local.get(['gmail_access_token'], (result) => {
                    resolve(result.gmail_access_token || null);
                });
            });
            
            if (existingToken) {
                chrome.identity.removeCachedAuthToken({ token: existingToken }, () => {});
                await chrome.storage.local.remove(['gmail_access_token', 'gmail_account_email']);
            }

            // Get auth token (this will trigger OAuth flow with account selection)
            const token = await getAuthToken();
            
            if (!token) {
                throw new Error('Failed to get authentication token');
            }

            // Get account email
            const email = await getStoredAccountEmail();
            if (email) {
                this.domRefs.accountEmailSpan.textContent = email;
            }

            // Hide auth section, show email list
            this.domRefs.authSection.style.display = 'none';
            this.domRefs.emailListSection.style.display = 'block';
            this.uiController.hideLoading();

            // Fetch emails
            await this.fetchAndDisplayEmails();
            
            this.uiController.showSuccess('Successfully connected to Gmail');
            setTimeout(() => this.uiController.hideSuccess(), 3000);
        } catch (error) {
            this.uiController.hideLoading();
            console.error('Gmail connection error:', error);
            
            if (error.message.includes('OAuth') || error.message.includes('auth')) {
                this.uiController.showError('Failed to authenticate with Gmail. Please try again.');
            } else {
                this.uiController.showError('Failed to connect to Gmail: ' + error.message);
            }
        }
    }

    /**
     * Handle logout
     */
    async handleLogout() {
        try {
            this.uiController.showLoading('Logging out...');
            await revokeToken();
            
            // Clear UI
            this.domRefs.authSection.style.display = 'block';
            this.domRefs.emailListSection.style.display = 'none';
            this.domRefs.emailList.innerHTML = '';
            this.emailRepository.setEmails([]);
            this.emailRepository.clearCache();
            this.emailRepository.setNextPageToken(null);
            
            this.uiController.hideLoading();
            this.uiController.showSuccess('Logged out successfully');
            setTimeout(() => this.uiController.hideSuccess(), 2000);
        } catch (error) {
            this.uiController.hideLoading();
            console.error('Logout error:', error);
            this.uiController.showError('Failed to logout: ' + error.message);
        }
    }

    /**
     * Fetch and display emails.
     * On Refresh: reuses existing email objects when IDs are still in Gmail's first page so
     * categories and cache stay correct; sorts by date (newest first) for stable order.
     */
    async fetchAndDisplayEmails() {
        try {
            this.uiController.showLoading('Fetching emails...');
            this.uiController.hideError();
            this.uiController.hideSuccess();
            this.domRefs.emailList.innerHTML = '';

            const currentEmails = this.emailRepository.getEmails();
            const currentById = new Map(currentEmails.map((e) => [e.id, e]));

            const { messageIds, nextPageToken } = await this.gmailApiService.fetchMessageIds();
            this.emailRepository.setNextPageToken(nextPageToken);

            const idsToFetch = messageIds.filter((id) => !currentById.has(id));
            const newEmails = idsToFetch.length > 0 ? await this.gmailApiService.fetchEmailsByIds(idsToFetch) : [];
            const newById = new Map(newEmails.map((e) => [e.id, e]));
            const merged = messageIds.map((id) => currentById.get(id) || newById.get(id)).filter(Boolean);
            this.sortEmailsByDateDesc(merged);
            this.emailRepository.setEmails(merged);

            this.applyCacheToEmailList();
            this.uiController.hideLoading();
            this.emailRepository.setSelectedInbox(DEFAULT_INBOX);
            this.uiController.updateInboxTabsUI();
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();
            this.uiController.renderStatsDashboard(this.calculateStats());

            const autoCategorize = await this.settingsService.getAutoCategorize();
            if (autoCategorize && merged.length > 0) {
                await this.autoCategorizeEmails(merged);
            }
            await this.emailRepository.saveToStorage();
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();
            this.uiController.renderStatsDashboard(this.calculateStats());
        } catch (error) {
            this.uiController.hideLoading();
            console.error('Fetch emails error:', error);
            
            if (error.message.includes('Not authenticated')) {
                this.uiController.showError('Not authenticated. Please connect your Gmail account.');
                this.domRefs.authSection.style.display = 'block';
                this.domRefs.emailListSection.style.display = 'none';
            } else if (error.message.includes('401')) {
                this.uiController.showError('Authentication expired. Please reconnect your Gmail account.');
                this.domRefs.authSection.style.display = 'block';
                this.domRefs.emailListSection.style.display = 'none';
            } else {
                this.uiController.showError('Failed to fetch emails: ' + error.message);
            }
        }
    }

    /**
     * Load more emails (pagination)
     */
    async loadMoreEmails() {
        if (this.emailRepository.isLoadingMore() || !this.emailRepository.getNextPageToken()) {
            return;
        }
        
        try {
            this.emailRepository.setLoadingMore(true);
            if (this.domRefs.loadMoreBtn) {
                this.domRefs.loadMoreBtn.disabled = true;
                this.domRefs.loadMoreBtn.textContent = 'Loading...';
            }
            
            const result = await this.gmailApiService.fetchEmailList(this.emailRepository.getNextPageToken());
            const newEmails = result.emails;
            this.emailRepository.setNextPageToken(result.nextPageToken);
            
            // Add new emails to current list
            this.emailRepository.addEmails(newEmails);
            
            const autoCategorize = await this.settingsService.getAutoCategorize();
            if (autoCategorize) {
                await this.autoCategorizeEmails(newEmails);
            }
            
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();
            this.uiController.renderStatsDashboard(this.calculateStats());
            await this.emailRepository.saveToStorage();
        } catch (error) {
            console.error('Load more emails error:', error);
            this.uiController.showError('Failed to load more emails: ' + error.message);
        } finally {
            this.emailRepository.setLoadingMore(false);
            if (this.domRefs.loadMoreBtn) {
                this.domRefs.loadMoreBtn.disabled = false;
                this.domRefs.loadMoreBtn.textContent = 'Load More';
            }
        }
    }

    /**
     * Open selected senders' first email in Gmail so user can use Gmail's Unsubscribe button.
     */
    openSelectedSendersInGmail() {
        if (!this.domRefs.senderList) return;
        const checkboxes = this.domRefs.senderList.querySelectorAll('.senderCheckbox:checked');
        if (checkboxes.length === 0) {
            this.uiController.showError('Select at least one sender');
            return;
        }
        const selectedDomains = Array.from(checkboxes).map(cb => cb.dataset.domain).filter(Boolean);
        const senderGroups = this.emailClassificationService.groupEmailsBySender();
        const gmailBase = 'https://mail.google.com/mail/u/0/#inbox/';
        selectedDomains.forEach((domain, index) => {
            const sender = senderGroups.get(domain);
            if (sender?.emails?.length > 0 && sender.emails[0].threadId) {
                setTimeout(() => {
                    window.open(gmailBase + sender.emails[0].threadId, '_blank', 'noopener');
                }, index * 300);
            }
        });
        if (this.domRefs.unsubscribeModal) {
            this.domRefs.unsubscribeModal.style.display = 'none';
        }
    }

    /**
     * Calculate stats for the dashboard.
     * @returns {Object} Stats object with totalEmails, jobApps, stages, responseRate
     */
    calculateStats() {
        const emails = this.emailRepository.getEmails();
        const jobEmails = this.emailRepository.getJobEmails();
        const totalEmails = emails.length;
        const jobApps = jobEmails.length;

        // Count stages
        const stages = {
            applied: 0,
            interview: 0,
            offer: 0,
            rejected: 0,
            noResponse: 0
        };

        for (const email of jobEmails) {
            const cached = this.emailRepository.getCachedResult(email.id);
            // Prefer user override, then transitionTo, then jobType
            const stage = cached?.userOverrideJobType || cached?.transitionTo || cached?.jobType;
            
            if (stage) {
                if (stage === 'Applications Sent' || stage === 'applications_sent' || stage === 'application_confirmation') {
                    stages.applied++;
                } else if (stage === 'Interview' || stage === 'interview' || stage === 'OA / Screening' || stage === 'oa_screening') {
                    stages.interview++;
                } else if (stage === 'Offer' || stage === 'offer' || stage === 'Accepted' || stage === 'accepted') {
                    stages.offer++;
                } else if (stage === 'Rejected' || stage === 'rejected' || stage === 'rejection' || stage === 'declined') {
                    stages.rejected++;
                } else if (stage === 'No Response' || stage === 'no_response') {
                    stages.noResponse++;
                }
            } else {
                stages.applied++;
            }
        }

        // Response rate = (interview + offer + rejected) / applied
        const responded = stages.interview + stages.offer + stages.rejected;
        const responseRate = stages.applied > 0 ? Math.round((responded / (stages.applied + responded)) * 100) : 0;

        return {
            totalEmails,
            jobApps,
            stages,
            responseRate
        };
    }

    /**
     * Apply cached AI results to current email list (inboxCategory) so Job/Primary/Promotions
     * are correct on first render without waiting for autoCategorize.
     */
    applyCacheToEmailList() {
        const emails = this.emailRepository.getEmails();
        for (const email of emails) {
            const cached = this.emailRepository.getCachedResult(email.id);
            if (cached) {
                email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(cached.category, cached.jobType, cached.hasUnsubscribe);
            }
        }
    }

    /**
     * Sort email array by date descending (newest first). Mutates and returns the array.
     * @param {Array} emails - Array of email objects with .date
     * @returns {Array} Same array, sorted
     */
    sortEmailsByDateDesc(emails) {
        return emails.sort((a, b) => {
            const tA = new Date(a.date || 0).getTime();
            const tB = new Date(b.date || 0).getTime();
            return tB - tA;
        });
    }

    /**
     * Auto-categorize emails in the background with visual progress feedback.
     * @param {Array} emails - Array of emails to categorize
     */
    async autoCategorizeEmails(emails) {
        const concurrency = CATEGORIZATION_CONCURRENCY;
        const delayMs = CATEGORIZATION_DELAY_MS;
        const uncachedEmails = emails.filter(e => !this.emailRepository.getCachedResult(e.id));
        const totalToProcess = uncachedEmails.length;
        let processed = 0;

        // Show progress bar if there are emails to process
        if (totalToProcess > 0) {
            this.uiController.showCategorizationProgress(0, totalToProcess);
        }

        for (let i = 0; i < emails.length; i += concurrency) {
            const batch = emails.slice(i, i + concurrency);
            await Promise.all(batch.map(async (email) => {
                const cachedResults = this.emailRepository.getCachedResult(email.id);
                if (cachedResults) {
                    email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(cachedResults.category, cachedResults.jobType, cachedResults.hasUnsubscribe);
                    if (email.inboxCategory === INBOX_CATEGORIES.JOB) {
                        await this.applyJobLabelForEmail(email);
                    }
                    return;
                }
                
                // Show shimmer on this card
                this.uiController.setEmailProcessing(email.id, true);
                
                try {
                    const results = await this.backendApiService.processEmailWithAI(email);
                    this.emailRepository.setCache(email.id, results);
                    const mappedCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category, results.jobType, results.hasUnsubscribe);
                    email.inboxCategory = mappedCategory;
                    if (mappedCategory === INBOX_CATEGORIES.JOB) {
                        await this.applyJobLabelForEmail(email).catch(err => console.error(`Job label error for ${email.id}:`, err));
                    }
                } catch (error) {
                    console.error(`Failed to auto-categorize email ${email.id}:`, error);
                } finally {
                    // Remove shimmer and show success flash
                    this.uiController.setEmailProcessing(email.id, false);
                    processed++;
                    if (totalToProcess > 0) {
                        this.uiController.showCategorizationProgress(processed, totalToProcess);
                    }
                }
            }));
            await this.emailRepository.saveToStorage().catch((err) => console.warn('Save after batch:', err));
            this.uiController.renderEmailList();
            this.uiController.renderStatsDashboard(this.calculateStats());
            if (i + concurrency < emails.length) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        // Hide progress bar when done
        if (totalToProcess > 0) {
            setTimeout(() => this.uiController.hideCategorizationProgress(), 500);
        }
    }

    /**
     * Ensure the Gmail "Decluttr/Job" label exists (create if missing or deleted).
     * Called when the email list loads so the label is recreated after cache clear or user deletion.
     */
    async ensureJobLabel() {
        try {
            const labelId = await this.gmailApiService.getOrCreateJobLabel();
            this.emailRepository.setJobLabelId(labelId);
        } catch (err) {
            console.warn('Could not ensure Decluttr/Job label:', err);
        }
    }

    /**
     * Apply Gmail "Decluttr/Job" label to an email (used by auto-categorize and manual "Process with AI").
     * @param {Object} email - Email object
     */
    async applyJobLabelForEmail(email) {
        const jobLabelId = this.emailRepository.getJobLabelId();
        const hasJobLabel = jobLabelId && email.labelIds && Array.isArray(email.labelIds) && email.labelIds.includes(jobLabelId);
        if (hasJobLabel) return;
        let labelId = jobLabelId;
        if (!labelId) {
            labelId = await this.gmailApiService.getOrCreateJobLabel();
            this.emailRepository.setJobLabelId(labelId);
        }
        const labelResult = await this.gmailApiService.addLabelToMessages([email.id], labelId);
        if (labelResult.success.length > 0) {
            email.labelIds = [...(email.labelIds || []), labelId];
        }
        if (labelResult.failed.length > 0) {
            console.warn(`Failed to add job label to ${email.id}:`, labelResult.failed[0].error);
        }
    }

    /**
     * Render the custom auto-labels list in settings (fetch from storage and populate DOM).
     */
    async renderCustomLabelsList() {
        const listEl = this.domRefs.customLabelsList;
        if (!listEl) return;
        const labels = await this.settingsService.getCustomLabels();
        listEl.innerHTML = '';
        labels.forEach((label) => {
            const applyToInbox = label.applyToInbox !== false;
            const card = document.createElement('div');
            card.className = 'customLabelCard';
            card.dataset.labelId = label.id;
            
            const body = document.createElement('div');
            body.className = 'customLabelCardBody';
            
            const nameEl = document.createElement('div');
            nameEl.className = 'customLabelCardName';
            nameEl.textContent = label.name;
            
            const descEl = document.createElement('div');
            descEl.className = 'customLabelCardDescription';
            descEl.textContent = label.description || '';
            body.appendChild(nameEl);
            body.appendChild(descEl);
            
            // Sync to Gmail toggle row
            const syncRow = document.createElement('div');
            syncRow.className = 'customLabelCardAddToGmail';
            
            const syncLabel = document.createElement('span');
            syncLabel.className = 'customLabelApplyLabel';
            syncLabel.textContent = 'Sync to Gmail';
            
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'settingToggle settingToggleSmall';
            
            const toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.id = `customLabelApply-${label.id}`;
            toggleInput.checked = applyToInbox;
            toggleInput.dataset.labelId = label.id;
            
            const toggleSlider = document.createElement('span');
            toggleSlider.className = 'settingToggleSlider';
            
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSlider);
            
            syncRow.appendChild(syncLabel);
            syncRow.appendChild(toggleLabel);
            body.appendChild(syncRow);
            card.appendChild(body);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'customLabelDeleteBtn';
            deleteBtn.innerHTML = '×';
            deleteBtn.setAttribute('aria-label', `Remove label ${label.name}`);
            deleteBtn.dataset.labelId = label.id;
            card.appendChild(deleteBtn);
            
            listEl.appendChild(card);
            toggleInput.addEventListener('change', (e) => this.handleCustomLabelApplyToInboxChange(label.id, e.target.checked));
        });
    }

    /**
     * Persist "Add to Gmail" checkbox change for a custom label.
     * @param {string} labelId
     * @param {boolean} applyToInbox
     */
    async handleCustomLabelApplyToInboxChange(labelId, applyToInbox) {
        const labels = await this.settingsService.getCustomLabels();
        const updated = labels.map((l) => (l.id === labelId ? { ...l, applyToInbox } : l));
        await this.settingsService.saveCustomLabels(updated);
    }

    /**
     * Add a new custom auto-label: create in Gmail, save to storage, re-render list.
     * When called from the + modal, pass name and description; otherwise read from settings form.
     * @param {string} [name] - Optional; if provided with description, use these (e.g. from modal).
     * @param {string} [description] - Optional.
     */
    async handleAddCustomLabel(name, description) {
        const fromModal = typeof name === 'string' && typeof description === 'string';
        const nameInput = fromModal ? null : this.domRefs.customLabelNameInput;
        const descInput = fromModal ? null : this.domRefs.customLabelDescriptionInput;
        const finalName = fromModal ? name.trim() : (nameInput?.value ?? '').trim();
        const finalDesc = fromModal ? description.trim() : (descInput?.value ?? '').trim();
        if (!finalName) {
            this.uiController.showError('Please enter a label name');
            return;
        }
        if (!finalDesc) {
            this.uiController.showError('Please describe what kind of emails should get this label');
            return;
        }
        try {
            this.uiController.hideError();
            this.uiController.showLoading('Creating label in Gmail...');
            const gmailLabelId = await this.gmailApiService.getOrCreateCustomLabel(finalName);
            const labels = await this.settingsService.getCustomLabels();
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
            labels.push({ id, name: finalName, description: finalDesc, gmailLabelId, applyToInbox: false });
            await this.settingsService.saveCustomLabels(labels);
            if (!fromModal && nameInput) nameInput.value = '';
            if (!fromModal && descInput) descInput.value = '';
            await this.renderCustomLabelsList();
            await this.loadCustomLabelsIntoRepository();
            this.uiController.updateInboxTabsUI();
            this.uiController.hideLoading();
            if (fromModal) {
                this.closeAddCustomLabelModal();
                this.uiController.showLoading('Applying label to matching emails...');
                const labeled = await this.applySingleCustomLabelToInbox({ id, name: finalName, description: finalDesc, gmailLabelId });
                this.uiController.hideLoading();
                if (labeled > 0) {
                    this.emailRepository.setSelectedInbox(`custom:${id}`);
                    this.uiController.updateInboxTabsUI();
                    this.uiController.showEmailListView();
                    this.uiController.renderEmailList();
                }
                this.uiController.showSuccess(`Label "${finalName}" created and applied to matching emails. Use Settings to toggle "Add to Gmail" for future runs.`);
            } else {
                this.uiController.showSuccess(`Label "${finalName}" created. Use "Apply labels to inbox" in Settings to run AI matching.`);
            }
            setTimeout(() => this.uiController.hideSuccess(), 3000);
        } catch (err) {
            this.uiController.hideLoading();
            this.uiController.showError(err.message || 'Failed to add label');
        }
    }

    /**
     * Run AI matching for one custom label on current inbox emails and add Gmail label to matching ones.
     * If inbox is empty, fetches emails first.
     * @param {Object} label - { id, name, description, gmailLabelId }
     */
    async applySingleCustomLabelToInbox(label) {
        let emails = this.emailRepository.getEmails();
        if (emails.length === 0) {
            this.uiController.showLoading('Loading emails to apply label...');
            try {
                const result = await this.gmailApiService.fetchEmailList();
                this.emailRepository.setEmails(result.emails);
                this.emailRepository.setNextPageToken(result.nextPageToken);
                emails = result.emails;
            } finally {
                this.uiController.hideLoading();
            }
            if (emails.length === 0) {
                this.uiController.showError('No emails in inbox. Refresh your inbox first.');
                return;
            }
        }
        emails = emails.filter((e) => e.inboxCategory === INBOX_CATEGORIES.PRIMARY);
        const delayMs = 350;
        let labeled = 0;
        for (const email of emails) {
            const hasLabel = email.labelIds && email.labelIds.includes(label.gmailLabelId);
            if (hasLabel) continue;
            await this.ensureEmailFullContent(email);
            const content = email.fullContent || (email.subject || '') + '\n' + (email.snippet || '');
            if (!content.trim()) continue;
            try {
                let match = this.emailRepository.getCustomLabelMatchCache(email.id, label.id);
                if (match === undefined) {
                    const res = await this.backendApiService.matchCustomLabel(content, label.name, label.description);
                    match = res.match;
                    this.emailRepository.setCustomLabelMatchCache(email.id, label.id, match);
                }
                if (match) {
                    const result = await this.gmailApiService.addLabelToMessages([email.id], label.gmailLabelId);
                    if (result.success && result.success.length > 0) {
                        email.labelIds = [...(email.labelIds || []), label.gmailLabelId];
                        labeled++;
                    }
                }
            } catch (err) {
                console.warn(`Custom label "${label.name}" match failed for ${email.id}:`, err);
            }
            await new Promise((r) => setTimeout(r, delayMs));
        }
        await this.emailRepository.saveToStorage();
        if (labeled === 0 && emails.length > 0) {
            this.uiController.showSuccess(`Label "${label.name}" created. No matching emails in current inbox.`);
            setTimeout(() => this.uiController.hideSuccess(), 3000);
        }
        return labeled;
    }

    /** Show the Add Custom Label modal (opened by + beside Pipeline). */
    openAddCustomLabelModal() {
        const modal = this.domRefs.addCustomLabelModal;
        const nameInput = this.domRefs.addCustomLabelModalName;
        const descInput = this.domRefs.addCustomLabelModalDescription;
        if (modal) modal.style.display = 'flex';
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
    }

    /** Close the Add Custom Label modal and clear inputs. */
    closeAddCustomLabelModal() {
        const modal = this.domRefs.addCustomLabelModal;
        const nameInput = this.domRefs.addCustomLabelModalName;
        const descInput = this.domRefs.addCustomLabelModalDescription;
        if (modal) modal.style.display = 'none';
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';
    }

    /**
     * Remove a custom auto-label from storage (Gmail label is left as-is; we just stop applying it).
     * @param {string} labelId - Our internal label id
     */
    async handleRemoveCustomLabel(labelId) {
        const labels = await this.settingsService.getCustomLabels();
        const filtered = labels.filter((l) => l.id !== labelId);
            await this.settingsService.saveCustomLabels(filtered);
            await this.loadCustomLabelsIntoRepository();
            await this.renderCustomLabelsList();
            this.uiController.updateInboxTabsUI();
            this.uiController.showSuccess('Label removed');
            setTimeout(() => this.uiController.hideSuccess(), 2000);
    }

    /** Load custom labels from settings into repository and refresh custom-label tabs. */
    async loadCustomLabelsIntoRepository() {
        const labels = await this.settingsService.getCustomLabels();
        this.emailRepository.setCustomLabels(labels);
    }

    /**
     * For each custom label, run AI match on current inbox emails and add Gmail label to matching ones.
     */
    async handleApplyCustomLabelsToInbox() {
        const labels = await this.settingsService.getCustomLabels();
        if (labels.length === 0) {
            this.uiController.showError('Add at least one custom label first');
            return;
        }
        const emails = this.emailRepository.getEmails();
        if (emails.length === 0) {
            this.uiController.showError('No emails in inbox. Refresh to load emails first.');
            return;
        }
        try {
            this.uiController.hideError();
            this.uiController.showLoading('Applying custom labels...');
            let processed = 0;
            let labeled = 0;
            const delayMs = 350;
            for (const email of emails) {
                if (this.emailRepository.isJobEmail(email)) continue;
                await this.ensureEmailFullContent(email);
                const content = email.fullContent || (email.subject || '') + '\n' + (email.snippet || '');
                if (!content.trim()) continue;
                for (const label of labels) {
                    const applyToGmail = label.applyToInbox !== false;
                    const hasLabel = email.labelIds && email.labelIds.includes(label.gmailLabelId);
                    if (hasLabel) continue;
                    try {
                        let match = this.emailRepository.getCustomLabelMatchCache(email.id, label.id);
                        if (match === undefined) {
                            const res = await this.backendApiService.matchCustomLabel(content, label.name, label.description);
                            match = res.match;
                            this.emailRepository.setCustomLabelMatchCache(email.id, label.id, match);
                        }
                        if (match && applyToGmail) {
                            const result = await this.gmailApiService.addLabelToMessages([email.id], label.gmailLabelId);
                            if (result.success.length > 0) {
                                email.labelIds = [...(email.labelIds || []), label.gmailLabelId];
                                labeled++;
                            }
                        }
                    } catch (err) {
                        console.warn(`Custom label "${label.name}" match failed for ${email.id}:`, err);
                    }
                    await new Promise((r) => setTimeout(r, delayMs));
                }
                processed++;
            }
            this.uiController.hideLoading();
            this.uiController.showSuccess(`Done. Processed ${processed} emails; applied labels ${labeled} time(s).`);
            setTimeout(() => this.uiController.hideSuccess(), 4000);
        } catch (err) {
            this.uiController.hideLoading();
            this.uiController.showError(err.message || 'Failed to apply labels');
        }
    }

    /**
     * Switch to a different inbox view
     * @param {string} newInbox - New inbox category to switch to (primary, promotions, job, pipeline)
     */
    switchInbox(newInbox) {
        if (newInbox === this.emailRepository.getSelectedInbox()) return;

        this.emailRepository.setSelectedInbox(newInbox);
        this.emailRepository.saveToStorage().catch((err) => console.warn('Save on inbox switch:', err));
        this.uiController.updateInboxTabsUI();

        if (newInbox === 'pipeline') {
            const jobEmails = this.emailRepository.getJobEmails();
            const sankeyText = buildSankeyMaticText(jobEmails, this.emailRepository, this.emailParserService);
            this.uiController.showPipelineView(sankeyText);
        } else {
            this.uiController.showEmailListView();
            this.uiController.updateManagePromotionsButton();
            this.uiController.renderEmailList();
        }
    }

    /**
     * Refresh the Pipeline view text from current job emails (e.g. after user clicks Refresh).
     */
    refreshPipelineView() {
        if (this.emailRepository.getSelectedInbox() !== 'pipeline') return;
        const jobEmails = this.emailRepository.getJobEmails();
        const sankeyText = buildSankeyMaticText(jobEmails, this.emailRepository, this.emailParserService);
        this.uiController.setPipelineContent(sankeyText);
        if (this.domRefs.sankeyDiagramContainer?.style.display === 'block') {
            this.uiController.showPipelineDiagramView();
        }
    }

    /**
     * Process unsubscribe and delete for selected senders
     * @param {boolean} deleteEmails - Whether to delete emails after unsubscribing
     */
    async processUnsubscribeAndDelete(deleteEmails = false) {
        if (!this.domRefs.senderList || !this.domRefs.confirmUnsubscribeBtn) return;
        
        const checkboxes = this.domRefs.senderList.querySelectorAll('.senderCheckbox:checked');
        if (checkboxes.length === 0) {
            this.uiController.showError('Please select at least one sender to unsubscribe from');
            return;
        }
        
        const selectedDomains = Array.from(checkboxes).map(cb => cb.dataset.domain);
        const senderGroups = this.emailClassificationService.groupEmailsBySender();
        const selectedSenders = selectedDomains.map(domain => senderGroups.get(domain)).filter(Boolean);
        
        // Disable button and show loading
        this.domRefs.confirmUnsubscribeBtn.disabled = true;
        this.domRefs.confirmUnsubscribeBtn.textContent = 'Processing…';
        
        const results = {
            success: [],
            failed: [],
            needsFilter: [],
            deleted: []
        };
        
        try {
            for (const sender of selectedSenders) {
                try {
                    // Step 1: Unsubscribe
                    let unsubscribed = false;
                    
                    if (sender.unsubscribeMethod === 'url' && sender.unsubscribeUrl) {
                        const requiresPost = sender.requiresPost || false;
                        const result = await this.unsubscribeService.unsubscribeViaUrl(sender.unsubscribeUrl, requiresPost);
                        if (result.success) {
                            await this.emailRepository.markUnsubscribed(sender.domain);
                            results.success.push({ ...sender, ...result });
                            unsubscribed = true;
                        } else {
                            results.failed.push({ sender, ...result });
                        }
                    } else if (sender.unsubscribeMethod === 'mailto' && sender.unsubscribeUrl) {
                        const result = await this.unsubscribeService.unsubscribeViaMailto(sender.unsubscribeUrl, sender.domain);
                        if (result.success) {
                            await this.emailRepository.markUnsubscribed(sender.domain);
                            results.success.push({ ...sender, ...result });
                            unsubscribed = true;
                        } else {
                            results.failed.push({ sender, ...result });
                        }
                    } else {
                        results.needsFilter.push(sender);
                    }
                    
                    // Step 2: Trash emails if requested
                    if (deleteEmails && sender.emailIds && sender.emailIds.length > 0) {
                        try {
                            const trashResult = await this.gmailApiService.trashEmails(sender.emailIds);
                            if (trashResult.success.length > 0) {
                                results.deleted.push({
                                    domain: sender.domain,
                                    count: trashResult.success.length
                                });
                                const currentEmails = this.emailRepository.getEmails();
                                const remainingEmails = currentEmails.filter(
                                    email => !trashResult.success.includes(email.id)
                                );
                                this.emailRepository.setEmails(remainingEmails);
                            }
                            const failed403 = trashResult.failed.some(f => f.status === 403);
                            if (failed403 && trashResult.success.length === 0) {
                                this.uiController.showError('To move emails to trash, log out and connect Gmail again (new permission required).');
                            } else if (trashResult.failed.length > 0) {
                                console.warn(`Failed to trash ${trashResult.failed.length} emails from ${sender.domain}`);
                            }
                        } catch (deleteError) {
                            console.error(`Failed to trash emails from ${sender.domain}:`, deleteError);
                            this.uiController.showError('Failed to move emails to trash: ' + deleteError.message);
                        }
                    }
                    
                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    results.failed.push({ sender, error: error.message, verified: false });
                }
            }
            
            // Show results
            this.uiController.showUnsubscribeResults(results, deleteEmails);
            
            // Refresh email list to reflect deletions
            if (deleteEmails && results.deleted.length > 0) {
                this.uiController.renderEmailList();
            }
            
        } catch (error) {
            this.uiController.showError('Failed to process unsubscribe: ' + error.message);
        } finally {
            this.domRefs.confirmUnsubscribeBtn.disabled = false;
            this.domRefs.confirmUnsubscribeBtn.textContent = 'Unsubscribe & optionally trash';
        }
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
    const emailController = new EmailController();
    await emailController.init();

    // Persist state when user leaves the tab so next session restores correctly
    const saveOnLeave = () => {
        emailController.emailRepository.saveToStorage().catch(() => {});
    };
    window.addEventListener('pagehide', saveOnLeave);
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') saveOnLeave();
    });
});
