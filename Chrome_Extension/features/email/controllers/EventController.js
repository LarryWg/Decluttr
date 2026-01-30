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

        this.domRefs.logoutBtn.addEventListener('click', async () => {
            await this.emailController.handleLogout();
        });

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
    }
}

