import { setTheme } from '../../../utils/theme.js';

/**
 * Event Controller - Handles all event listeners setup
 */
export class EventController {
    constructor(domRefs, emailController, settingsService, uiController) {
        this.domRefs = domRefs;
        this.emailController = emailController;
        this.settingsService = settingsService;
        this.uiController = uiController;
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Navigation
        this.domRefs.backBtn.addEventListener('click', () => {
            window.location.href = '../../popup/App.html';
        });

        // Settings
        this.domRefs.settingsBtn.addEventListener('click', () => {
            const isVisible = this.domRefs.settingsPanel.style.display !== 'none';
            this.domRefs.settingsPanel.style.display = isVisible ? 'none' : 'block';
        });

        if (this.domRefs.themeSelect) {
            this.domRefs.themeSelect.addEventListener('change', async () => {
                await setTheme(this.domRefs.themeSelect.value);
            });
        }

        if (this.domRefs.autoCategorizeCheckbox) {
            this.domRefs.autoCategorizeCheckbox.addEventListener('change', async () => {
                await this.settingsService.setAutoCategorize(this.domRefs.autoCategorizeCheckbox.checked);
            });
        }

        if (this.domRefs.developerOptionsToggle && this.domRefs.developerOptionsContent) {
            this.domRefs.developerOptionsToggle.addEventListener('click', () => {
                const expanded = this.domRefs.developerOptionsContent.hidden;
                this.domRefs.developerOptionsContent.hidden = !expanded;
                this.domRefs.developerOptionsToggle.setAttribute('aria-expanded', String(expanded));
            });
        }

        if (this.domRefs.saveBackendUrlBtn) {
            this.domRefs.saveBackendUrlBtn.addEventListener('click', async () => {
            try {
                await this.settingsService.saveBackendUrl();
                this.uiController.showSuccess('Backend URL saved successfully');
                setTimeout(() => {
                    this.domRefs.settingsPanel.style.display = 'none';
                }, 1500);
            } catch (error) {
                this.uiController.showError(error.message);
            }
        });
        }

        if (this.domRefs.copyRedirectUriBtn) {
            this.domRefs.copyRedirectUriBtn.addEventListener('click', async () => {
            if (this.domRefs.redirectUriDisplay.value) {
                try {
                    await navigator.clipboard.writeText(this.domRefs.redirectUriDisplay.value);
                    this.uiController.showSuccess('Redirect URI copied to clipboard!');
                    setTimeout(() => this.uiController.hideSuccess(), 2000);
                } catch (error) {
                    // Fallback: select text for manual copy
                    this.domRefs.redirectUriDisplay.select();
                    document.execCommand('copy');
                    this.uiController.showSuccess('Redirect URI selected - press Ctrl+C (or Cmd+C) to copy');
                    setTimeout(() => this.uiController.hideSuccess(), 2000);
                }
            }
        });
        }

        if (this.domRefs.logoutBtn) {
            this.domRefs.logoutBtn.addEventListener('click', async () => {
            await this.emailController.handleLogout();
        });
        }

        // Authentication
        this.domRefs.connectGmailBtn.addEventListener('click', async () => {
            await this.emailController.handleGmailConnect();
        });

        // Email list
        this.domRefs.refreshBtn.addEventListener('click', async () => {
            await this.emailController.fetchAndDisplayEmails();
        });
        
        // Load more emails
        if (this.domRefs.loadMoreBtn) {
            this.domRefs.loadMoreBtn.addEventListener('click', async () => {
                await this.emailController.loadMoreEmails();
            });
        }

        // Modal
        this.domRefs.closeModalBtn.addEventListener('click', () => {
            this.domRefs.emailModal.style.display = 'none';
        });

        this.domRefs.emailModal.addEventListener('click', (e) => {
            if (e.target === this.domRefs.emailModal) {
                this.domRefs.emailModal.style.display = 'none';
            }
        });
        
        // Inbox tab switching
        if (this.domRefs.inboxTabs) {
            this.domRefs.inboxTabs.addEventListener('click', (e) => {
                if (e.target.classList.contains('inboxTab')) {
                    const newInbox = e.target.dataset.inbox;
                    if (newInbox) {
                        this.emailController.switchInbox(newInbox);
                    }
                }
            });
        }
        
        if (this.domRefs.managePromotionsBtn) {
            this.domRefs.managePromotionsBtn.addEventListener('click', () => {
                this.uiController.showUnsubscribeModal();
            });
        }

        if (this.domRefs.openInGmailBtn) {
            this.domRefs.openInGmailBtn.addEventListener('click', () => {
                this.emailController.openSelectedSendersInGmail();
            });
        }
        
        // Unsubscribe modal
        if (this.domRefs.cancelUnsubscribeBtn) {
            this.domRefs.cancelUnsubscribeBtn.addEventListener('click', () => {
                this.domRefs.unsubscribeModal.style.display = 'none';
            });
        }
        
        if (document.getElementById('closeUnsubscribeModalBtn')) {
            document.getElementById('closeUnsubscribeModalBtn').addEventListener('click', () => {
                this.domRefs.unsubscribeModal.style.display = 'none';
            });
        }
        

        if (this.domRefs.confirmUnsubscribeBtn) {
            this.domRefs.confirmUnsubscribeBtn.addEventListener('click', async () => {
                // Check if delete checkbox is checked
                const deleteCheckbox = document.getElementById('deleteEmailsCheckbox');
                const shouldDelete = deleteCheckbox ? deleteCheckbox.checked : false;
                
                await this.emailController.processUnsubscribeAndDelete(shouldDelete);
            });
        }
        
        if (this.domRefs.unsubscribeModal) {
            this.domRefs.unsubscribeModal.addEventListener('click', (e) => {
                if (e.target === this.domRefs.unsubscribeModal) {
                    this.domRefs.unsubscribeModal.style.display = 'none';
                }
            });
        }

        // Pipeline (Sankey) view – Code / Diagram toggle
        if (this.domRefs.sankeyCodeViewBtn) {
            this.domRefs.sankeyCodeViewBtn.addEventListener('click', () => {
                this.uiController.showPipelineCodeView();
            });
        }
        if (this.domRefs.sankeyDiagramViewBtn) {
            this.domRefs.sankeyDiagramViewBtn.addEventListener('click', () => {
                this.uiController.showPipelineDiagramView();
            });
        }
        if (this.domRefs.sankeyCopyBtn) {
            this.domRefs.sankeyCopyBtn.addEventListener('click', async () => {
                const text = this.domRefs.sankeyTextarea?.value || '';
                try {
                    await navigator.clipboard.writeText(text);
                    this.uiController.showSuccess('Copied to clipboard');
                    setTimeout(() => this.uiController.hideSuccess(), 2000);
                } catch (err) {
                    this.uiController.showError('Failed to copy');
                }
            });
        }
        if (this.domRefs.sankeyExportBtn) {
            this.domRefs.sankeyExportBtn.addEventListener('click', () => {
                const text = this.domRefs.sankeyTextarea?.value || '';
                const blob = new Blob([text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'job-pipeline-sankey.txt';
                a.click();
                URL.revokeObjectURL(url);
                this.uiController.showSuccess('Exported as job-pipeline-sankey.txt');
                setTimeout(() => this.uiController.hideSuccess(), 2000);
            });
        }
        if (this.domRefs.sankeyRefreshBtn) {
            this.domRefs.sankeyRefreshBtn.addEventListener('click', () => {
                this.emailController.refreshPipelineView();
            });
        }
    }
}

