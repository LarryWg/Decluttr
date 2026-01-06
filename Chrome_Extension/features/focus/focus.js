// Back button
document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "../../popup/App.html";
});

const video = document.getElementById('camera-feed');

const constraints = {
    video: true,
    audio: false
}

async function startCamera() {
    try {
        // Request access to camera
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Attach the stream to the video element
        video.srcObject = stream;
        
    } catch (err) {
        // Handle cases where the user denies permission or no camera is found
        console.error(`Error accessing camera: ${err.name}`, err);
        alert(`Could not access the camera. Error: ${err.name}`);
    }
}

// Call the function to start the process (e.g., on a button click or page load)
startCamera();