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
let faceNotFoundCount = 0;
let lastLoopTime = 0;

function setStatus(state) {
    const isDistracted = (state === 'distracted');
    if (isDistracted) {
        console.log(`%c[${new Date().toLocaleTimeString()}] DISTRACTION DETECTED: User has looked away.`, "color: #ef4444; font-weight: bold;");
    } else if (state === 'focused') {
        console.log(`%c[${new Date().toLocaleTimeString()}] FOCUS REGAINED: User is looking at screen.`, "color: #22c55e;");
    }
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

function renderLoop() {
    // Ensure landmarker is ready and video has data
    if (faceLandmarker && video.readyState >= 2) {
        try {
            // Using performance.now() forces MediaPipe to treat this as a fresh frame
            const results = faceLandmarker.detectForVideo(video, performance.now());

            if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                faceNotFoundCount = 0;
                checkFocus(results.faceLandmarks[0]); 
                // Heartbeat log every ~5 seconds
                if (Math.random() > 0.99) console.log("AI Status: Tracking Face...");
            } else {
                faceNotFoundCount++;
                if (faceNotFoundCount % 50 === 0) console.warn("AI Status: No face in frame");

                if (faceNotFoundCount > 20) { // Faster trigger for "lost" face
                    if (!lookAwayStartTime) lookAwayStartTime = Date.now();
                    if (Date.now() - lookAwayStartTime > LOOK_AWAY_THRESHOLD) {
                        setStatus('distracted');
                    }
                }
            }
        } catch (err) {
            console.error("AI Processing Error:", err);
        }
    }
    requestAnimationFrame(renderLoop);
}

async function init() {
    const vision = await window.FilesetResolver.forVisionTasks("lib");
    faceLandmarker = await window.FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "lib/face_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO"
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        video.play().then(() => {
            console.log("Stream playing at 640x480 - Starting Loop");
            // Use setInterval (33ms = ~30fps) to prevent background throttling
            setInterval(renderLoop, 33);
        });
    };
}
init();