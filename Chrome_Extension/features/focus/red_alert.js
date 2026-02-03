chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'DISTRACTION_VISUAL') {
        let overlay = document.getElementById('focus-nuclear-overlay');
        
        if (msg.active) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'focus-nuclear-overlay';
                Object.assign(overlay.style, {
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    backgroundColor: 'rgba(239, 68, 68, 0.4)', // Red tint
                    backdropFilter: 'blur(12px)', // Blurs the entire background website
                    zIndex: 2147483647,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    pointerEvents: 'all', // Blocks interaction with the site
                    transition: 'opacity 0.5s ease'
                });

                overlay.innerHTML = `
                    <div style="text-align:center; color:white; font-family:sans-serif;">
                        <div style="font-size: 80px; margin-bottom: 20px;">⚠️</div>
                        <h1 style="font-size: 40px; font-weight: 900; margin: 0;">EYES ON TASK</h1>
                        <p style="font-size: 18px; opacity: 0.8;">The session is paused until you return.</p>
                    </div>
                `;
                document.body.appendChild(overlay);
            }
        } else if (overlay) {
            overlay.remove();
        }
    }
});