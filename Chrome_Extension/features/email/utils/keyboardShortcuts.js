/**
 * Keyboard Shortcuts Handler
 * Provides keyboard navigation and shortcuts for the email assistant
 */

/**
 * Initialize keyboard shortcuts
 * @param {Object} callbacks - Callback functions for shortcuts
 * @param {Function} callbacks.onRefresh - Callback for refresh (r)
 * @param {Function} callbacks.onViewDetails - Callback to view current email (Enter)
 * @param {Function} callbacks.onNextEmail - Callback to select next email (j / Down)
 * @param {Function} callbacks.onPrevEmail - Callback to select previous email (k / Up)
 * @param {Function} callbacks.onEscape - Callback for escape (close modals)
 */
export function initKeyboardShortcuts(callbacks) {
    let selectedIndex = -1;
    
    document.addEventListener('keydown', (e) => {
        // Don't handle shortcuts if user is typing in an input/textarea
        const target = e.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            // Allow Escape to close modals even in inputs
            if (e.key === 'Escape' && callbacks.onEscape) {
                callbacks.onEscape();
            }
            return;
        }

        // Check if any modal is open
        const modalOpen = document.querySelector('.emailModal[style*="display: flex"], .unsubscribeModal[style*="display: flex"]');

        switch (e.key.toLowerCase()) {
            case 'r':
                // Refresh
                if (!modalOpen && callbacks.onRefresh) {
                    e.preventDefault();
                    callbacks.onRefresh();
                }
                break;

            case 'j':
            case 'arrowdown':
                // Next email
                if (!modalOpen && callbacks.onNextEmail) {
                    e.preventDefault();
                    selectedIndex = callbacks.onNextEmail(selectedIndex);
                }
                break;

            case 'k':
            case 'arrowup':
                // Previous email
                if (!modalOpen && callbacks.onPrevEmail) {
                    e.preventDefault();
                    selectedIndex = callbacks.onPrevEmail(selectedIndex);
                }
                break;

            case 'enter':
                // View details
                if (!modalOpen && callbacks.onViewDetails) {
                    e.preventDefault();
                    callbacks.onViewDetails(selectedIndex);
                }
                break;

            case 'escape':
                // Close modals
                if (callbacks.onEscape) {
                    callbacks.onEscape();
                }
                break;

            case '1':
                // Switch to Primary
                if (!modalOpen && callbacks.onSwitchTab) {
                    e.preventDefault();
                    callbacks.onSwitchTab('primary');
                }
                break;

            case '2':
                // Switch to Promotions
                if (!modalOpen && callbacks.onSwitchTab) {
                    e.preventDefault();
                    callbacks.onSwitchTab('promotions');
                }
                break;

            case '3':
                // Switch to Job
                if (!modalOpen && callbacks.onSwitchTab) {
                    e.preventDefault();
                    callbacks.onSwitchTab('job');
                }
                break;

            case '4':
                // Switch to Timeline
                if (!modalOpen && callbacks.onSwitchTab) {
                    e.preventDefault();
                    callbacks.onSwitchTab('timeline');
                }
                break;

            case '5':
                // Switch to Pipeline
                if (!modalOpen && callbacks.onSwitchTab) {
                    e.preventDefault();
                    callbacks.onSwitchTab('pipeline');
                }
                break;

            case '?':
                // Show shortcuts help
                if (!modalOpen && callbacks.onShowHelp) {
                    e.preventDefault();
                    callbacks.onShowHelp();
                }
                break;
        }
    });

    return {
        /**
         * Reset selected index
         */
        resetSelection() {
            selectedIndex = -1;
        },
        
        /**
         * Get current selected index
         */
        getSelectedIndex() {
            return selectedIndex;
        },
        
        /**
         * Set selected index
         */
        setSelectedIndex(index) {
            selectedIndex = index;
        }
    };
}

/**
 * Highlight selected email card
 * @param {number} index - Index of email to highlight
 */
export function highlightEmailCard(index) {
    // Remove previous highlights
    document.querySelectorAll('.emailCard.keyboard-selected').forEach(card => {
        card.classList.remove('keyboard-selected');
    });

    // Add highlight to selected card
    const cards = document.querySelectorAll('.emailCard');
    if (index >= 0 && index < cards.length) {
        cards[index].classList.add('keyboard-selected');
        cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    return index;
}
