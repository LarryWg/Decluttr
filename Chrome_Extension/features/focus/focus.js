/**
 * focus.js
 * Real-time eye tracking with instant color feedback.
 */
import { initTheme } from '../../utils/theme.js';
initTheme();

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// --- Element References ---
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('overlay');
const backBtn = document.getElementById("backBtn");
const toggleCamBtn = document.getElementById('toggleCamBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const videoPlaceholder = document.getElementById('videoPlaceholder');

// --- Global Variables ---
let faceLandmarker;        
let lastVideoTime = -1;    
let lookAwayStartTime = null; 
let cameraStarted = false;
const LOOK_AWAY_THRESHOLD = 2000; // 2 seconds

function setStatus(state) {
    if (!statusDot || !statusText) return;
    statusDot.className = 'status-dot status-' + state;
    statusText.textContent = state === 'focused' ? 'Focused' : state === 'distracted' ? 'Look at screen!' : state === 'tracking' ? 'Watching' : 'Ready';
}

// Tell background to free camera for Focus UI (close offscreen)
chrome.runtime.sendMessage({ type: 'FOCUS_UI_OPEN' });

// --- Event Listeners ---
backBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: 'FOCUS_UI_CLOSED' });
    window.location.href = "../../popup/App.html";
});

window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ type: 'FOCUS_UI_CLOSED' });
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATS_UPDATE') {
        const focusEl = document.getElementById('focusTime');
        const distractEl = document.getElementById('distractTime');
        
        if (focusEl) focusEl.textContent = formatTime(message.stats.focusedSeconds);
        if (distractEl) distractEl.textContent = formatTime(message.stats.distractedSeconds);
    }
});

toggleCamBtn.addEventListener('click', async () => {
    if (video.classList.contains('video-hidden')) {
        video.classList.remove('video-hidden');
        video.classList.add('video-visible');
        if (videoPlaceholder) videoPlaceholder.classList.add('hidden');
        toggleCamBtn.querySelector('.btn-label').textContent = 'Hide Camera';
        toggleCamBtn.querySelector('.btn-icon').textContent = '■';
        toggleCamBtn.classList.add('active');
        if (!cameraStarted) {
            toggleCamBtn.disabled = true;
            toggleCamBtn.querySelector('.btn-label').textContent = 'Starting...';
            await startCamera();
            cameraStarted = true;
            toggleCamBtn.querySelector('.btn-label').textContent = 'Hide Camera';
            toggleCamBtn.disabled = false;
            setStatus('tracking');
        }
    } else {
        video.classList.remove('video-visible');
        video.classList.add('video-hidden');
        if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
        toggleCamBtn.querySelector('.btn-label').textContent = 'Show Camera';
        toggleCamBtn.querySelector('.btn-icon').textContent = '▶';
        toggleCamBtn.classList.remove('active');
        setStatus('ready');
    }
});

// --- MediaPipe Initialization ---
async function initMediaPipe() {
    try {
        if (!window.FilesetResolver || !window.FaceLandmarker) {
            setTimeout(initMediaPipe, 100);
            return;
        }

        const vision = await window.FilesetResolver.forVisionTasks("lib");

        faceLandmarker = await window.FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "lib/face_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO"
        });

        console.log("Eye Tracking Initialized");
        // Camera starts when user clicks "Show Camera" so video has proper dimensions
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

/**
 * Checks focus and updates timers.
 * LookAwayStartTime is nullified immediately upon looking back.
 */
function checkFocus(landmarks) {
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];

    // Horizontal Tracking
    const midPointX = (leftEye.x + rightEye.x) / 2;
    const horizontalDiff = Math.abs(nose.x - midPointX);

    // Vertical Tracking
    const midPointY = (leftEye.y + rightEye.y) / 2;
    const verticalDiff = nose.y - midPointY;

    // Thresholds
    const isLookingSide = horizontalDiff > 0.035;
    const isLookingUp = verticalDiff < 0.01; 
    const isLookingDown = verticalDiff > 0.14;

    const isLookingAway = isLookingSide || isLookingUp || isLookingDown;

    if (isLookingAway) {
        if (!lookAwayStartTime) lookAwayStartTime = Date.now();
        
        if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
            document.body.classList.add('alert-active');
            setStatus('distracted');
            chrome.runtime.sendMessage({type: 'ALARM_STATE', active: true});
        } else {
            setStatus('tracking'); // Looking away but under threshold
        }
    } else {
        lookAwayStartTime = null;
        document.body.classList.remove('alert-active');
        setStatus('focused');
        chrome.runtime.sendMessage({type: 'ALARM_STATE', active: false});
    }
}

/**
 * Renders detection results.
 * Dots turn red as long as lookAwayStartTime is active.
 */
function drawResults(result) {
    const ctx = canvas.getContext("2d");
    
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
        const landmarks = result.faceLandmarks[0];
        checkFocus(landmarks);
        //Drawing the dots on the eyes:
        
        const eyeIndices = [468, 473];
        
        // Instant color swap based on the timer status
        ctx.fillStyle = lookAwayStartTime ? "red" : "#00ff2a";
        
        eyeIndices.forEach(index => {
            const point = landmarks[index];
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
        
    }
    
}

async function renderLoop() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        if (faceLandmarker) {
            const result = faceLandmarker.detectForVideo(video, performance.now());
            drawResults(result);
        }
    }
    requestAnimationFrame(renderLoop);
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play().catch(() => {});
            renderLoop();
        };
    } catch (err) {
        const msg = err?.name === 'NotAllowedError' ? 'Camera permission denied'
            : err?.name === 'NotFoundError' ? 'No camera found'
            : err?.name === 'NotReadableError' ? 'Camera in use elsewhere'
            : err?.message || String(err);
        console.error("Camera error:", err?.name, msg);
        cameraStarted = false;
        video.classList.add('video-hidden');
        video.classList.remove('video-visible');
        if (videoPlaceholder) videoPlaceholder.classList.remove('hidden');
        if (toggleCamBtn) {
            toggleCamBtn.querySelector('.btn-label').textContent = 'Show Camera';
            toggleCamBtn.querySelector('.btn-icon').textContent = '▶';
            toggleCamBtn.classList.remove('active');
            toggleCamBtn.disabled = false;
        }
        setStatus('ready');
    }
}

initMediaPipe();