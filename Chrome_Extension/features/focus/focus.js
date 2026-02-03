/**
 * focus.js
 * UI and local eye-tracking logic.
 */

chrome.runtime.connect({ name: "popup" });

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
const sessionInBackgroundBar = document.getElementById('sessionInBackgroundBar');
const resumeCamBtn = document.getElementById('resumeCamBtn');
const endSessionBtn = document.getElementById('endSessionBtn');

// --- Global State ---
let faceLandmarker;        
let lastVideoTime = -1;    
let lookAwayStartTime = null; 
let cameraStarted = false;
let lastAlarmActive = null; // only send ALARM_STATE when this changes
const LOOK_AWAY_THRESHOLD = 2000; 

function setStatus(state) {
    if (!statusDot || !statusText) return;
    const container = document.querySelector('.focus-container');
    
    statusDot.className = 'status-dot status-' + state.toLowerCase();
    statusText.textContent = state === 'focused' ? 'In focus' : 
                             state === 'distracted' ? 'Back to work!' : 
                             state === 'Ready' ? 'Ready' : 'Tracking';
                             
    // Add or remove the red square alert defined in your CSS
    if (state === 'distracted') {
        container.classList.add('alert-active');
    } else {
        container.classList.remove('alert-active');
    }

    const active = (state === 'distracted');
    if (lastAlarmActive !== active) {
        lastAlarmActive = active;
        chrome.runtime.sendMessage({ type: 'ALARM_STATE', active });
    }
}

// Update UI from Background Ticks
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATS_UPDATE' && message.stats) {
        if (focusEl) focusEl.textContent = formatTime(message.stats.focusedSeconds);
        if (distractEl) distractEl.textContent = formatTime(message.stats.distractedSeconds);
    }
});

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'UI_UPDATE_STATE') {
        const container = document.querySelector('.focus-container');
        if (message.active) {
            if (container) container.style.boxShadow = "inset 0 0 0 12px #e74c3c";
            if (statusText) statusText.textContent = "Back to work!";
        } else {
            if (container) container.style.boxShadow = "none";
        }
    }
});

// Navigation
if (backBtn) backBtn.onclick = () => window.location.href = "../../popup/App.html";

// Reset Stats
if (resetBtn) {
    resetBtn.onclick = () => chrome.runtime.sendMessage({ type: 'RESET_STATS' });
}

// --- Resume camera (shared: used on load when session active, and by Resume button) ---
async function resumeCameraInPopup() {
    await chrome.runtime.sendMessage({ type: 'FOCUS_UI_OPEN' });
    video.classList.replace('video-hidden', 'video-visible');
    videoPlaceholder.classList.add('hidden');
    toggleCamBtn.querySelector('.btn-label').textContent = 'End Pomodoro';
    toggleCamBtn.classList.add('active');
    if (!cameraStarted) {
        cameraStarted = true;
        const ok = await startCamera();
        if (!ok) {
            if (sessionInBackgroundBar) sessionInBackgroundBar.classList.remove('hidden');
            return;
        }
    }
    chrome.runtime.sendMessage({ type: 'SET_CAMERA_STATE', active: true });
    if (sessionInBackgroundBar) sessionInBackgroundBar.classList.add('hidden');
}

// --- Session sync on load: if session is still active, keep camera visible (auto-resume) ---
async function syncSessionStateOnLoad() {
    try {
        const { active: sessionActive } = await chrome.runtime.sendMessage({ type: 'GET_CAMERA_STATE' }) || {};
        if (!sessionActive || cameraStarted) return;
        // Session was running in background; restore camera in extension so it stays visible until user hits Stop
        await resumeCameraInPopup();
    } catch (e) {
        console.warn('Could not get camera state:', e);
    }
}
syncSessionStateOnLoad();

// --- Resume camera (from session-in-background bar, if we showed it after a failed auto-resume) ---
if (resumeCamBtn) {
    resumeCamBtn.addEventListener('click', () => resumeCameraInPopup());
}

// --- End session (from session-in-background bar, no camera needed) ---
if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SET_CAMERA_STATE', active: false });
        if (sessionInBackgroundBar) sessionInBackgroundBar.classList.add('hidden');
        if (toggleCamBtn) {
            toggleCamBtn.querySelector('.btn-label').textContent = 'Start Pomodoro';
            toggleCamBtn.classList.remove('active');
        }
        setStatus('Ready');
    });
}

// --- Camera Toggle ---
toggleCamBtn.addEventListener('click', async () => {
    const isCurrentlyHidden = video.classList.contains('video-hidden');
    
    if (isCurrentlyHidden) {
        // 1. Tell background to stop background tracking so popup can take the camera
        await chrome.runtime.sendMessage({ type: 'FOCUS_UI_OPEN' });
        
        video.classList.replace('video-hidden', 'video-visible');
        videoPlaceholder.classList.add('hidden');
        toggleCamBtn.querySelector('.btn-label').textContent = 'End Pomodoro';
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
        toggleCamBtn.querySelector('.btn-label').textContent = 'Start Pomodoro';
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
        return true;
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
            toggleCamBtn.querySelector('.btn-label').textContent = 'Start Pomodoro';
            toggleCamBtn.querySelector('.btn-icon').textContent = '▶';
            toggleCamBtn.classList.remove('active');
            toggleCamBtn.disabled = false;
        }
        setStatus('Ready');
        return false;
    }
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    cameraStarted = false;
    lastAlarmActive = null;
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
    const isLookingDown = verticalDiff > 0.10;

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
        // Camera starts when user clicks "Start Pomodoro" so video has proper dimensions
    } catch (err) {
        console.error("Initialization error:", err);
    }
}
initMediaPipe();