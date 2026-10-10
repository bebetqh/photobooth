/* =========================================
   SNAP & SMILE WEDDING PHOTO BOOTH
   Static JPG + real-motion animated GIF
   ========================================= */

// Use your Supabase project URL and publishable key.
const SUPABASE_URL = "https://pyfxtjrgsychawdlohmw.supabase.co";
const SUPABASE_KEY = "sb_publishable_MOlIPBmHpblPoFpcSoAkXw_WbV-z-SQ";
const BUCKET = "booth-media";

// Wedding design.
const WEDDING_NAMES = "Syahlen & Tiqah";
const WEDDING_TAGLINE = "A DAY TO REMEMBER";
const WEDDING_DATE = "08 AUGUST 2026";

// GIF settings: shorter clips and reduced dimensions help keep files smaller.
const CLIP_DURATION_MS = 1800;
const GIF_WIDTH = 360;
const GIF_FPS = 5;
const GIF_DELAY = 1000 / GIF_FPS;

if (!window.supabase) {
  alert("Supabase could not load. Please check your internet connection.");
}
const db = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

// Page elements.
const camera = document.getElementById("camera");
const startCameraButton = document.getElementById("startCamera");
const takePhotoButton = document.getElementById("takePhoto");
const placeholder = document.getElementById("cameraPlaceholder");
const countdownDisplay = document.getElementById("countdown");
const statusText = document.getElementById("status");
const result = document.getElementById("result");
const photoPreview = document.getElementById("photoPreview");
const gifPreview = document.getElementById("gifPreview");
const downloadPhoto = document.getElementById("downloadPhoto");
const downloadGif = document.getElementById("downloadGif");
const qrPanel = document.getElementById("qrPanel");
const qrContainer = document.getElementById("qrcode");
const boothPage = document.getElementById("boothPage");
const galleryPage = document.getElementById("galleryPage");
const galleryList = document.getElementById("galleryList");
const galleryStatus = document.getElementById("galleryStatus");
const backToBoothButton = document.getElementById("backToBooth");

const urlParams = new URLSearchParams(window.location.search);
const requestedSession = urlParams.get("session");
const isValidSession = requestedSession &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedSession);
const sessionId = isValidSession ? requestedSession : crypto.randomUUID();

let cameraStream = null;
let busy = false;
let countdownRunning = false;

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}
function setGalleryStatus(message) {
  if (galleryStatus) galleryStatus.textContent = message;
}
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startCamera() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }
    if (!db) throw new Error("Supabase library failed to load.");

    setStatus("Opening camera...");
    startCameraButton.disabled = true;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });

    camera.srcObject = cameraStream;
    await camera.play();
    placeholder.classList.add("hidden");
    takePhotoButton.disabled = false;
    setStatus("Camera ready! Get ready to capture three moving poses.");
  } catch (error) {
    console.error("Camera error:", error);
    setStatus(`Camera could not start: ${error.message || error}`);
    startCameraButton.disabled = false;
  }
}

async function runCountdown() {
  const seconds = Number(document.getElementById("timerSelect").value || 0);
  if (!seconds) return;

  countdownRunning = true;
  countdownDisplay.classList.remove("hidden");
  try {
    for (let n = seconds; n > 0; n--) {
      countdownDisplay.textContent = n;
      await wait(1000);
    }
    countdownDisplay.textContent = "Smile!";
    await wait(250);
  } finally {
    countdownDisplay.classList.add("hidden");
    countdownRunning = false;
  }
}

// Record real camera movement for one pose.
async function recordClip(durationMs) {
  if (!cameraStream) throw new Error("Camera is not running.");
  if (!window.MediaRecorder) {
    throw new Error("This browser does not support video recording. Try an updated Chrome or Edge browser.");
  }

  const mimeType = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ].find(type => MediaRecorder.isTypeSupported(type));

  const recorder = mimeType
    ? new MediaRecorder(cameraStream, { mimeType, videoBitsPerSecond: 900000 })
    : new MediaRecorder(cameraStream);

  const chunks = [];
  const stopped = new Promise((resolve, reject) => {
    recorder.addEventListener("dataavailable", event => {
      if (event.data && event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      if (!chunks.length) reject(new Error("The camera did not record a video clip."));
      else resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
    }, { once: true });
    recorder.addEventListener("error", () => reject(new Error("Video recording failed.")), { once: true });
  });

  recorder.start(200);
  await wait(durationMs);
  if (recorder.state !== "inactive") recorder.stop();
  return stopped;
}

