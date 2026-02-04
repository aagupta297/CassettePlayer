// ========================================
// app.js — Manifest-based playlists
// URL selects playlist:
//   index.html?list=volume1
//   index.html?list=volume2
// Each playlist provides:
//   title, door mp4, cassette mp4, tracks[]
// ========================================

const app = document.getElementById("app");
const cassetteVideo = document.getElementById("cassette");
const audio = document.getElementById("audio");

const doorOverlay = document.getElementById("doorOverlay");
const doorVideo = document.getElementById("doorVideo");

const doorSourceEl = document.getElementById("doorSource");
const cassetteSourceEl = document.getElementById("cassetteSource");

const powerBtn = document.getElementById("powerBtn");
const playPauseBtn = document.getElementById("playPauseBtn");
const playPauseIcon = document.getElementById("playPauseIcon");

const rewBtn = document.getElementById("rewBtn");
const ffBtn = document.getElementById("ffBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");

const statusEl = document.getElementById("status");
const rotateEl = document.getElementById("rotate");

const trackTitleEl = document.getElementById("trackTitle"); // hidden by default in HTML
const volumeLabelEl = document.getElementById("volumeLabel");

// Manifest-loaded state
let playlistTitle = "—";
let playlist = [];
let trackIndex = 0;

let powerOn = false;
let doorIsPlaying = false;

// ===== Helpers =====
function updateRotateHint() {
  const portrait = window.matchMedia("(orientation: portrait)").matches;
  rotateEl.style.display = portrait ? "block" : "none";
}
window.addEventListener("resize", updateRotateHint);

function setAccent(col) {
  document.documentElement.style.setProperty("--accent", col || "rgba(255,80,80,0.9)");
}

function syncCassetteToAudio() {
  const shouldPlay = powerOn && !audio.paused;
  if (shouldPlay) cassetteVideo.play().catch(() => {});
  else cassetteVideo.pause();
}

function updateControlEnablement() {
  const disabled = !powerOn || doorIsPlaying || playlist.length === 0;
  playPauseBtn.disabled = disabled;

  // transport buttons
  const transportDisabled = !powerOn || doorIsPlaying;
  rewBtn.disabled = transportDisabled;
  ffBtn.disabled = transportDisabled;
  prevBtn.disabled = transportDisabled;
  nextBtn.disabled = transportDisabled;
}

function refreshPlayPauseUI() {
  const playing = powerOn && !audio.paused;

  playPauseIcon.textContent = playing ? "❚❚" : "▶";
  playPauseBtn.querySelector(".label").textContent = playing ? "PAUSE" : "PLAY";
  playPauseBtn.classList.toggle("is-latched", playing);

  updateControlEnablement();
  syncCassetteToAudio();
}

function setTrack(i, autoplay = false) {
  if (!playlist.length) return;

  trackIndex = (i + playlist.length) % playlist.length;
  const track = playlist[trackIndex];

  // If you later want to show track name somewhere visible, use trackTitleEl/volumeLabelEl
  if (trackTitleEl) trackTitleEl.textContent = track.title || "—";

  setAccent(track.accent);

  audio.pause();
  audio.currentTime = 0;
  audio.src = track.file;
  audio.load();

  if (autoplay && powerOn && !doorIsPlaying) {
    audio.play().catch(() => {});
  }

  refreshPlayPauseUI();
}

// ===== Fullscreen + Orientation =====
async function enterFullscreen() {
  try {
    if (!document.fullscreenElement && app.requestFullscreen) {
      await app.requestFullscreen({ navigationUI: "hide" });
    }
  } catch (_) {}
}

async function exitFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch (_) {}
}

