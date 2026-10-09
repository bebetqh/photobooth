
/* =========================================
   SNAP & SMILE PHOTO BOOTH
   ========================================= */

// STEP 1: Add your Supabase project details.
const SUPABASE_URL = "https://pyfxtjrgsychawdlohmw.supabase.co";
const SUPABASE_KEY = "sb_publishable_MOlIPBmHpblPoFpcSoAkXw_WbV-z-SQ";
const BUCKET = "booth-media";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// STEP 2: Get page elements.
const camera = document.getElementById("camera");
const startCameraButton = document.getElementById("startCamera");
const takePhotoButton = document.getElementById("takePhoto");
const startVideoButton = document.getElementById("startVideo");
const stopVideoButton = document.getElementById("stopVideo");

const placeholder = document.getElementById("cameraPlaceholder");
const countdownDisplay = document.getElementById("countdown");
const statusText = document.getElementById("status");
const photoPreview = document.getElementById("photoPreview");
const videoPreview = document.getElementById("videoPreview");

const qrPanel = document.getElementById("qrPanel");
const qrContainer = document.getElementById("qrcode");

const boothPage = document.getElementById("boothPage");
const galleryPage = document.getElementById("galleryPage");
const galleryList = document.getElementById("galleryList");
const galleryStatus = document.getElementById("galleryStatus");

// STEP 3: Create a unique session for each group.
const urlParams = new URLSearchParams(window.location.search);
const requestedSession = urlParams.get("session");

const validSession =
  requestedSession &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(requestedSession);

const sessionId = validSession
  ? requestedSession
  : crypto.randomUUID();

let cameraStream = null;
let recorder = null;
let recordedChunks = [];
let busy = false;
let countdownRunning = false;
let previewUrl = null;
let uploadedFiles = 0;

// STEP 4: Update the status message.
function setStatus(message) {
  statusText.textContent = message;
}

// STEP 5: Start the camera.
async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera requires HTTPS or a supported local development address."
      );
    }

    setStatus("Opening camera...");

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: true
    });

    camera.srcObject = cameraStream;
    await camera.play();

    placeholder.classList.add("hidden");
    takePhotoButton.disabled = false;
    startVideoButton.disabled = false;

    setStatus("Camera ready! Smile for the camera.");
  } catch (error) {
    console.error(error);
    setStatus(
      "Camera could not start. Allow camera and microphone access and use HTTPS."
    );
  }
}

// STEP 6: Countdown before taking a photo.
async function runCountdown() {
  const seconds = Number(
    document.getElementById("timerSelect").value
  );

  if (seconds === 0) return;

  countdownRunning = true;
  countdownDisplay.classList.remove("hidden");

  try {
    for (let number = seconds; number > 0; number--) {
      countdownDisplay.textContent = number;

      await new Promise(resolve =>
        setTimeout(resolve, 1000)
      );
    }
  } finally {
    countdownDisplay.classList.add("hidden");
    countdownRunning = false;
  }
}

// STEP 7: Take a photo.
async function takePhoto() {
  if (!cameraStream || busy || countdownRunning) return;

  takePhotoButton.disabled = true;
  startVideoButton.disabled = true;

  try {
    const photos = [];
    const timer = Number(
      document.getElementById("timerSelect").value
    );

    for (let i = 0; i < 3; i++) {
      setStatus(`Get ready! Photo ${i + 1} of 3`);

      // Countdown before EACH shot
      if (timer > 0) {
        countdownRunning = true;
        countdownDisplay.classList.remove("hidden");

        for (let n = timer; n > 0; n--) {
          countdownDisplay.textContent = n;
          await new Promise(resolve =>
            setTimeout(resolve, 1000)
          );
        }

        countdownDisplay.classList.add("hidden");
        countdownRunning = false;
      }

      // Capture this shot
      const canvas = document.createElement("canvas");
      canvas.width = camera.videoWidth;
      canvas.height = camera.videoHeight;

      const photoContext = canvas.getContext("2d");

      photoContext.save();
      photoContext.translate(canvas.width, 0);
      photoContext.scale(-1, 1);

      photoContext.drawImage(
        camera,
        0,
        0,
        canvas.width,
        canvas.height
      );

      photoContext.restore();

      photos.push(canvas);

      // Pause so the next picture is a separate moment
      if (i < 2) {
        setStatus(`Photo ${i + 1} captured!`);
        await new Promise(resolve =>
          setTimeout(resolve, 1200)
        );
      }
    }

    setStatus("Making your 3-photo collage...");

/* Build a compact 4:3 photo booth strip */

const photoWidth = 360;
const photoHeight = 270; // Exact 4:3 ratio

const margin = 12;
const gap = 8;
const footer = 90;

const collage = document.createElement("canvas");

collage.width = photoWidth + margin * 2;
collage.height =
  margin * 2 +
  photoHeight * 3 +
  gap * 2 +
  footer;

const ctx = collage.getContext("2d");

// Background
ctx.fillStyle = "#FFF8F0";
ctx.fillRect(0, 0, collage.width, collage.height);

// Crop each photo to 4:3, like the camera preview
photos.forEach((photo, i) => {
  const sourceWidth = photo.width;
  const sourceHeight = photo.height;
  const targetRatio = 4 / 3;
  const sourceRatio = sourceWidth / sourceHeight;

  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  const y = margin + i * (photoHeight + gap);

  ctx.drawImage(
    photo,
    cropX, cropY, cropWidth, cropHeight,
    margin, y, photoWidth, photoHeight
  );
});

// Footer
ctx.textAlign = "center";
ctx.textBaseline = "middle";

const center = collage.width / 2;
const footerTop = margin * 2 + photoHeight * 3 + gap * 2;

ctx.fillStyle = "#C16E65";
ctx.font = "bold 24px Arial";
ctx.fillText("SNAP & SMILE", center, footerTop + 20);

ctx.fillStyle = "#51413D";
ctx.font = "bold 12px Arial";
ctx.fillText(
  "THREE SHOTS. ONE MEMORY.",
  center,
  footerTop + 46
);

ctx.fillStyle = "#8A7770";
ctx.font = "10px Arial";
ctx.fillText(
  "PHOTO BOOTH • 2026",
  center,
  footerTop + 68
);

    const blob = await new Promise(resolve =>
      collage.toBlob(resolve, "image/jpeg", 0.75)
    );

    if (!blob) throw new Error("Could not create collage.");

    showPreview(blob, "photo");
    await uploadMedia(blob, "jpg", "image/jpeg");

  } catch (error) {
    console.error(error);
    setStatus("Photo failed: " + error.message);
  } finally {
    countdownRunning = false;
    countdownDisplay.classList.add("hidden");
    takePhotoButton.disabled = false;
    startVideoButton.disabled = false;
  }
}