// Crop the camera frame to 4:3 and mirror it to match the selfie preview.
function drawCameraFrame(canvas) {
  const sourceWidth = camera.videoWidth;
  const sourceHeight = camera.videoHeight;
  if (!sourceWidth || !sourceHeight) throw new Error("Camera is not ready yet.");

  canvas.width = 1200;
  canvas.height = 900;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create the photo canvas.");

  const targetRatio = 4 / 3;
  let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
  if (sourceWidth / sourceHeight > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.94) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not export the image.")), type, quality);
  });
}

// Wait for a recorded clip to load, then extract evenly spaced frames.
async function extractClipFrames(blob, frameCount) {
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = objectUrl;

  try {
    await new Promise((resolve, reject) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
      video.addEventListener("error", () => reject(new Error("Could not read a recorded video clip.")), { once: true });
      video.load();
    });

    const duration = Number.isFinite(video.duration) ? video.duration : CLIP_DURATION_MS / 1000;
    const frames = [];
    const safeDuration = Math.max(0.1, duration - 0.08);

    for (let i = 0; i < frameCount; i++) {
      const time = frameCount === 1 ? 0.02 : Math.max(0.02, safeDuration * i / (frameCount - 1));
      await new Promise((resolve, reject) => {
        const onSeeked = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("Could not extract GIF frames.")); };
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        video.addEventListener("error", onError, { once: true });
        try { video.currentTime = time; }
        catch (error) { cleanup(); reject(error); }
      });

      const frame = document.createElement("canvas");
      frame.width = GIF_WIDTH;
      frame.height = Math.round(GIF_WIDTH * 3 / 4);
      const ctx = frame.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("Could not create animation frames.");

      const ratio = 4 / 3;
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sw / sh > ratio) {
        sw = sh * ratio;
        sx = (video.videoWidth - sw) / 2;
      } else {
        sh = sw / ratio;
        sy = (video.videoHeight - sh) / 2;
      }
      // Mirror the frame to match the on-screen selfie preview.
      ctx.translate(frame.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, frame.width, frame.height);
      frames.push(frame);
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

function drawWeddingFooter(ctx, width, y, height, scale = 1) {
  ctx.textAlign = "center";
  ctx.fillStyle = "#6e5145";
  ctx.font = `italic ${Math.round(27 * scale)}px Georgia, serif`;
  ctx.fillText(WEDDING_NAMES, width / 2, y + Math.round(38 * scale));
  ctx.fillStyle = "#6e5145";
  ctx.font = `bold ${Math.round(12 * scale)}px Arial, sans-serif`;
  ctx.fillText(WEDDING_TAGLINE, width / 2, y + Math.round(63 * scale));
  ctx.font = `${Math.round(11 * scale)}px Arial, sans-serif`;
  ctx.fillText(WEDDING_DATE, width / 2, y + Math.round(84 * scale));
}

function createStaticStrip(photos) {
  const width = 1152;
  const photoWidth = 1080;
  const photoHeight = 810;
  const margin = 36;
  const gap = 24;
  const footerHeight = 180;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = margin * 2 + photoHeight * 3 + gap * 2 + footerHeight;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create the photostrip.");
  ctx.fillStyle = "#fffaf5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  photos.forEach((photo, index) => {
    const y = margin + index * (photoHeight + gap);
    ctx.drawImage(photo, margin, y, photoWidth, photoHeight);
  });

  const footerY = margin + photoHeight * 3 + gap * 2;
  drawWeddingFooter(ctx, width, footerY, footerHeight, 2);
  return canvas;
}

