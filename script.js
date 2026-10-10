/* =========================================
   SNAP & SMILE PHOTO BOOTH
   ========================================= */

// STEP 1: Supabase project details.
const SUPABASE_URL = "https://pyfxtjrgsychawdlohmw.supabase.co";
const SUPABASE_KEY = "sb_publishable_MOlIPBmHpblPoFpcSoAkXw_WbV-zS-Q";
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
    ctx.fillStyle = "#fffaf5";
    ctx.fillRect(0, 0, collage.width, collage.height);

    // Draw each photo into the photostrip.
    photos.forEach((photo, index) => {
      const y = margin + index * (photoHeight + gap);

      ctx.drawImage(
        photo,
        margin,
        y,
        photoWidth,
        photoHeight
      );
    });

    // Add the wedding footer.
    const footerY =
      margin +
      photoHeight * 3 +
      gap * 2;

    ctx.textAlign = "center";
    ctx.fillStyle = "#6e5145";

    ctx.font = "italic 54px Georgia, serif";
    ctx.fillText(
      "Syahlen & Tiqah",
      collage.width / 2,
      footerY + 75
    );

    ctx.font = "bold 25px Arial, sans-serif";
    ctx.fillText(
      "A DAY TO REMEMBER",
      collage.width / 2,
      footerY + 125
    );

    ctx.font = "22px Arial, sans-serif";
    ctx.fillText(
      "08 AUGUST 2026",
      collage.width / 2,
      footerY + 170
    );

    // Export the photostrip as a high-quality JPEG.
    const photoBlob = await new Promise((resolve, reject) => {
      collage.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error("Could not export the photostrip."));
        },
        "image/jpeg",
        0.95
      );
    });

    const photoFileName =
      `photostrip-${Date.now()}.jpg`;

    const photoPath =
      `${sessionId}/${photoFileName}`;

    setStatus("Uploading your photostrip...");

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(photoPath, photoBlob, {
        contentType: "image/jpeg",
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    uploadedFiles++;

    const { data: photoUrlData } = db.storage
      .from(BUCKET)
      .getPublicUrl(photoPath);

    const photoUrl = photoUrlData.publicUrl;

    if (photoPreview) {
      photoPreview.src = photoUrl;
      photoPreview.classList.remove("hidden");
    }

    // Show a QR code linking to the session gallery.
    if (qrContainer && window.QRCode) {
      qrContainer.innerHTML = "";

      const galleryUrl = new URL(window.location.href);
      galleryUrl.searchParams.set("session", sessionId);
      galleryUrl.searchParams.set("page", "gallery");

      new QRCode(qrContainer, {
        text: galleryUrl.toString(),
        width: 180,
        height: 180
      });

      qrPanel?.classList.remove("hidden");
    }

    setStatus("Your wedding photostrip is ready!");

  } catch (error) {
    console.error("Photo booth error:", error);
    setStatus(`Sorry, something went wrong: ${error.message || error}`);
  } finally {
    takePhotoButton.disabled = false;
    startVideoButton.disabled = false;
  }
}

// STEP 8: Record and upload a video.

function startVideo() {
  if (!cameraStream || recorder?.state === "recording") {
    return;
  }

  if (!window.MediaRecorder) {
    setStatus("Video recording is not supported in this browser.");
    return;
  }

  try {
    recordedChunks = [];

    // Prefer WebM for Chrome/Firefox; use MP4 if supported.
    const supportedTypes = [
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9,opus",
      "video/webm",
      "video/mp4"
    ];

    const mimeType = supportedTypes.find(type =>
      MediaRecorder.isTypeSupported(type)
    );

    recorder = mimeType
      ? new MediaRecorder(cameraStream, { mimeType })
      : new MediaRecorder(cameraStream);

    const activeRecorder = recorder;

    activeRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    activeRecorder.onerror = event => {
      console.error("Recording error:", event.error);
      setStatus("Video recording failed. Please try again.");
      startVideoButton.disabled = false;
      stopVideoButton.disabled = true;
    };

    activeRecorder.onstop = async () => {
      try {
        const finalType =
          activeRecorder.mimeType || "video/webm";

        const videoBlob = new Blob(recordedChunks, {
          type: finalType
        });

        if (!videoBlob.size) {
          throw new Error("No video data was recorded.");
        }

        const extension = finalType.includes("mp4")
          ? "mp4"
          : "webm";

        const fileName =
          `wedding-video-${Date.now()}.${extension}`;

        const path = `${sessionId}/${fileName}`;

        setStatus("Uploading your wedding video...");

        const { error } = await db.storage
          .from(BUCKET)
          .upload(path, videoBlob, {
            contentType: finalType,
            upsert: false
          });

        if (error) throw error;

        // Display the saved video.
        const { data } = db.storage
          .from(BUCKET)
          .getPublicUrl(path);

        if (videoPreview) {
          videoPreview.src = data.publicUrl;
          videoPreview.controls = true;
          videoPreview.classList.remove("hidden");
          videoPreview.load();
        }

        setStatus(
          "Video saved successfully! Open the gallery to download it."
        );

      } catch (error) {
        console.error("Video upload error:", error);
        setStatus(
          `Could not save video: ${error.message || error}`
        );
      } finally {
        startVideoButton.disabled = false;
        stopVideoButton.disabled = true;
      }
    };

    activeRecorder.start(1000);

startVideoButton.disabled = true;
stopVideoButton.disabled = false;

// Ensure the Stop button is visible during recording.
stopVideoButton.hidden = false;
stopVideoButton.style.display = "inline-block";
stopVideoButton.style.visibility = "visible";

setStatus("Recording your wedding video...");

  } catch (error) {
    console.error("Could not start recording:", error);

    setStatus(
      `Could not start recording: ${error.message || error}`
    );

    startVideoButton.disabled = false;
    stopVideoButton.disabled = true;
  }
}


