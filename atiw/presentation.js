const presentation = document.getElementById("presentation");
const stageWindow = document.getElementById("stage-window");
const slides = Array.from(presentation.querySelectorAll(".slide"));
const headings = slides.map(slide => slide.querySelector("h1, h2"));
const navigation = Array.from(document.querySelectorAll("#segments .segment"));
const counter = document.getElementById("count");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const nextLabel = document.getElementById("next-label");
const fullscreen = document.getElementById("fullscreen");
const replay = document.getElementById("replay");
const modelLayer = presentation.querySelector(".model-layer");
const building = document.getElementById("building");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const cameraShots = [
  { start: "-42deg 50deg 118%", end: "24deg 64deg 89%" },
  { start: "34deg 69deg 108%", end: "-16deg 26deg 85%" },
];

navigation.forEach((link, index) => {
  link.addEventListener("click", event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    goTo(index);
  });
});

let current = -1;
let modelRequested = false;
let modelReady = false;
let cameraFrame;

function setCamera() {
  const shot = cameraShots[current];
  if (!modelReady || !shot) return;
  building.cameraOrbit = shot.end;
  if (reducedMotion.matches) building.jumpCameraToGoal();
}

function replayCamera() {
  const shot = cameraShots[current];
  if (!modelReady || !shot || reducedMotion.matches) return;

  cancelAnimationFrame(cameraFrame);
  building.cameraOrbit = shot.start;
  building.jumpCameraToGoal();
  // Let the viewer render the starting orbit before it interpolates to the next one.
  cameraFrame = requestAnimationFrame(() => {
    cameraFrame = requestAnimationFrame(setCamera);
  });
}

function loadBuilding() {
  if (modelRequested) return;
  modelRequested = true;
  modelLayer.hidden = false;

  function showPoster() {
    modelReady = false;
    presentation.classList.remove("model-ready");
    modelLayer.hidden = true;
  }

  building.addEventListener("error", showPoster, { once: true });
  building.addEventListener("load", () => {
    modelReady = true;
    presentation.classList.add("model-ready");
    if (reducedMotion.matches) setCamera();
    else replayCamera();
  }, { once: true });

  import("./vendor/model-viewer.min.js").catch(showPoster);
}

function updateMotionPreference() {
  replay.hidden = reducedMotion.matches;
  cancelAnimationFrame(cameraFrame);
  setCamera();
}

reducedMotion.addEventListener("change", updateMotionPreference);
replay.addEventListener("click", () => {
  for (const animation of slides[current].getAnimations({ subtree: true })) {
    if (!("animationName" in animation)) continue;
    animation.currentTime = 0;
    animation.play();
  }
  replayCamera();
});

function slideFromUrl() {
  const match = /^#slide-([1-9]\d*)$/.exec(location.hash);
  const index = match ? Number(match[1]) - 1 : 0;
  return index < slides.length ? index : 0;
}

function goTo(index, { focus = true, updateUrl = true } = {}) {
  if (index < 0 || index >= slides.length || index === current) return;

  const hadModel = current >= 0 && current < cameraShots.length;
  cancelAnimationFrame(cameraFrame);
  presentation.dataset.direction = index < current ? "back" : "forward";
  current = index;
  presentation.dataset.current = String(index);
  if (index < cameraShots.length) {
    loadBuilding();
    if (hadModel || reducedMotion.matches) setCamera();
    else replayCamera();
  }

  slides.forEach((slide, slideIndex) => {
    const active = slideIndex === index;
    slide.hidden = !active;
    if (active) navigation[slideIndex].setAttribute("aria-current", "step");
    else navigation[slideIndex].removeAttribute("aria-current");
  });

  previous.disabled = index === 0;
  nextLabel.textContent = index === slides.length - 1 ? "Restart" : "Next";
  counter.textContent = `${index + 1} / ${slides.length}`;

  if (updateUrl) {
    history.replaceState(null, "", index === 0 ? location.pathname + location.search : `#slide-${index + 1}`);
  }
  if (focus) headings[index].focus({ preventScroll: true });
  stageWindow.scrollTop = 0;
}

previous.addEventListener("click", () => goTo(current - 1));
next.addEventListener("click", () => goTo(current === slides.length - 1 ? 0 : current + 1));
window.addEventListener("hashchange", () => goTo(slideFromUrl(), { updateUrl: false }));

document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
  if (event.target.closest("input, textarea, select, [contenteditable]")) return;

  const keys = {
    ArrowLeft: current - 1,
    PageUp: current - 1,
    ArrowRight: current + 1,
    PageDown: current + 1,
    Home: 0,
    End: slides.length - 1,
  };

  if (Object.hasOwn(keys, event.key)) {
    event.preventDefault();
    goTo(keys[event.key]);
  } else if (event.code === "Space" && !event.target.closest("button, a")) {
    event.preventDefault();
    goTo(current + (event.shiftKey ? -1 : 1));
  }
});

const desktop = matchMedia("(min-width: 851px) and (pointer: fine)");
let wheelDistance = 0;
let wheelFinished = false;
let wheelIdle;

window.addEventListener("wheel", event => {
  if (!desktop.matches || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

  const limit = stageWindow.scrollHeight - stageWindow.clientHeight;
  const canScroll = event.deltaY > 0 ? stageWindow.scrollTop < limit - 2 : stageWindow.scrollTop > 2;
  if (canScroll) return;

  clearTimeout(wheelIdle);
  wheelIdle = setTimeout(() => {
    wheelDistance = 0;
    wheelFinished = false;
  }, 165);

  if (wheelFinished) return;
  wheelDistance += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (Math.abs(wheelDistance) >= 48) {
    goTo(current + Math.sign(wheelDistance));
    wheelFinished = true;
  }
}, { passive: true });

if (document.fullscreenEnabled) {
  const label = fullscreen.lastElementChild;
  fullscreen.hidden = false;
  document.addEventListener("fullscreenchange", () => {
    const active = Boolean(document.fullscreenElement);
    fullscreen.setAttribute("aria-pressed", String(active));
    label.textContent = active ? "Exit fullscreen" : "Fullscreen";
  });
  fullscreen.addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      label.textContent = "Fullscreen unavailable";
    }
  });
}

document.documentElement.classList.add("deck-ready");
goTo(slideFromUrl(), { focus: false, updateUrl: false });
previous.hidden = false;
next.hidden = false;
updateMotionPreference();
