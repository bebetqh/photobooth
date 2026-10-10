
/* =========================================
   SNAP & SMILE PHOTO BOOTH
   Photo-only version
   ========================================= */

// STEP 1: Supabase configuration.

const SUPABASE_URL =
  "https://pyfxtjrgsychawdlohmw.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_MOlIPBmHpblPoFpcSoAkXw_WbV-z-SQ";

const BUCKET = "booth-media";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// STEP 2: Page elements.

const camera = document.getElementById("camera");
const startCameraButton = document.getElementById("startCamera");
const takePhotoButton = document.getElementById("takePhoto");
const placeholder = document.getElementById("cameraPlaceholder");
const countdownDisplay = document.getElementById("countdown");
const statusText = document.getElementById("status");

const result = document.getElementById("result");
const photoPreview = document.getElementById("photoPreview");
const downloadPhoto = document.getElementById("downloadPhoto");

const qrPanel = document.getElementById("qrPanel");
const qrContainer = document.getElementById("qrcode");

const boothPage = document.getElementById("boothPage");
const galleryPage = document.getElementById("galleryPage");
const galleryList = document.getElementById("galleryList");
const galleryStatus = document.getElementById("galleryStatus");

const backToBoothButton = document.getElementById("backToBooth");


// STEP 3: Session management.

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
let busy = false;
let countdownRunning = false;


// STEP 4: Status messages.

function setStatus(message) {
  if (statusText) {
    statusText.textContent = message;
  }
}

function setGalleryStatus(message) {
  if (galleryStatus) {
    galleryStatus.textContent = message;
  }
}


// STEP 5: Start the camera.

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera access requires HTTPS or localhost."
      );
    }

    if (!window.supabase) {
      throw new Error("Supabase library failed to load.");
    }

    setStatus("Opening camera...");
    startCameraButton.disabled = true;

    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1920 },
        height: { ideal: 1440 }
      },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();

    placeholder.classList.add("hidden");
    takePhotoButton.disabled = false;

    setStatus("Camera ready! Smile for the camera.");

  } catch (error) {
    console.error("Camera error:", error);

    setStatus(
      `Camera could not start: ${error.message || error}`
    );

    startCameraButton.disabled = false;
  }
}


// STEP 6: Countdown.

async function runCountdown() {
  const seconds = Number(
    document.getElementById("timerSelect").value || 0
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


// STEP 7: Generate the QR code.

function showGalleryQRCode() {
  if (!qrContainer || !window.QRCode) {
    console.error("QR Code library failed to load.");
    setStatus("Photo uploaded, but the QR code library failed to load.");
    return;
  }

  qrContainer.innerHTML = "";

  const galleryUrl = new URL(window.location.href);

  galleryUrl.search = "";
  galleryUrl.searchParams.set("session", sessionId);
  galleryUrl.searchParams.set("page", "gallery");

  new QRCode(qrContainer, {
    text: galleryUrl.toString(),
    width: 200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.H
  });

  qrPanel.classList.remove("hidden");
}


// STEP 8: Take three photos and create the photostrip.

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

  busy = true;
  takePhotoButton.disabled = true;
  startCameraButton.disabled = true;

  try {
    const photos = [];
    const timer = Number(
      document.getElementById("timerSelect").value || 0
    );

    // Capture three photos.
    for (let i = 0; i < 3; i++) {
      setStatus(`Get ready! Photo ${i + 1} of 3`);

      await runCountdown();

      const canvas = document.createElement("canvas");

// Match the camera preview's 4:3 aspect ratio.
const aspectRatio = 4 / 3;
const sourceWidth = camera.videoWidth;
const sourceHeight = camera.videoHeight;

canvas.width = sourceWidth;
canvas.height = Math.round(sourceWidth / aspectRatio);

const context = canvas.getContext("2d", {
  alpha: false
});

if (!context) {
  throw new Error("Could not create the photo canvas.");
}

// Crop the source image to 4:3 without stretching.
let sx = 0;
let sy = 0;
let sw = sourceWidth;
let sh = sourceHeight;

if (sourceWidth / sourceHeight > aspectRatio) {
  sw = sourceHeight * aspectRatio;
  sx = (sourceWidth - sw) / 2;
} else {
  sh = sourceWidth / aspectRatio;
  sy = (sourceHeight - sh) / 2;
}

// Mirror the image to match the selfie preview.
context.save();
context.translate(canvas.width, 0);
context.scale(-1, 1);

context.drawImage(
  camera,
  sx, sy, sw, sh,
  0, 0, canvas.width, canvas.height
);

context.restore();

photos.push(canvas);

      if (i < 2) {
        setStatus(`Photo ${i + 1} captured!`);

        await new Promise(resolve =>
          setTimeout(resolve, 1200)
        );
      }
    }

    setStatus("Creating your wedding photostrip...");

    // Photostrip dimensions.
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

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Background.
    ctx.fillStyle = "#fffaf5";
    ctx.fillRect(0, 0, collage.width, collage.height);

    // Draw the three photos.
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

    // Wedding footer.
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

    // Export the photostrip.
    const photoBlob = await new Promise((resolve, reject) => {
      collage.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Could not export the photo."));
          }
        },
        "image/jpeg",
        0.95
      );
    });

    const photoFileName = `photostrip-${Date.now()}.jpg`;
    const photoPath = `${sessionId}/${photoFileName}`;

    setStatus("Uploading your photostrip...");

    // Upload to Supabase Storage.
    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(photoPath, photoBlob, {
        contentType: "image/jpeg",
        upsert: false
      });

    if (uploadError) {
      throw uploadError;
    }

    // Retrieve the public image URL.
    const { data: photoUrlData } = db.storage
      .from(BUCKET)
      .getPublicUrl(photoPath);

    const photoUrl = photoUrlData.publicUrl;

    // Display the finished photostrip.
    photoPreview.src = photoUrl;
    photoPreview.classList.remove("hidden");

    result.classList.remove("hidden");

    // Provide a direct download link.
    downloadPhoto.href = photoUrl;
    downloadPhoto.download = photoFileName;
    downloadPhoto.classList.remove("hidden");

    // Show the session gallery QR code.
    showGalleryQRCode();

    setStatus("Your wedding photostrip is ready!");

  } catch (error) {
    console.error("Photo booth error:", error);

    setStatus(
      `Sorry, something went wrong: ${error.message || error}`
    );

  } finally {
    busy = false;
    takePhotoButton.disabled = !cameraStream;
    startCameraButton.disabled = !!cameraStream;
  }
}


