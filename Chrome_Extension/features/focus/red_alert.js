chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'DISTRACTION_VISUAL') {
        let alertBox = document.getElementById('focus-red-alert');
        
        if (message.active) {
            if (!alertBox) {
                alertBox = document.createElement('div');
                alertBox.id = 'focus-red-alert';
                Object.assign(alertBox.style, {
                    position: 'fixed', top: '0', left: '0',
                    width: '100vw', height: '100vh',
                    border: '20px solid #ef4444',
                    boxSizing: 'border-box', pointerEvents: 'none',
                    zIndex: '2147483647', animation: 'focus-pulse 2s infinite'
                });
                const style = document.createElement('style');
                style.innerHTML = `@keyframes focus-pulse { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }`;
                document.head.appendChild(style);
                document.body.appendChild(alertBox);
            }
        } else if (alertBox) {
            alertBox.remove();
        }
    }
});