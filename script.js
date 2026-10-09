
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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    requestedSession
  );

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
let recordingCanvasStream = null;
let recordingAnimationId = null;

// STEP 4: Update status message.
function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

// STEP 5: Start the camera.
async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera requires HTTPS or a supported local development address."
      );
    }

    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      cameraStream = null;
    }

    setStatus("Opening camera...");

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1440 }
      },
      audio: true
    });

    camera.srcObject = cameraStream;
    await camera.play();

    placeholder?.classList.add("hidden");
    takePhotoButton.disabled = false;
    startVideoButton.disabled = false;

    setStatus("Camera ready! Smile for the camera.");
  } catch (error) {
    console.error("Camera error:", error);

    setStatus(
      "Camera could not start. Allow camera and microphone access and use HTTPS."
    );
  }
}

// STEP 6: Countdown helper.
async function runCountdown() {
  const timerSelect = document.getElementById("timerSelect");
  const seconds = Number(timerSelect?.value || 0);

  if (seconds === 0) return;

  countdownRunning = true;
  countdownDisplay?.classList.remove("hidden");

  try {
    for (let number = seconds; number > 0; number--) {
      countdownDisplay.textContent = number;

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally {
    countdownDisplay?.classList.add("hidden");
    countdownRunning = false;
  }
}

// STEP 7: Take three photos and build a high-resolution photostrip.
async function takePhoto() {
  if (
    !cameraStream ||
    busy ||
    countdownRunning ||
    !camera.videoWidth ||
    !camera.videoHeight
  ) {
    return;
  }

  takePhotoButton.disabled = true;
  startVideoButton.disabled = true;

  try {
    const photos = [];
    const timer = Number(
      document.getElementById("timerSelect")?.value || 0
    );

    for (let i = 0; i < 3; i++) {
      setStatus(`Get ready! Photo ${i + 1} of 3`);

      // Countdown before each shot.
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

      // Capture at the actual camera resolution.
      const canvas = document.createElement("canvas");
      canvas.width = camera.videoWidth;
      canvas.height = camera.videoHeight;

      const photoContext = canvas.getContext("2d", {
        alpha: false
      });

      if (!photoContext) {
        throw new Error("Could not create the photo canvas.");
      }

      // Mirror the selfie horizontally.
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

      // Give guests time between photos.
      if (i < 2) {
        setStatus(`Photo ${i + 1} captured!`);

        await new Promise(resolve =>
          setTimeout(resolve, 1200)
        );
      }
    }

    setStatus("Creating your high-quality wedding photostrip...");

    // HIGH-RESOLUTION PHOTO STRIP SETTINGS.
    // Each photo is exported at 1080 x 810 pixels.
    const photoWidth = 1080;
    const photoHeight = 810;
    const margin = 36;
    const gap = 24;
    const footer = 270;

    const collage = document.createElement("canvas");

    collage.width = photoWidth + margin * 2;
    collage.height =
      margin * 2 +
      photoHeight * 3 +
      gap * 2 +
      footer;

    const ctx = collage.getContext("2d", {
      alpha: false
    });

    if (!ctx) {
      throw new Error("Could not create the photostrip.");
    }

    // Improve image resampling quality.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Warm white wedding background.
    ctx.fillStyle = "#FFFDF9";
    ctx.fillRect(0, 0, collage.width, collage.height);

    // Draw all three photos without stretching.
    photos.forEach((photo, i) => {
      const sourceWidth = photo.width;
      const sourceHeight = photo.height;
      const targetRatio = 4 / 3;
      const sourceRatio = sourceWidth / sourceHeight;

      let cropX = 0;
      let cropY = 0;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;

      // Centre-crop only when the camera aspect ratio differs.
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
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        margin,
        y,
        photoWidth,
        photoHeight
      );
    });

    // Wedding footer.
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const center = collage.width / 2;
    const footerTop =
      margin * 2 +
      photoHeight * 3 +
      gap * 2;

    // Couple's names.
    ctx.fillStyle = "#8A7358";
    ctx.font = "italic 72px Georgia";
    ctx.fillText(
      "Syahlen & Tiqah",
      center,
      footerTop + 66
    );

    // Wedding message.
    ctx.fillStyle = "#51413D";
    ctx.font = "33px Georgia";
    ctx.fillText(
      "A DAY TO REMEMBER",
      center,
      footerTop + 147
    );

    // Wedding date.
    ctx.fillStyle = "#8A7770";
    ctx.font = "30px Arial";
    ctx.fillText(
      "08 AUGUST 2026",
      center,
      footerTop + 213
    );

    // Export at high JPEG quality.
    const blob = await new Promise(resolve => {
      collage.toBlob(resolve, "image/jpeg", 0.95);
    });

    if (!blob) {
      throw new Error("Could not create the high-quality photostrip.");
    }

    showPreview(blob, "photo");
    await uploadMedia(blob, "jpg", "image/jpeg");

  } catch (error) {
    console.error("Photo error:", error);
    setStatus("Photo failed: " + error.message);
  } finally {
    countdownRunning = false;
    countdownDisplay?.classList.add("hidden");
    takePhotoButton.disabled = false;
    startVideoButton.disabled = false;
  }
}

// STEP 8: Show a local preview.
function showPreview(blob, type) {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(blob);

  document.getElementById("result")?.classList.remove("hidden");

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

// STEP 9: Record a mirrored video with microphone audio.
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

    // Match the warm wedding photostrip design.
    const photoWidth = 1080;
    const photoHeight = 810;
    const margin = 36;
    const footer = 270;

    const videoCanvas = document.createElement("canvas");
    videoCanvas.width = photoWidth + margin * 2;
    videoCanvas.height = margin + photoHeight + footer;

    const ctx = videoCanvas.getContext("2d", {
      alpha: false
    });

    if (!ctx) {
      throw new Error("Could not create the video canvas.");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const center = videoCanvas.width / 2;
    const footerTop = margin + photoHeight;

    // Calculate a centre crop for a 4:3 camera frame.
    const sourceWidth = camera.videoWidth;
    const sourceHeight = camera.videoHeight;
    const targetRatio = 4 / 3;
    const sourceRatio = sourceWidth / sourceHeight;

    let cropX = 0;
    let cropY = 0;
    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;

    if (sourceRatio > targetRatio) {
      cropWidth = sourceHeight * targetRatio;
      cropX = (sourceWidth - cropWidth) / 2;
    } else if (sourceRatio < targetRatio) {
      cropHeight = sourceWidth / targetRatio;
      cropY = (sourceHeight - cropHeight) / 2;
    }

    // Draw the wedding design and live video frame.
    function drawWeddingFrame() {
      // Ivory background.
      ctx.fillStyle = "#FFFDF9";
      ctx.fillRect(
        0,
        0,
        videoCanvas.width,
        videoCanvas.height
      );

      // Subtle champagne border around the video.
      ctx.fillStyle = "#D7C3A5";
      ctx.fillRect(
        margin - 3,
        margin - 3,
        photoWidth + 6,
        photoHeight + 6
      );

      // Clip the camera image inside the photo frame.
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        margin,
        margin,
        photoWidth,
        photoHeight
      );
      ctx.clip();

      // Mirror the live selfie, just like the photostrip.
      ctx.translate(margin + photoWidth, margin);
      ctx.scale(-1, 1);

      ctx.drawImage(
        camera,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        photoWidth,
        photoHeight
      );

      ctx.restore();

      // Wedding names.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#8A7358";
      ctx.font = "italic 72px Georgia";
      ctx.fillText(
        "Syahlen & Tiqah",
        center,
        footerTop + 66
      );

      // Wedding message.
      ctx.fillStyle = "#51413D";
      ctx.font = "33px Georgia";
      ctx.fillText(
        "A DAY TO REMEMBER",
        center,
        footerTop + 147
      );

      // Wedding date.
      ctx.fillStyle = "#8A7770";
      ctx.font = "30px Arial";
      ctx.fillText(
        "08 AUGUST 2026",
        center,
        footerTop + 213
      );
    }

    // Render the first frame before recording starts.
    drawWeddingFrame();

    // Record the complete canvas, including the design.
    recordingCanvasStream = videoCanvas.captureStream(30);

    // Preserve microphone audio from the camera stream.
    const recordingStream = new MediaStream([
      ...recordingCanvasStream.getVideoTracks(),
      ...cameraStream.getAudioTracks()
    ]);

    function animateVideo() {
      if (!recorder || recorder.state !== "recording") {
        return;
      }

      drawWeddingFrame();

      recordingAnimationId =
        requestAnimationFrame(animateVideo);
    }

    recorder = new MediaRecorder(recordingStream, {
      mimeType
    });

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

      // Stop canvas capture tracks only.
      if (recordingCanvasStream) {
        recordingCanvasStream.getTracks().forEach(track => {
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

        setStatus("Preparing your wedding video...");

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

    recorder.start(1000);
    animateVideo();

    startVideoButton.disabled = true;
    takePhotoButton.disabled = true;
    stopVideoButton.disabled = false;
    stopVideoButton.classList.remove("hidden");

    setStatus(
      "🔴 Recording wedding video... Press Stop Recording when finished."
    );

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

// Stop video recording.
function stopRecording(event) {
  if (event) {
    event.preventDefault();
  }

  if (!recorder) {
    setStatus("No active recording was found.");
    return;
  }

  if (recorder.state === "inactive") {
    setStatus("The recording has already stopped.");
    return;
  }

  stopVideoButton.disabled = true;
  setStatus("Preparing your wedding video...");

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
    console.error("Upload error:", error);

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

  qrPanel.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

// STEP 12: Load the gallery on a guest's phone.
// Save a photo or video on the guest's device.
async function saveGalleryFile(url, fileName, isVideo) {
  try {
    galleryStatus.textContent = "Preparing your file...";

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `Download failed. Server status: ${response.status}`
      );
    }

    const blob = await response.blob();

    const file = new File([blob], fileName, {
      type: blob.type ||
        (isVideo ? "video/mp4" : "image/jpeg")
    });

    // iPhone/iPad: open the native Share Sheet.
    if (
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        title: isVideo ? "Wedding Video" : "Wedding Photo"
      });

      galleryStatus.textContent =
        "Use the Share menu to save your file.";
      return;
    }

    // Fallback for browsers supporting file downloads.
    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");

    downloadLink.href = objectUrl;
    downloadLink.download = fileName;
    downloadLink.style.display = "none";

    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();

    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60000);

    galleryStatus.textContent =
      "Download requested. Check your Downloads folder.";

  } catch (error) {
    if (error.name === "AbortError") {
      galleryStatus.textContent = "Save cancelled.";
      return;
    }

    console.error("File download error:", error);

    galleryStatus.textContent =
      "Unable to download this file. Try opening it directly.";

    // Provide a direct link if fetching/sharing fails.
    const fallbackLink = document.createElement("a");
    fallbackLink.href = url;
    fallbackLink.target = "_blank";
    fallbackLink.rel = "noopener";
    fallbackLink.textContent = isVideo
      ? "Open video in browser"
      : "Open photo in browser";

    galleryStatus.appendChild(
      document.createTextNode(" ")
    );
    galleryStatus.appendChild(fallbackLink);
  }
}

// Load the gallery for a specific guest session.
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
        sortBy: {
          column: "created_at",
          order: "desc"
        }
      });

    if (error) throw error;

    const files = (data || []).filter(file =>
      file.name && !file.name.startsWith(".")
    );

    if (files.length === 0) {
      galleryStatus.textContent =
        "No files found yet. Please try again after uploads finish.";
      return;
    }

    for (const file of files) {
      const path = `${id}/${file.name}`;

      const { data: publicData } = db.storage
        .from(BUCKET)
        .getPublicUrl(path);

      const url = publicData.publicUrl;

      // Recognise common photo and video file extensions.
      const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(
        file.name
      );

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
        media.alt = "Wedding photo";
        media.loading = "lazy";
      }

      media.src = url;

      // Create a visible, working save button.
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "download-link";
      saveButton.textContent = isVideo
        ? "⬇ Save Wedding Video"
        : "⬇ Save Wedding Photo";

      saveButton.addEventListener("click", async () => {
        saveButton.disabled = true;

        try {
          await saveGalleryFile(url, file.name, isVideo);
        } finally {
          saveButton.disabled = false;
        }
      });

      // Direct-open link as an additional fallback.
      const openLink = document.createElement("a");
      openLink.href = url;
      openLink.target = "_blank";
      openLink.rel = "noopener";
      openLink.textContent = isVideo
        ? "Open video"
        : "Open photo";

      item.append(media, saveButton, openLink);
      galleryList.appendChild(item);
    }

    galleryStatus.textContent =
      `${files.length} file(s) available. Enjoy your memories!`;

  } catch (error) {
    console.error("Gallery loading error:", error);

    galleryStatus.textContent =
      "Could not load the gallery. Check your connection or Supabase Storage permissions.";
  }
}

// STEP 13: Connect buttons.
// startCameraButton.addEventListener("click", startCamera);
// takePhotoButton.addEventListener("click", takePhoto);
// startVideoButton.addEventListener("click", startRecording);
// stopVideoButton.addEventListener("click", stopRecording);

console.log("Snap & Smile: JavaScript loaded");

if (startCameraButton) {
  startCameraButton.addEventListener("click", async () => {
    console.log("Start Camera clicked!");

    startCameraButton.disabled = true;

    try {
      await startCamera();
    } catch (error) {
      console.error("Start camera failed:", error);
      setStatus("Camera error: " + error.message);
    } finally {
      startCameraButton.disabled = false;
    }
  });
} else {
  console.error('Cannot find button with id "startCamera"');
}

if (takePhotoButton) {
  takePhotoButton.addEventListener("click", takePhoto);
}

if (startVideoButton) {
  startVideoButton.addEventListener("click", startRecording);
}

if (stopVideoButton) {
  stopVideoButton.addEventListener("click", stopRecording);
}

// STEP 14: Show the guest gallery when the URL has a valid session.
if (validSession) {
  loadGallery(requestedSession);
}
