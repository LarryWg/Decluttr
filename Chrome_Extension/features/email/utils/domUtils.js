/**
 * DOM utility functions and references
 */

/**
 * DOM References class - holds all DOM element references
 */
export class DOMReferences {
    constructor() {
        this.backBtn = document.getElementById('backBtn');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsPanel = document.getElementById('settingsPanel');
        this.backendUrlInput = document.getElementById('backendUrlInput');
        this.saveBackendUrlBtn = document.getElementById('saveBackendUrlBtn');
        this.redirectUriDisplay = document.getElementById('redirectUriDisplay');
        this.copyRedirectUriBtn = document.getElementById('copyRedirectUriBtn');
        this.logoutBtn = document.getElementById('logoutBtn');
        this.authSection = document.getElementById('authSection');
        this.connectGmailBtn = document.getElementById('connectGmailBtn');
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.errorMessage = document.getElementById('errorMessage');
        this.successMessage = document.getElementById('successMessage');
        this.emailListSection = document.getElementById('emailListSection');
        this.emailList = document.getElementById('emailList');
        this.accountEmailSpan = document.getElementById('accountEmail');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.emptyState = document.getElementById('emptyState');
        this.emailModal = document.getElementById('emailModal');
        this.closeModalBtn = document.getElementById('closeModalBtn');
        this.modalSubject = document.getElementById('modalSubject');
        this.modalSender = document.getElementById('modalSender');
        this.modalDate = document.getElementById('modalDate');
        this.modalBodyContent = document.getElementById('modalBodyContent');
        this.modalAiResults = document.getElementById('modalAiResults');
        this.inboxTabs = document.getElementById('inboxTabs');
        this.loadMoreBtn = document.getElementById('loadMoreBtn');
        this.managePromotionsBtn = document.getElementById('managePromotionsBtn');
        this.unsubscribeModal = document.getElementById('unsubscribeModal');
        this.senderList = document.getElementById('senderList');
        this.cancelUnsubscribeBtn = document.getElementById('cancelUnsubscribeBtn');
        this.confirmUnsubscribeBtn = document.getElementById('confirmUnsubscribeBtn');
        this.openInGmailBtn = document.getElementById('openInGmailBtn');
    }
}