// Build one animated frame containing all three moving photo sections.
function createAnimatedFrame(framesForEachPose, frameIndex) {
  const photoWidth = GIF_WIDTH;
  const photoHeight = Math.round(GIF_WIDTH * 3 / 4);
  const margin = 12;
  const gap = 8;
  const footerHeight = 64;
  const width = photoWidth + margin * 2;
  const height = margin * 2 + photoHeight * 3 + gap * 2 + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fffaf5";
  ctx.fillRect(0, 0, width, height);

  framesForEachPose.forEach((frames, index) => {
    const selectedFrame = frames[Math.min(frameIndex, frames.length - 1)];
    const y = margin + index * (photoHeight + gap);
    ctx.drawImage(selectedFrame, margin, y, photoWidth, photoHeight);
  });

  const footerY = margin + photoHeight * 3 + gap * 2;
  drawWeddingFooter(ctx, width, footerY, footerHeight, 0.65);
  return canvas;
}

function createGif(framesForEachPose) {
  if (!window.GIF) throw new Error("GIF encoder did not load. Refresh the page and try again.");

  return new Promise((resolve, reject) => {
    const gif = new GIF({
      workers: 2,
      quality: 15,
      width: GIF_WIDTH + 24,
      height: 24 + Math.round(GIF_WIDTH * 3 / 4) * 3 + 16 + 64,
      workerScript: "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js",
      repeat: 0,
      background: "#fffaf5"
    });

    const frameCount = Math.min(...framesForEachPose.map(frames => frames.length));
    for (let i = 0; i < frameCount; i++) {
      gif.addFrame(createAnimatedFrame(framesForEachPose, i), { delay: GIF_DELAY, copy: true });
    }
    gif.on("finished", resolve);
    gif.on("abort", () => reject(new Error("GIF creation was cancelled.")));
    gif.render();
  });
}

async function uploadBlob(path, blob, contentType) {
  const { error } = await db.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
    cacheControl: "3600"
  });
  if (error) throw error;
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function showGalleryQRCode() {
  if (!qrContainer || !window.QRCode) {
    setStatus("Both photostrips are uploaded, but the QR code library failed to load.");
    return;
  }
  qrContainer.innerHTML = "";
  const galleryUrl = new URL(window.location.href);
  galleryUrl.search = "";
  galleryUrl.searchParams.set("session", sessionId);
  galleryUrl.searchParams.set("page", "gallery");

  if (!window.QRCode) {
    setStatus("Photostrips uploaded, but the QR code library failed to load.");
    return;
  }
  new QRCode(qrContainer, {
    text: galleryUrl.toString(),
    width: 200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.H
  });
  qrPanel.classList.remove("hidden");
}

async function takePhoto() {
  if (!cameraStream || busy || countdownRunning || !camera.videoWidth || !camera.videoHeight) return;

  busy = true;
  takePhotoButton.disabled = true;
  startCameraButton.disabled = true;
  result.classList.add("hidden");
  qrPanel.classList.add("hidden");

  try {
    const stillPhotos = [];
    const poseClips = [];

    for (let i = 0; i < 3; i++) {
      setStatus(`Pose ${i + 1} of 3: get ready...`);
      await runCountdown();

      setStatus(`Recording movement ${i + 1} of 3 — keep moving naturally!`);
      const clipPromise = recordClip(CLIP_DURATION_MS);
      // Capture a still image from the live camera while the clip records.
      await wait(Math.min(500, CLIP_DURATION_MS / 3));
      const still = document.createElement("canvas");
      drawCameraFrame(still);
      stillPhotos.push(still);

      const clip = await clipPromise;
      poseClips.push(clip);

      if (i < 2) {
        setStatus(`Pose ${i + 1} captured. Preparing the next pose...`);
        await wait(650);
      }
    }

    setStatus("Creating your classic photostrip...");
    const staticStrip = createStaticStrip(stillPhotos);
    const jpgBlob = await canvasToBlob(staticStrip, "image/jpeg", 0.94);

    setStatus("Preparing movement frames for your animated photostrip...");
    const framesForEachPose = [];
    for (let i = 0; i < poseClips.length; i++) {
      setStatus(`Processing movement ${i + 1} of 3...`);
      framesForEachPose.push(await extractClipFrames(poseClips[i], 8));
    }

    setStatus("Creating your animated GIF. This may take a moment...");
    const gifBlob = await createGif(framesForEachPose);

    const stamp = Date.now();
    const jpgName = `photostrip-${stamp}.jpg`;
    const gifName = `motion-photostrip-${stamp}.gif`;
    const jpgPath = `${sessionId}/${jpgName}`;
    const gifPath = `${sessionId}/${gifName}`;

    setStatus("Uploading both photostrips...");
    const jpgUrl = await uploadBlob(jpgPath, jpgBlob, "image/jpeg");
    const gifUrl = await uploadBlob(gifPath, gifBlob, "image/gif");

    photoPreview.src = jpgUrl;
    gifPreview.src = gifUrl;
    downloadPhoto.href = jpgUrl;
    downloadPhoto.download = jpgName;
    downloadGif.href = gifUrl;
    downloadGif.download = gifName;
    result.classList.remove("hidden");

    showGalleryQRCode();
    setStatus("Your JPG and animated GIF photostrips are ready!");
  } catch (error) {
    console.error("Photo booth error:", error);
    setStatus(`Sorry, something went wrong: ${error.message || error}`);
  } finally {
    busy = false;
    takePhotoButton.disabled = !cameraStream;
    startCameraButton.disabled = !!cameraStream;
  }
}

