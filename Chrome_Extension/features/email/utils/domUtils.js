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
        this.settingsCloseBtn = document.getElementById('settingsCloseBtn');
        this.themeSelect = document.getElementById('themeSelect');
        this.autoCategorizeCheckbox = document.getElementById('autoCategorizeCheckbox');
        this.developerOptionsToggle = document.getElementById('developerOptionsToggle');
        this.developerOptionsContent = document.getElementById('developerOptionsContent');
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
        this.sankeySection = document.getElementById('sankeySection');
        this.sankeyCodeViewBtn = document.getElementById('sankeyCodeViewBtn');
        this.sankeyDiagramViewBtn = document.getElementById('sankeyDiagramViewBtn');
        this.sankeyCodeView = document.getElementById('sankeyCodeView');
        this.sankeyDiagramContainer = document.getElementById('sankeyDiagramContainer');
        this.sankeyTextarea = document.getElementById('sankeyTextarea');
        this.sankeyCopyBtn = document.getElementById('sankeyCopyBtn');
        this.sankeyOpenBtn = document.getElementById('sankeyOpenBtn');
        this.sankeyExportBtn = document.getElementById('sankeyExportBtn');
        this.sankeyRefreshBtn = document.getElementById('sankeyRefreshBtn');
        this.customLabelsList = document.getElementById('customLabelsList');
        this.customLabelNameInput = document.getElementById('customLabelNameInput');
        this.customLabelDescriptionInput = document.getElementById('customLabelDescriptionInput');
        this.addCustomLabelBtn = document.getElementById('addCustomLabelBtn');
        this.applyCustomLabelsBtn = document.getElementById('applyCustomLabelsBtn');
        this.addCustomLabelTabBtn = document.getElementById('addCustomLabelTabBtn');
        this.addCustomLabelModal = document.getElementById('addCustomLabelModal');
        this.closeAddCustomLabelModalBtn = document.getElementById('closeAddCustomLabelModalBtn');
        this.addCustomLabelModalName = document.getElementById('addCustomLabelModalName');
        this.addCustomLabelModalDescription = document.getElementById('addCustomLabelModalDescription');
        this.cancelAddCustomLabelModalBtn = document.getElementById('cancelAddCustomLabelModalBtn');
        this.confirmAddCustomLabelModalBtn = document.getElementById('confirmAddCustomLabelModalBtn');
        // Categorization Progress
        this.categorizationProgress = document.getElementById('categorizationProgress');
        this.categorizationProgressCount = document.getElementById('categorizationProgressCount');
        this.categorizationProgressFill = document.getElementById('categorizationProgressFill');
        // Stats Dashboard
        this.statsDashboard = document.getElementById('statsDashboard');
        this.statTotalEmails = document.getElementById('statTotalEmails');
        this.statJobApps = document.getElementById('statJobApps');
        this.statJobMiniChart = document.getElementById('statJobMiniChart');
        this.statResponseRate = document.getElementById('statResponseRate');
    }
}

