/**
 * focus.js
 * UI and local eye-tracking logic.
 */
import { initTheme } from '../../utils/theme.js';
initTheme();

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// --- Elements ---
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('overlay');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const focusEl = document.getElementById('focusTime');
const distractEl = document.getElementById('distractTime');
const resetBtn = document.getElementById('resetStatsBtn');
const backBtn = document.getElementById("backBtn");

// --- Global State ---
let faceLandmarker;        
let lastVideoTime = -1;    
let lookAwayStartTime = null; 
let cameraStarted = false;
const LOOK_AWAY_THRESHOLD = 2000; 

function setStatus(state) {
    if (!statusDot || !statusText) return;
    statusDot.className = 'status-dot status-' + state;
    statusText.textContent = state === 'focused' ? 'Focused' : 
                             state === 'distracted' ? 'Look at screen!' : 'Tracking';
                             
    // Tell background which timer bucket to increment
    chrome.runtime.sendMessage({ type: 'ALARM_STATE', active: (state === 'distracted') });
}

// Update UI from Background Ticks
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATS_UPDATE' && message.stats) {
        if (focusEl) focusEl.textContent = formatTime(message.stats.focusedSeconds);
        if (distractEl) distractEl.textContent = formatTime(message.stats.distractedSeconds);
    }
});

// Navigation
if (backBtn) backBtn.onclick = () => window.location.href = "../../popup/App.html";

// Reset Stats
if (resetBtn) {
    resetBtn.onclick = () => chrome.runtime.sendMessage({ type: 'RESET_STATS' });
}

// --- Camera Toggle ---
toggleCamBtn.addEventListener('click', async () => {
    const isCurrentlyHidden = video.classList.contains('video-hidden');
    
    if (isCurrentlyHidden) {
        // 1. Tell background to stop background tracking so popup can take the camera
        await chrome.runtime.sendMessage({ type: 'FOCUS_UI_OPEN' });
        
        video.classList.replace('video-hidden', 'video-visible');
        videoPlaceholder.classList.add('hidden');
        toggleCamBtn.querySelector('.btn-label').textContent = 'Hide Camera';
        toggleCamBtn.classList.add('active');

        if (!cameraStarted) {
            cameraStarted = true;
            await startCamera();
        }
        // Signal background that counting is allowed
        chrome.runtime.sendMessage({ type: 'SET_CAMERA_STATE', active: true });
    } else {
        video.classList.replace('video-visible', 'video-hidden');
        videoPlaceholder.classList.remove('hidden');
        toggleCamBtn.querySelector('.btn-label').textContent = 'Show Camera';
        toggleCamBtn.classList.remove('active');
        
        chrome.runtime.sendMessage({ type: 'SET_CAMERA_STATE', active: false });
        stopCamera();
        setStatus('Ready');
    }
});

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            renderLoop();
        };
        setStatus('focused');
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
        setStatus('Ready');
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    cameraStarted = false;
}

async function renderLoop() {
    if (!cameraStarted) return; 
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        if (faceLandmarker) {
            const result = faceLandmarker.detectForVideo(video, performance.now());
            if (result.faceLandmarks && result.faceLandmarks.length > 0) {

                checkFocus(result.faceLandmarks[0]); 
                
            }
        }
    }
    requestAnimationFrame(renderLoop);
}

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
    const isLookingDown = verticalDiff > 0.12;

    const isLookingAway = isLookingSide || isLookingUp || isLookingDown;

    if (isLookingAway) {
        if (!lookAwayStartTime) lookAwayStartTime = Date.now();
        
        if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
            setStatus('distracted');
        } else {
            setStatus('tracking'); // Looking away but under threshold
        }
    } else {
        lookAwayStartTime = null;
        setStatus('focused');
    }
}

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
initMediaPipe();