async function downloadGalleryPhoto(path, url, fileName) {
  setGalleryStatus("Preparing your download...");
  try {
    const { data, error } = await db.storage.from(BUCKET).download(path);
    let blob = data;
    if (error || !blob || blob.size === 0) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      blob = await response.blob();
    }
    if (!blob || blob.size === 0) throw new Error("The downloaded file is empty.");

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
    console.error("Download error:", error);
    setGalleryStatus(`Download failed: ${error.message || error}`);
  }
}

function createGalleryCard(file, url, path) {
  const isGif = /\.gif$/i.test(file.name);
  const isJpg = /\.(jpg|jpeg)$/i.test(file.name);
  const card = document.createElement("article");
  card.className = "gallery-item";

  const image = document.createElement("img");
  image.src = url;
  image.alt = isGif ? "Animated wedding photostrip" : "Wedding photostrip";
  image.loading = "lazy";

  const heading = document.createElement("h3");
  heading.textContent = isGif ? "Animated Photostrip" : "Classic Photostrip";

  const description = document.createElement("p");
  description.textContent = isGif
    ? "A moving memory in GIF format."
    : "Your three still photos in JPG format.";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "button primary";
  button.textContent = isGif ? "Download GIF" : "Download JPG";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Preparing...";
    try {
      await downloadGalleryPhoto(path, url, file.name);
    } finally {
      button.disabled = false;
      button.textContent = isGif ? "Download GIF" : "Download JPG";
    }
  });

  card.append(image, heading, description, button);
  return card;
}

async function loadGallery(id) {
  if (!galleryList || !galleryStatus || !db) return;
  galleryList.innerHTML = "";
  setGalleryStatus("Loading your gallery...");

  try {
    const { data: files, error } = await db.storage.from(BUCKET).list(id, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" }
    });
    if (error) throw error;

    const images = (files || []).filter(file =>
      /\.(jpg|jpeg|gif)$/i.test(file.name)
    );

    if (!images.length) {
      setGalleryStatus("No photos found for this session yet.");
      return;
    }

    setGalleryStatus("");
    // Display JPG before GIF for each matching timestamp/session.
    images.sort((a, b) => {
      const aGif = /\.gif$/i.test(a.name);
      const bGif = /\.gif$/i.test(b.name);
      if (aGif !== bGif) return aGif ? 1 : -1;
      return b.name.localeCompare(a.name);
    });

    images.forEach(file => {
      const path = `${id}/${file.name}`;
      const { data } = db.storage.from(BUCKET).getPublicUrl(path);
      galleryList.appendChild(createGalleryCard(file, data.publicUrl, path));
    });
  } catch (error) {
    console.error("Gallery loading error:", error);
    setGalleryStatus(`Could not load gallery: ${error.message || error}`);
  }
}

function showGallery() {
  boothPage.classList.add("hidden");
  galleryPage.classList.remove("hidden");
  loadGallery(sessionId);
}
function showBooth() {
  galleryPage.classList.add("hidden");
  boothPage.classList.remove("hidden");
}

startCameraButton.addEventListener("click", startCamera);
takePhotoButton.addEventListener("click", takePhoto);
backToBoothButton.addEventListener("click", showBooth);

if (urlParams.get("page") === "gallery" && isValidSession) {
  showGallery();
} else {
  showBooth();
}

window.addEventListener("pagehide", () => {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
});
