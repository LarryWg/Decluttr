/**
 * Confetti celebration effect for offers
 * Lightweight canvas-based confetti without external dependencies
 */

let confettiCanvas = null;
let confettiCtx = null;
let confettiAnimationId = null;
let particles = [];

const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 15;
        this.vy = -Math.random() * 15 - 5;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.size = Math.random() * 8 + 4;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = (Math.random() - 0.5) * 15;
        this.gravity = 0.3;
        this.opacity = 1;
        this.shape = Math.random() > 0.5 ? 'rect' : 'circle';
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.rotation += this.rotationSpeed;
        this.vx *= 0.99;
        this.opacity -= 0.008;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, this.opacity);
        ctx.fillStyle = this.color;
        
        if (this.shape === 'rect') {
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size * 0.6);
        } else {
            ctx.beginPath();
            ctx.arc(0, 0, this.size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

function initCanvas() {
    if (confettiCanvas) return;
    
    confettiCanvas = document.createElement('canvas');
    confettiCanvas.id = 'confetti-canvas';
    confettiCanvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    `;
    document.body.appendChild(confettiCanvas);
    confettiCtx = confettiCanvas.getContext('2d');
    
    function resize() {
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
}

function animate() {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    
    particles = particles.filter(p => p.opacity > 0 && p.y < confettiCanvas.height + 50);
    
    for (const particle of particles) {
        particle.update();
        particle.draw(confettiCtx);
    }
    
    if (particles.length > 0) {
        confettiAnimationId = requestAnimationFrame(animate);
    } else {
        // Clean up when done
        cancelAnimationFrame(confettiAnimationId);
        confettiAnimationId = null;
    }
}

/**
 * Trigger confetti celebration!
 * @param {Object} options - Options
 * @param {number} options.particleCount - Number of particles (default: 100)
 * @param {number} options.spread - Spread angle (default: 70)
 * @param {number} options.originX - Origin X (0-1, default: 0.5)
 * @param {number} options.originY - Origin Y (0-1, default: 0.5)
 */
export function fireConfetti(options = {}) {
    const {
        particleCount = 100,
        originX = 0.5,
        originY = 0.5
    } = options;
    
    initCanvas();
    
    const x = confettiCanvas.width * originX;
    const y = confettiCanvas.height * originY;
    
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle(x, y));
    }
    
    if (!confettiAnimationId) {
        animate();
    }
}

/**
 * Fire a celebratory burst from multiple points
 */
export function celebrateOffer() {
    // Fire from center
    fireConfetti({ particleCount: 80, originX: 0.5, originY: 0.4 });
    
    // Fire from sides after a delay
    setTimeout(() => {
        fireConfetti({ particleCount: 40, originX: 0.2, originY: 0.6 });
        fireConfetti({ particleCount: 40, originX: 0.8, originY: 0.6 });
    }, 150);
    
    // Another burst
    setTimeout(() => {
        fireConfetti({ particleCount: 60, originX: 0.5, originY: 0.3 });
    }, 300);
}