// STEP 8: Show a local preview.
function showPreview(blob, type) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);

  previewUrl = URL.createObjectURL(blob);

  document.getElementById("result").classList.remove("hidden");

  if (type === "photo") {
    photoPreview.src = previewUrl;
    photoPreview.classList.remove("hidden");
    videoPreview.classList.add("hidden");
  } else {
    videoPreview.src = previewUrl;
    videoPreview.classList.remove("hidden");
    photoPreview.classList.add("hidden");
  }
}

// STEP 9: Record a video.
let recordingCanvasStream = null;
let recordingAnimationId = null;

function startRecording() {
  if (!cameraStream || busy || recorder) {
    return;
  }

  if (!camera.videoWidth || !camera.videoHeight) {
    setStatus("Please wait for the camera to be ready.");
    return;
  }

  if (!window.MediaRecorder) {
    setStatus("Video recording is not supported by this browser.");
    return;
  }

  const supportedTypes = [
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4"
  ];

  const mimeType = supportedTypes.find(type =>
    MediaRecorder.isTypeSupported(type)
  );

  if (!mimeType) {
    setStatus("This browser does not support a compatible video format.");
    return;
  }

  try {
    recordedChunks = [];

    // Create a canvas for mirrored video frames.
    const recordingCanvas = document.createElement("canvas");
    recordingCanvas.width = camera.videoWidth;
    recordingCanvas.height = camera.videoHeight;

    const ctx = recordingCanvas.getContext("2d");

    // Capture the canvas as a video stream.
    recordingCanvasStream = recordingCanvas.captureStream(30);

    // Combine mirrored video with microphone audio.
    const tracks = [
      ...recordingCanvasStream.getVideoTracks(),
      ...cameraStream.getAudioTracks()
    ];

    const recordingStream = new MediaStream(tracks);

    function drawMirroredFrame() {
      if (!recorder || recorder.state !== "recording") {
        return;
      }

      ctx.save();
      ctx.setTransform(-1, 0, 0, 1, recordingCanvas.width, 0);
      ctx.drawImage(
        camera,
        0,
        0,
        recordingCanvas.width,
        recordingCanvas.height
      );
      ctx.restore();

      recordingAnimationId =
        requestAnimationFrame(drawMirroredFrame);
    }

    recorder = new MediaRecorder(recordingStream, { mimeType });

    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onerror = event => {
      console.error("Recording error:", event.error || event);
      setStatus("Recording error. Please try again.");
    };

    recorder.onstop = async () => {
      if (recordingAnimationId !== null) {
        cancelAnimationFrame(recordingAnimationId);
        recordingAnimationId = null;
      }

      // Stop only the canvas video tracks.
      // Keep the camera and microphone running.
      if (recordingCanvasStream) {
        recordingCanvasStream.getVideoTracks().forEach(track => {
          track.stop();
        });
        recordingCanvasStream = null;
      }

      const videoBlob = new Blob(recordedChunks, {
        type: mimeType
      });

      const videoExtension = mimeType.includes("mp4")
        ? "mp4"
        : "webm";

      recordedChunks = [];
      recorder = null;

      try {
        if (!videoBlob.size) {
          throw new Error("No video data was recorded.");
        }

        setStatus("Preparing your video...");
        showPreview(videoBlob, "video");

        await uploadMedia(
          videoBlob,
          videoExtension,
          mimeType
        );
      } catch (error) {
        console.error("Video processing error:", error);
        setStatus("Video failed: " + error.message);
      } finally {
        startVideoButton.disabled = false;
        takePhotoButton.disabled = false;
        stopVideoButton.disabled = false;
        stopVideoButton.classList.add("hidden");
      }
    };

    // Start recording before drawing frames.
    recorder.start(1000);
    drawMirroredFrame();

    startVideoButton.disabled = true;
    takePhotoButton.disabled = true;
    stopVideoButton.disabled = false;
    stopVideoButton.classList.remove("hidden");

    setStatus("🔴 Recording video... Press Stop Recording when finished.");

  } catch (error) {
    console.error("Could not start recording:", error);

    if (recordingAnimationId !== null) {
      cancelAnimationFrame(recordingAnimationId);
      recordingAnimationId = null;
    }

    if (recordingCanvasStream) {
      recordingCanvasStream.getTracks().forEach(track => {
        track.stop();
      });
      recordingCanvasStream = null;
    }

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch (stopError) {
        console.error(stopError);
      }
    }

    recorder = null;
    startVideoButton.disabled = false;
    takePhotoButton.disabled = false;
    stopVideoButton.disabled = false;
    stopVideoButton.classList.add("hidden");

    setStatus("Could not start recording. Check the browser console.");
  }
}

