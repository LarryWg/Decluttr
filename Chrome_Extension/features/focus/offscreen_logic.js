/**
 * focus.js
 * Real-time eye tracking with instant color feedback.
 */

// --- Element References ---
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('overlay');
const backBtn = document.getElementById("backBtn");
const toggleCamBtn = document.getElementById('toggleCamBtn');

// --- Global Variables ---
let faceLandmarker;        
let lastVideoTime = -1;    
let lookAwayStartTime = null; 
const LOOK_AWAY_THRESHOLD = 2000; // 2 seconds

// --- Event Listeners (only in popup UI - backBtn/toggleCamBtn don't exist in offscreen) ---
if (backBtn) {
    backBtn.addEventListener("click", () => {
        window.location.href = "../../popup/App.html";
    });
}
if (toggleCamBtn) {
    toggleCamBtn.addEventListener('click', () => {
        if (video.classList.contains('video-hidden')) {
            video.classList.remove('video-hidden');
            video.classList.add('video-visible');
            toggleCamBtn.textContent = 'Hide Camera';
            toggleCamBtn.classList.add('active-btn');
        } else {
            video.classList.remove('video-visible');
            video.classList.add('video-hidden');
            toggleCamBtn.textContent = 'Show Camera';
            toggleCamBtn.classList.remove('active-btn');
        }
    });
}

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
        startCamera();
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

    const midPointX = (leftEye.x + rightEye.x) / 2;
    const horizontalDiff = Math.abs(nose.x - midPointX);
    const midPointY = (leftEye.y + rightEye.y) / 2;
    const verticalDiff = nose.y - midPointY;

    const isLookingAway = horizontalDiff > 0.035 || verticalDiff < 0.01 || verticalDiff > 0.14;

    if (isLookingAway) {
        if (!lookAwayStartTime) lookAwayStartTime = Date.now();
        if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
            // Signal background.js to pulse the active tab
            chrome.runtime.sendMessage({type: 'ALARM_STATE', active: true});
        }
    } else {
        lookAwayStartTime = null;
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
        /*
        const eyeIndices = [468, 473];
        
        // Instant color swap based on the timer status
        ctx.fillStyle = lookAwayStartTime ? "red" : "#00ff2a";
        
        eyeIndices.forEach(index => {
            const point = landmarks[index];
            ctx.beginPath();
            ctx.arc(point.x * canvas.width, point.y * canvas.height, 4, 0, 2 * Math.PI);
            ctx.fill();
        });
        */
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
            renderLoop();
        };
    } catch (err) {
        console.error("Camera error:", err);
    }
}

(async () => {
    await initMediaPipe();
    await startCamera();
    console.log("Background tracking initiated.");
})();