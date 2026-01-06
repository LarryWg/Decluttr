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
        // Check if the bridge has finished its job
        if (!window.FilesetResolver || !window.FaceDetector) {
            console.log("Waiting for bridge...");
            setTimeout(initMediaPipe, 100); 
            return;
        }

        const vision = await window.FilesetResolver.forVisionTasks("lib");

        faceDetector = await window.FaceDetector.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "lib/face_detector.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO"
        });

        console.log("MediaPipe Face Detector Initialized");
        renderLoop();
    } catch (err) {
        console.error("Failed to initialize MediaPipe:", err);
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

// 4. Draw Bounding Box on Canvas
function drawResults(detections) {
    const ctx = canvas.getContext("2d");
    
    // Synchronize canvas size with displayed video size
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
        const { originX, originY, width, height } = detection.boundingBox;
        
        // Scale normalized AI coordinates to match current display dimensions
        const scaleX = video.clientWidth / video.videoWidth;
        const scaleY = video.clientHeight / video.videoHeight;

        // Draw the red bounding box
        ctx.strokeStyle = "#FF0000"; 
        ctx.lineWidth = 3;
        ctx.strokeRect(
            originX * scaleX, 
            originY * scaleY, 
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