async function tryLandscapeLock() {
  try {
    if (screen.orientation?.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (_) {}
}

function tryOrientationUnlock() {
  try {
    if (screen.orientation?.unlock) screen.orientation.unlock();
  } catch (_) {}
}

// ===== Door animation =====
function showDoorOverlay() { doorOverlay.style.display = "grid"; }
function hideDoorOverlay() { doorOverlay.style.display = "none"; }

async function playDoorOnce() {
  if (!doorVideo) return;

  doorIsPlaying = true;
  updateControlEnablement();
  statusEl.textContent = "Loading tape…";
  showDoorOverlay();

  try {
    doorVideo.pause();
    doorVideo.currentTime = 0;
  } catch (_) {}

  doorVideo.loop = false;

  try {
    await doorVideo.play();
  } catch (_) {
    await new Promise(r => setTimeout(r, 300));
    hideDoorOverlay();
    doorIsPlaying = false;
    updateControlEnablement();
    statusEl.textContent = "Ready";
    return;
  }

  await new Promise(resolve => {
    doorVideo.onended = () => resolve();
  });

  hideDoorOverlay();
  doorIsPlaying = false;
  updateControlEnablement();
  statusEl.textContent = "Ready";
}

// ===== Load manifest =====
function getListName() {
  const params = new URLSearchParams(location.search);
  return (params.get("list") || "volume1").toLowerCase();
}

async function loadManifest() {
  const listName = getListName();

  const res = await fetch(`playlists/${listName}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not load playlists/${listName}.json`);

  const data = await res.json();

  playlistTitle = data.title || listName;
  playlist = Array.isArray(data.tracks) ? data.tracks : [];

  // UI label
  if (volumeLabelEl) volumeLabelEl.textContent = playlistTitle;

  // Swap door/cassette sources
  if (doorSourceEl && data.door) {
    doorSourceEl.src = data.door;
    doorVideo.load();
  }
  if (cassetteSourceEl && data.cassette) {
    cassetteSourceEl.src = data.cassette;
    cassetteVideo.load();
  }

  // Start at first track
  setTrack(0, false);

  updateControlEnablement();
  refreshPlayPauseUI();
}

// ===== Power =====
async function powerToggle() {
  powerOn = !powerOn;

  powerBtn.classList.toggle("is-latched", powerOn);
  const powerLabel = powerBtn.querySelector(".label");
  if (powerLabel) powerLabel.textContent = powerOn ? "ON" : "OFF";
  powerBtn.blur();

  if (powerOn) {
    statusEl.textContent = "Power on";
    updateControlEnablement();
    refreshPlayPauseUI();

    // If you prefer ON to fullscreen+landscape, keep these here (as you did)
    await enterFullscreen();
    await tryLandscapeLock();

    // Play door animation and lock controls until finished
    await playDoorOnce();

    refreshPlayPauseUI();
    return;
  }

  // POWER OFF
  audio.pause();
  audio.currentTime = 0;

  syncCassetteToAudio();

  doorIsPlaying = false;
  hideDoorOverlay();

  statusEl.textContent = "Power off";
  playPauseBtn.classList.remove("is-latched");

  tryOrientationUnlock();
  await exitFullscreen();

  updateControlEnablement();
  refreshPlayPauseUI();
}

// ===== Play/Pause =====
async function playPauseToggle() {
  if (!powerOn || doorIsPlaying || !playlist.length) return;

  if (audio.paused) {
    // No per-track looping. Auto-advance is handled by 'ended' event.
    audio.loop = false;

    try {
      await audio.play();
      enterFullscreen();
      tryLandscapeLock()
      statusEl.textContent = "Playing";
    } catch (_) {
      statusEl.textContent = "Couldn’t start audio — tap again";
    }
  } else {
    audio.pause();
    statusEl.textContent = "Paused";
  }

  refreshPlayPauseUI();
}

// ===== Rew/FF (Pointer Events, mobile-safe) =====
const TAP_JUMP_SECONDS = 10;
const HOLD_STEP_SECONDS = 1.5;
const HOLD_INTERVAL_MS = 140;
let holdTimer = null;

function nudge(seconds) {
  if (!powerOn || doorIsPlaying) return;
  const dur = Number.isFinite(audio.duration) ? audio.duration : Infinity;
  audio.currentTime = Math.max(0, Math.min(dur, audio.currentTime + seconds));
}

function startHold(direction) {
  if (!powerOn || doorIsPlaying) return;
  stopHold();
  holdTimer = setInterval(() => nudge(direction * HOLD_STEP_SECONDS), HOLD_INTERVAL_MS);
}

function stopHold() {
  if (holdTimer) clearInterval(holdTimer);
  holdTimer = null;
}

function wireHoldButton(btn, direction) {
  if (!btn) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    nudge(direction * TAP_JUMP_SECONDS);
  });

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    startHold(direction);
  });

  const end = () => stopHold();
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("pointerleave", end);
  btn.addEventListener("lostpointercapture", end);
}

wireHoldButton(rewBtn, -1);
wireHoldButton(ffBtn, +1);

// ===== Prev/Next =====
function nextTrack(autoplay = true) {
  if (!powerOn || doorIsPlaying || !playlist.length) return;
  const shouldAutoplay = autoplay && !audio.paused;
  setTrack(trackIndex + 1, shouldAutoplay);
}

function prevTrack(autoplay = true) {
  if (!powerOn || doorIsPlaying || !playlist.length) return;
  const shouldAutoplay = autoplay && !audio.paused;
  setTrack(trackIndex - 1, shouldAutoplay);
}

// Auto-advance
audio.addEventListener("ended", async () => {
  if (!powerOn || doorIsPlaying || !playlist.length) return;

  setTrack(trackIndex + 1, true);

  try {
    await audio.play();
    statusEl.textContent = "Playing";
  } catch (_) {
    statusEl.textContent = "Tap Play";
  }

  refreshPlayPauseUI();
});

// ===== Wire =====
powerBtn.addEventListener("click", powerToggle);
playPauseBtn.addEventListener("click", playPauseToggle);
nextBtn.addEventListener("click", () => nextTrack(true));
prevBtn.addEventListener("click", () => prevTrack(true));

audio.addEventListener("play", refreshPlayPauseUI);
audio.addEventListener("pause", refreshPlayPauseUI);

// ===== Init =====
(async function init() {
  updateRotateHint();

  // Ensure cassette doesn’t move until audio plays
  try { cassetteVideo.pause(); cassetteVideo.currentTime = 0; } catch (_) {}
  syncCassetteToAudio();

  powerOn = false;
  doorIsPlaying = false;
  statusEl.textContent = "Power off";
  hideDoorOverlay();

  // Load selected playlist
  try {
    await loadManifest();
  } catch (err) {
    statusEl.textContent = "Playlist load failed";
    console.error(err);
  }

  updateControlEnablement();
  refreshPlayPauseUI();
})();
