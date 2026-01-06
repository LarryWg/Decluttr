//Element References
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('overlay');
const backBtn = document.getElementById("backBtn");

let faceDetector;
let lastVideoTime = -1;

//back button
backBtn.addEventListener("click", () => {
    window.location.href = "../../popup/App.html";
});

//MediaPipe Face Detector
async function initMediaPipe() {
    try {
        // Wait for bridge.js to finish
        if (!window.FilesetResolver || !window.FaceDetector) {
            setTimeout(initMediaPipe, 100);
            return;
        }

        // Initialize from the local lib folder
        const vision = await window.FilesetResolver.forVisionTasks("lib");

        faceDetector = await window.FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "lib/face_detector.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO"
        });

        console.log("AI Detector Ready!");
        renderLoop();
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

//Real-time Detection Loop
async function renderLoop() {
    // Only run detection if the video frame has updated
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        
        // Perform detection on the current video frame
        const result = faceDetector.detectForVideo(video, performance.now());
        drawResults(result.detections);
    }
    
    // Request the next animation frame for smooth tracking
    requestAnimationFrame(renderLoop);
}

//Draw square around face
function drawResults(detections) {
    const ctx = canvas.getContext("2d");

    // 1. Force the canvas drawing resolution to match the VISUAL size of the video
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
        const { originX, originY, width, height } = detection.boundingBox;

        // 2. Calculate the ratio between the REAL video size and the DISPLAYED size
        const scaleX = video.clientWidth / video.videoWidth;
        const scaleY = video.clientHeight / video.videoHeight;

        //to fix the box being slightly too low
        const verticalOffset = height * 0.4;

        ctx.strokeStyle = "#FF0000";
        ctx.lineWidth = 3;

        // 3. Draw the box by multiplying coordinates by the scale
        ctx.strokeRect(
            originX * scaleX,
            (originY - verticalOffset) * scaleY,
            width * scaleX,
            height * scaleY
        );
    });
}

// 5. Start Camera and Kickoff AI
async function startCamera() {
    const constraints = { video: true, audio: false };
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        
        // Wait for video metadata to be loaded so dimensions are available
        video.onloadedmetadata = () => {
            initMediaPipe();
        };
    } catch (err) {
        console.error(`Error accessing camera: ${err.name}`, err);
    }
}

startCamera();