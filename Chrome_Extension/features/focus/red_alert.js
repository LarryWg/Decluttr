// Distraction overlay: visual only (no sound). Do not add Audio/AudioContext here.
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type !== 'DISTRACTION_VISUAL') return;

    let overlay = document.getElementById('focus-nuclear-overlay');

    if (msg.active) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'focus-nuclear-overlay';
            // Use position fixed + inset so it always covers viewport; attach to documentElement for Mac/sites with odd body
            Object.assign(overlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                right: '0',
                bottom: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(30, 30, 30, 0.85)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                zIndex: '2147483647',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'all',
                margin: '0',
                padding: '0',
                border: 'none',
                boxSizing: 'border-box',
                animation: 'focus-overlay-in 0.35s ease-out forwards'
            });

            overlay.innerHTML = `
                <style>
                    @keyframes focus-overlay-in {
                        0% { opacity: 0; }
                        100% { opacity: 1; }
                    }
                    @keyframes focus-content-pop {
                        0% { opacity: 0; transform: scale(0.85); }
                        60% { transform: scale(1.04); }
                        100% { opacity: 1; transform: scale(1); }
                    }
                    @keyframes focus-heading-pulse {
                        0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(231,76,60,0.6)); }
                        50% { transform: scale(1.02); filter: drop-shadow(0 0 20px rgba(231,76,60,0.9)); }
                    }
                    @keyframes focus-screen-shake {
                        0%, 100% { transform: translate(0, 0); }
                        10% { transform: translate(-8px, -4px); }
                        20% { transform: translate(6px, 4px); }
                        30% { transform: translate(-6px, 6px); }
                        40% { transform: translate(8px, -4px); }
                        50% { transform: translate(-4px, -6px); }
                        60% { transform: translate(6px, 4px); }
                        70% { transform: translate(-6px, 4px); }
                        80% { transform: translate(4px, -6px); }
                        90% { transform: translate(-4px, 6px); }
                    }
                </style>
                <div class="focus-alert-content" style="text-align:center; color:#fff; font-family:system-ui,-apple-system,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,0.8); animation: focus-content-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;">
                    <h1 class="focus-alert-heading" style="font-size: 40px; font-weight: 900; margin: 0 0 8px 0; color:#e74c3c; animation: focus-heading-pulse 2s ease-in-out infinite 0.5s;">FOCUS ON YOUR WORK</h1>
                    <p style="font-size: 18px; opacity: 0.9; margin: 0;">Focus mode is paused until you return.</p>
                </div>
            `;

            const root = document.documentElement || document.body;
            if (root) root.appendChild(overlay);

            // After fade-in, run continuous screen shake until user is focused again (overlay removed)
            overlay.addEventListener('animationend', () => {
                overlay.style.animation = 'focus-screen-shake 0.5s ease-in-out infinite';
            }, { once: true });
        }
    } else if (overlay) {
        overlay.remove();
    }
});