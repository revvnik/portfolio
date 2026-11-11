const presentation = document.getElementById("presentation");
const slides = Array.from(presentation.querySelectorAll(".slide"));
const headings = slides.map(slide => slide.querySelector("h1, h2"));
const controls = document.getElementById("controls");
const segments = document.getElementById("segments");
const counter = document.getElementById("count");
const previous = document.getElementById("previous");
const next = document.getElementById("next");
const nextLabel = document.getElementById("next-label");
const fullscreen = document.getElementById("fullscreen");
const modelLayer = presentation.querySelector(".model-layer");
const building = document.getElementById("building");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const cameraOrbits = ["24deg 64deg 89%", "-16deg 26deg 85%"];

const navigation = headings.map((heading, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "segment";
  button.setAttribute("aria-label", `Slide ${index + 1}: ${heading.innerText.replace(/\s+/g, " ")}`);
  button.addEventListener("click", () => goTo(index));
  segments.append(button);
  return button;
});

let current = -1;
let modelRequested = false;
let modelReady = false;

function setCamera() {
  const orbit = cameraOrbits[current];
  if (!modelReady || !orbit) return;
  building.cameraOrbit = orbit;
  if (reducedMotion.matches) building.jumpCameraToGoal();
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
    if (current !== 0 || reducedMotion.matches) {
      setCamera();
      building.jumpCameraToGoal();
    } else {
      requestAnimationFrame(setCamera);
    }
    presentation.classList.add("model-ready");
  }, { once: true });

  import("./vendor/model-viewer.min.js").catch(showPoster);
}

reducedMotion.addEventListener("change", setCamera);

function slideFromUrl() {
  const match = /^#slide-([1-9]\d*)$/.exec(location.hash);
  const index = match ? Number(match[1]) - 1 : 0;
  return index < slides.length ? index : 0;
}

function goTo(index, { focus = true, updateUrl = true } = {}) {
  if (index < 0 || index >= slides.length || index === current) return;

  presentation.dataset.direction = index < current ? "back" : "forward";
  current = index;
  presentation.dataset.current = String(index);
  if (index < cameraOrbits.length) {
    loadBuilding();
    setCamera();
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
  if (focus) {
    headings[index].focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
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
  if (document.documentElement.scrollHeight > innerHeight + 4 || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;

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
controls.hidden = false;
