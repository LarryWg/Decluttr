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
                boxSizing: 'border-box'
            });

            overlay.innerHTML = `
                <div style="text-align:center; color:#fff; font-family:system-ui,-apple-system,sans-serif; text-shadow:0 1px 2px rgba(0,0,0,0.8);">
                    <div style="font-size: 80px; margin-bottom: 20px; line-height: 1;">⚠️</div>
                    <h1 style="font-size: 40px; font-weight: 900; margin: 0 0 8px 0;">FOCUS</h1>
                    <p style="font-size: 18px; opacity: 0.9; margin: 0;">The session is paused until you return.</p>
                </div>
            `;

            const root = document.documentElement || document.body;
            if (root) root.appendChild(overlay);
        }
    } else if (overlay) {
        overlay.remove();
    }
});