import { FaceLandmarker, FilesetResolver } from "./lib/vision_bundle.js";

// 1. Manually attach MediaPipe classes to window for focus.js access
window.FaceLandmarker = FaceLandmarker;
window.FilesetResolver = FilesetResolver;

// 2. Ensure Canvas matches Video dimensions immediately
const canvas = document.getElementById('overlay');
const video = document.getElementById('camera-feed');

function syncDimensions() {
    if (canvas && video && video.videoWidth > 0) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
    }
}

// Sync whenever the video starts playing
if (video) {
    video.addEventListener('loadedmetadata', syncDimensions);
    video.addEventListener('resize', syncDimensions);
}

console.log("MediaPipe Bridge: Landmarker attached and dimensions synced.");