/* STOP VIDEO RECORDING */

function stopRecording(event) {
  if (event) {
    event.preventDefault();
  }

  console.log("Stop Recording button clicked.");

  if (!recorder) {
    setStatus("No active recording was found.");
    return;
  }

  if (recorder.state === "inactive") {
    setStatus("The recording has already stopped.");
    return;
  }

  stopVideoButton.disabled = true;
  setStatus("Stopping recording and preparing your video...");

  try {
    recorder.stop();
  } catch (error) {
    console.error("Could not stop recording:", error);
    stopVideoButton.disabled = false;
    setStatus("Could not stop recording. Please try again.");
  }
}

// STEP 10: Upload media to Supabase.
async function uploadMedia(blob, extension, contentType) {
  if (busy) return;

  busy = true;

  try {
    const fileName =
      `${sessionId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    setStatus("Uploading your file... Please wait.");

    const { error } = await db.storage
      .from(BUCKET)
      .upload(fileName, blob, {
        contentType,
        upsert: false
      });

    if (error) throw error;

    uploadedFiles++;

    setStatus("Upload complete! Your file is ready.");
    createQRCode();
  } catch (error) {
    console.error(error);
    setStatus(
      "Upload failed. Check your Supabase settings and internet connection."
    );
  } finally {
    busy = false;
    stopVideoButton.disabled = false;
  }
}

// STEP 11: Create a QR code linking to this session's gallery.
function createQRCode() {
  const galleryUrl = new URL(window.location.href);

  galleryUrl.search = "";
  galleryUrl.hash = "";
  galleryUrl.searchParams.set("session", sessionId);

  qrContainer.replaceChildren();

  new QRCode(qrContainer, {
    text: galleryUrl.href,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });

  qrPanel.classList.remove("hidden");

  document.getElementById("qrPanel").scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

// STEP 12: Load the gallery on a guest's phone.
async function loadGallery(id) {
  boothPage.classList.add("hidden");
  galleryPage.classList.remove("hidden");

  galleryStatus.textContent = "Loading your files...";
  galleryList.replaceChildren();

  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(id, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      });

    if (error) throw error;

    const files = (data || []).filter(file =>
      file.name && !file.name.startsWith(".")
    );

    if (files.length === 0) {
      galleryStatus.textContent =
        "No files found yet. Please scan again after the uploads finish.";
      return;
    }

    for (const file of files) {
      const path = `${id}/${file.name}`;

      const { data: publicData } = db.storage
        .from(BUCKET)
        .getPublicUrl(path);

      const url = publicData.publicUrl;
      const isVideo = /\.(mp4|webm|mov)$/i.test(file.name);

      const item = document.createElement("div");
      item.className = "gallery-item";

      let media;

      if (isVideo) {
        media = document.createElement("video");
        media.controls = true;
        media.playsInline = true;
        media.preload = "metadata";
      } else {
        media = document.createElement("img");
        media.alt = "Your photo";
        media.loading = "lazy";
      }

      media.src = url;

      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.download = file.name;
      link.textContent = isVideo
        ? "⬇ Download video"
        : "⬇ Download photo";

      item.append(media, link);
      galleryList.appendChild(item);
    }

    galleryStatus.textContent =
      `${files.length} file(s) available. Enjoy your memories!`;
  } catch (error) {
    console.error(error);
    galleryStatus.textContent =
      "Could not load the gallery. Check your connection or storage permissions.";
  }
}

// STEP 13: Connect buttons.
startCameraButton.addEventListener("click", startCamera);
takePhotoButton.addEventListener("click", takePhoto);
startVideoButton.addEventListener("click", startRecording);
stopVideoButton.addEventListener("click", stopRecording);

// STEP 14: Decide whether to show the booth or a guest gallery.
if (validSession) {
  loadGallery(requestedSession);
}