// STEP 9: Stop the active video recording.

function stopVideo() {
  console.log("Stop Video button clicked.");

  if (!recorder) {
    setStatus("No recording was found.");
    return;
  }

  if (recorder.state === "recording") {
    setStatus("Stopping video and saving your recording...");

    stopVideoButton.disabled = true;
    recorder.stop();

  } else if (recorder.state === "inactive") {
    setStatus("Recording has already stopped.");
  } else {
    setStatus("Please wait for the recording to finish.");
  }
}

// STEP 10: Download a photo or video.

async function saveGalleryFile(path, url, fileName, isVideo) {
  if (!galleryStatus) return;

  try {
    galleryStatus.textContent = "Preparing your download...";

    let blob;
    let downloadName = fileName;

    // First try Supabase Storage.
    const { data, error } = await db.storage
      .from(BUCKET)
      .download(path);

    if (!error && data && data.size > 0) {
      blob = data;
    } else {
      // Fallback to the public URL.
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Could not retrieve file: HTTP ${response.status}`
        );
      }

      blob = await response.blob();
    }

    if (!blob || blob.size === 0) {
      throw new Error("The downloaded file is empty.");
    }

    // Ensure the downloaded file has the right extension.
    if (isVideo && !/\.(mp4|webm|mov|m4v|ogg)$/i.test(downloadName)) {
      const extension = blob.type.includes("mp4")
        ? "mp4"
        : "webm";

      downloadName = `${downloadName}.${extension}`;
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = downloadName;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Release the temporary download URL later.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    galleryStatus.textContent =
      "Download started. Check your Downloads folder.";

  } catch (error) {
    console.error("Gallery download error:", error);

    galleryStatus.textContent =
      `Download failed: ${error.message || error}.`;

    // Let the user open the original file as a fallback.
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open video";
      link.style.display = "inline-block";

      galleryStatus.appendChild(document.createTextNode(" "));
      galleryStatus.appendChild(link);
    }
  }
}

// STEP 11: Load files from the session gallery.
async function loadGallery(id) {
  if (!galleryList || !galleryStatus) return;

  galleryList.innerHTML = "";
  galleryStatus.textContent = "Loading your gallery...";

  try {
    const { data: files, error } = await db.storage
      .from(BUCKET)
      .list(id, {
        limit: 100,
        sortBy: {
          column: "created_at",
          order: "desc"
        }
      });

    if (error) throw error;

    if (!files || files.length === 0) {
      galleryStatus.textContent =
        "No photos or videos found for this session yet.";
      return;
    }

    galleryStatus.textContent = "";

    files.forEach(file => {
      if (!file.name || file.name === ".emptyFolderPlaceholder") {
        return;
      }

      // The stored file path includes the session folder.
      const path = `${id}/${file.name}`;

      const { data: publicData } = db.storage
        .from(BUCKET)
        .getPublicUrl(path);

      const url = publicData.publicUrl;

      const isVideo =
        /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);

      const isImage =
        /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(file.name);

      if (!isVideo && !isImage) return;

      const card = document.createElement("div");
      card.className = "gallery-item";

      if (isVideo) {
        const video = document.createElement("video");
        video.src = url;
        video.controls = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.className = "gallery-media";
        card.appendChild(video);
      } else {
        const image = document.createElement("img");
        image.src = url;
        image.alt = "Wedding photo";
        image.loading = "lazy";
        image.className = "gallery-media";
        card.appendChild(image);
      }

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "download-button";
      downloadButton.textContent = isVideo
        ? "Save Wedding Video"
        : "Save Photo";

      downloadButton.addEventListener("click", async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = "Preparing...";

        try {
          // IMPORTANT FIX: pass path as well as the public URL.
          await saveGalleryFile(path, url, file.name, isVideo);
        } finally {
          downloadButton.disabled = false;
          downloadButton.textContent = isVideo
            ? "Save Wedding Video"
            : "Save Photo";
        }
      });

      card.appendChild(downloadButton);
      galleryList.appendChild(card);
    });

    if (!galleryList.children.length) {
      galleryStatus.textContent =
        "No supported photos or videos were found.";
    }

  } catch (error) {
    console.error("Gallery loading error:", error);

    galleryStatus.textContent =
      `Could not load gallery: ${error.message || error}`;
  }
}

// STEP 12: Set up page navigation and buttons.
function showGallery() {
  boothPage?.classList.add("hidden");
  galleryPage?.classList.remove("hidden");
  loadGallery(sessionId);
}

function showBooth() {
  galleryPage?.classList.add("hidden");
  boothPage?.classList.remove("hidden");
}

// STEP 13: Attach event listeners.
startCameraButton?.addEventListener("click", startCamera);
takePhotoButton?.addEventListener("click", takePhoto);
// 

if (startVideoButton) {
  startVideoButton.addEventListener("click", startVideo);
}

if (stopVideoButton) {
  stopVideoButton.addEventListener("click", stopVideo);
  stopVideoButton.disabled = true;
}

document.getElementById("openGallery")?.addEventListener(
  "click",
  showGallery
);

document.getElementById("backToBooth")?.addEventListener(
  "click",
  showBooth
);

// STEP 14: Open the requested page.
const requestedPage = urlParams.get("page");

if (requestedPage === "gallery") {
  showGallery();
} else {
  showBooth();
}