/**
 * focus.js
 * Real-time eye tracking with instant color feedback.
 */

// --- Element References ---
const video = document.getElementById('camera-feed');

// --- Global Variables ---
let faceLandmarker;        
let lastVideoTime = -1;    
let lookAwayStartTime = null; 
const LOOK_AWAY_THRESHOLD = 2000; // 2 seconds

function setStatus(state) {
    const isDistracted = (state === 'distracted');
    chrome.runtime.sendMessage({ type: 'ALARM_STATE', active: isDistracted });
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

    // Adjusted thresholds based on your focus.js settings
    const isLookingSide = horizontalDiff > 0.035;
    const isLookingUp = verticalDiff < 0.01; 
    const isLookingDown = verticalDiff > 0.10; // Increased sensitivity

    const isLookingAway = isLookingSide || isLookingUp || isLookingDown;

    if (isLookingAway) {
        if (!lookAwayStartTime) lookAwayStartTime = Date.now();
        if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
            setStatus('distracted');
        }
    } else {
        lookAwayStartTime = null;
        setStatus('focused');
    }
}

async function renderLoop() {
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        if (faceLandmarker) {
            const result = faceLandmarker.detectForVideo(video, performance.now());
            if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                console.log(`[${new Date().toLocaleTimeString()}] AI Status: Face Detected`);
                checkFocus(result.faceLandmarks[0]);
            } else {
                console.warn(`[${new Date().toLocaleTimeString()}] AI Status: No Face Seen`);
                // If no face detected, treat as looking away
                if (!lookAwayStartTime) lookAwayStartTime = Date.now();
                if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
                    setStatus('distracted');
                }
            }
        }
    }
    requestAnimationFrame(renderLoop);
}

async function init() {
    try {
        const vision = await window.FilesetResolver.forVisionTasks("lib");
        faceLandmarker = await window.FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "lib/face_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO"
        });

        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            renderLoop();
        };
    } catch (err) {
        console.error("Background camera failed:", err);
    }
}

init();