// STEP 9: Download a gallery photo.

async function downloadGalleryPhoto(path, url, fileName) {
  setGalleryStatus("Preparing your download...");

  try {
    const { data, error } = await db.storage
      .from(BUCKET)
      .download(path);

    let blob = data;

    if (error || !blob || blob.size === 0) {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
      }

      blob = await response.blob();
    }

    if (!blob || blob.size === 0) {
      throw new Error("The downloaded photo is empty.");
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);

    setGalleryStatus("Download started. Check your Downloads folder.");

  } catch (error) {
    console.error("Photo download error:", error);

    setGalleryStatus(
      `Download failed: ${error.message || error}`
    );
  }
}


// STEP 10: Load the gallery for the selected session.

async function loadGallery(id) {
  if (!galleryList || !galleryStatus) return;

  galleryList.innerHTML = "";
  setGalleryStatus("Loading your gallery...");

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

    const images = (files || []).filter(file =>
      /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(file.name)
    );

    if (images.length === 0) {
      setGalleryStatus("No photos found for this session yet.");
      return;
    }

    setGalleryStatus("");

    images.forEach(file => {
      const path = `${id}/${file.name}`;

      const { data: publicData } = db.storage
        .from(BUCKET)
        .getPublicUrl(path);

      const url = publicData.publicUrl;

      const card = document.createElement("div");
      card.className = "gallery-item";

      const image = document.createElement("img");
      image.src = url;
      image.alt = "Wedding photostrip";
      image.loading = "lazy";
      image.className = "gallery-media";

      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "button primary";
      downloadButton.textContent = "Download Photo";

      downloadButton.addEventListener("click", async () => {
        downloadButton.disabled = true;
        downloadButton.textContent = "Preparing...";

        try {
          await downloadGalleryPhoto(path, url, file.name);
        } finally {
          downloadButton.disabled = false;
          downloadButton.textContent = "Download Photo";
        }
      });

      card.appendChild(image);
      card.appendChild(downloadButton);
      galleryList.appendChild(card);
    });

  } catch (error) {
    console.error("Gallery loading error:", error);

    setGalleryStatus(
      `Could not load gallery: ${error.message || error}`
    );
  }
}


// STEP 11: Page navigation.

function showGallery() {
  boothPage.classList.add("hidden");
  galleryPage.classList.remove("hidden");

  loadGallery(sessionId);
}

function showBooth() {
  galleryPage.classList.add("hidden");
  boothPage.classList.remove("hidden");
}


// STEP 12: Event listeners.

startCameraButton.addEventListener("click", startCamera);
takePhotoButton.addEventListener("click", takePhoto);
backToBoothButton.addEventListener("click", showBooth);


// STEP 13: Open the requested page.

if (urlParams.get("page") === "gallery") {
  showGallery();
} else {
  showBooth();
}


// STEP 14: Stop the camera when leaving the page.

window.addEventListener("pagehide", () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
  }
});
