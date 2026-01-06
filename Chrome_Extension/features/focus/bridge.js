import { FaceDetector, FilesetResolver } from "./lib/vision_bundle.js";

// Manually attach to window so focus.js can access them
window.FaceDetector = FaceDetector;
window.FilesetResolver = FilesetResolver;

console.log("MediaPipe Bridge: Objects attached to window.");