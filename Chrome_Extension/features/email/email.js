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
import { DEFAULT_INBOX, INBOX_CATEGORIES } from './config/constants.js';

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
            (email) => this.ensureEmailFullContent(email)
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

                const hadStoredData = await this.emailRepository.loadFromStorage();
                if (hadStoredData) {
                    this.uiController.updateInboxTabsUI();
                    this.uiController.updateManagePromotionsButton();
                    this.uiController.renderEmailList();
                    this.uiController.updateLoadMoreButton();
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
                this.uiController.showLoading('Categorizing new emails...');
                await this.autoCategorizeEmails(newEmails);
                this.uiController.hideLoading();
            }
            await this.emailRepository.saveToStorage();
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();
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
     * Fetch and display emails
     */
    async fetchAndDisplayEmails() {
        try {
            this.uiController.showLoading('Fetching emails...');
            this.uiController.hideError();
            this.uiController.hideSuccess();
            this.domRefs.emailList.innerHTML = '';
            
            // Reset pagination
            this.emailRepository.setNextPageToken(null);
            this.emailRepository.setEmails([]);
            
            const result = await this.gmailApiService.fetchEmailList();
            this.emailRepository.setEmails(result.emails);
            this.emailRepository.setNextPageToken(result.nextPageToken);
            
            this.uiController.hideLoading();
            
            const autoCategorize = await this.settingsService.getAutoCategorize();
            if (autoCategorize && this.emailRepository.getEmails().length > 0) {
                this.uiController.showLoading('Categorizing emails...');
                await this.autoCategorizeEmails(this.emailRepository.getEmails());
                this.uiController.hideLoading();
            }
            
            // Reset to primary inbox when fetching new emails
            this.emailRepository.setSelectedInbox(DEFAULT_INBOX);
            this.uiController.updateInboxTabsUI();
            
            // Render filtered emails
            this.uiController.renderEmailList();
            this.uiController.updateLoadMoreButton();

            await this.emailRepository.saveToStorage();
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
     * Auto-categorize emails in the background
     * @param {Array} emails - Array of emails to categorize
     */
    async autoCategorizeEmails(emails) {
        const concurrency = 3;
        const delayMs = 400;
        for (let i = 0; i < emails.length; i += concurrency) {
            const batch = emails.slice(i, i + concurrency);
            await Promise.all(batch.map(async (email) => {
                const cachedResults = this.emailRepository.getCachedResult(email.id);
                if (cachedResults) {
                    email.inboxCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(cachedResults.category, cachedResults.jobType);
                    if (email.inboxCategory === INBOX_CATEGORIES.JOB) {
                        await this.applyJobLabelForEmail(email);
                    }
                    return;
                }
                try {
                    const results = await this.backendApiService.processEmailWithAI(email);
                    this.emailRepository.setCache(email.id, results);
                    const mappedCategory = this.emailClassificationService.mapAiCategoryToInboxCategory(results.category, results.jobType);
                    email.inboxCategory = mappedCategory;
                    if (mappedCategory === INBOX_CATEGORIES.JOB) {
                        await this.applyJobLabelForEmail(email).catch(err => console.error(`Job label error for ${email.id}:`, err));
                    }
                } catch (error) {
                    console.error(`Failed to auto-categorize email ${email.id}:`, error);
                }
            }));
            if (i + concurrency < emails.length) {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
        this.uiController.renderEmailList();
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
