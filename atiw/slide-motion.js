const ease = "cubic-bezier(.25, .7, .25, 1)";

const handoffs = [
  null,
  "locations-qsolid",
  "qsolid-portrait",
  "portrait-workstation",
  "workstation-lab",
];

const subjects = [
  null,
  ".gallery-model",
  ".chip-core",
  ".portrait img",
  ".computer-screen",
  ".vm",
];

function box(element, stage) {
  const { left, top, width, height } = element.getBoundingClientRect();
  const origin = stage.getBoundingClientRect();
  return { x: left - origin.left, y: top - origin.top, width, height };
}

function place(element, bounds) {
  Object.assign(element.style, {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
  });
}

function align(from, to) {
  return `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.width / from.width}, ${to.height / from.height})`;
}

function cropTo(frame, opening) {
  const top = Math.max(0, opening.y - frame.y);
  const left = Math.max(0, opening.x - frame.x);
  const right = Math.max(0, frame.x + frame.width - opening.x - opening.width);
  const bottom = Math.max(0, frame.y + frame.height - opening.y - opening.height);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 7px)`;
}

function aerialFocus(bounds) {
  return {
    x: bounds.x + bounds.width * .14,
    y: bounds.y + bounds.height * .23,
    width: bounds.width * .72,
    height: bounds.height * .52,
  };
}

export function createSlideMotion(stage, slides, reducedMotion) {
  const plates = slides.map(slide => slide.querySelector(".plate"));
  const modelLayer = stage.querySelector(".model-layer");
  let active;
  let last;

  function finish() {
    if (!active) return;
    const { layer, animations } = active;
    active = undefined;
    for (const animation of animations) animation.cancel();
    layer.remove();
  }

  function capture(from, to) {
    finish();
    last = undefined;
    const name = handoffs[Math.min(from, to)];
    if (!name || Math.abs(from - to) !== 1 || reducedMotion.matches || !stage.animate) return null;

    return {
      name,
      from,
      to,
      plate: box(plates[from], stage),
      subject: box(slides[from].querySelector(subjects[from]), stage),
    };
  }

  function play(transition) {
    if (!transition || reducedMotion.matches) return;
    finish();
    last = transition;

    const { name, from, to, plate, subject } = transition;
    const forward = to > from;
    const incoming = slides[to];
    const target = incoming.querySelector(subjects[to]);
    const targetBox = box(target, stage);

    const layer = document.createElement("div");
    layer.className = "handoff-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;

    const outgoing = plates[from].cloneNode(true);
    outgoing.classList.add("handoff-outgoing");
    if (from === 1 && getComputedStyle(modelLayer).visibility === "hidden") {
      outgoing.classList.add("handoff-poster");
    }
    place(outgoing, plate);
    layer.append(outgoing);
    stage.append(layer);

    const animations = [];
    const motion = { layer, animations };
    active = motion;

    function animate(element, keyframes, duration, delay = 0) {
      animations.push(element.animate(keyframes, { duration, delay, easing: ease, fill: "both" }));
    }

    function fadeOutgoing(duration, transform = "none") {
      animate(outgoing, [
        { opacity: 1, transform: "none" },
        { opacity: .87, offset: .22 },
        { opacity: 0, transform },
      ], duration);
    }

    function moveFrom(element, start, duration, delay = 0) {
      animate(element, [
        { transform: align(box(element, stage), start), transformOrigin: "top left", opacity: .25 },
        { transform: "none", transformOrigin: "top left", opacity: 1 },
      ], duration, delay);
    }

    function movePortrait(photo, end, duration, fadeAtEnd) {
      const moving = photo.cloneNode(false);
      moving.alt = "";
      moving.className = "handoff-portrait";
      place(moving, subject);
      layer.append(moving);
      photo.style.visibility = "hidden";
      const motion = align(subject, end);
      animate(moving, [
        { transform: "none", opacity: 1, borderRadius: "14px 14px 0 0" },
        { opacity: 1, offset: fadeAtEnd },
        { transform: motion, opacity: 0, borderRadius: "6px" },
      ], duration);
    }

    animate(incoming.querySelector(".copy"), [{ opacity: .58 }, { opacity: 1 }], 320, 85);

    if (name === "locations-qsolid") {
      const start = forward ? aerialFocus(subject) : subject;
      const end = forward ? targetBox : aerialFocus(targetBox);
      const frame = document.createElement("div");
      frame.className = "handoff-outline";
      place(frame, start);
      layer.append(frame);
      fadeOutgoing(790, forward ? "translateY(-6%) scale(1.035)" : "scale(.92)");
      animate(frame, [
        { opacity: 0, transform: "none" },
        { opacity: .9, offset: .18 },
        { opacity: .78, offset: .70 },
        { opacity: 0, transform: align(start, end) },
      ], 910);
      if (forward) {
        animate(incoming.querySelector(".chip"), [
          { transform: "scale(1.45) rotate(-9deg)", opacity: .26 },
          { transform: "none", opacity: 1 },
        ], 700, 120);
      }
    } else if (name === "qsolid-portrait") {
      if (forward) {
        fadeOutgoing(600);
        animate(target, [
          { clipPath: cropTo(targetBox, subject), opacity: .7 },
          { clipPath: "inset(0)", opacity: 1 },
        ], 900, 90);
      } else {
        fadeOutgoing(490);
        movePortrait(outgoing.querySelector("img"), targetBox, 790, .68);
      }
    } else if (name === "portrait-workstation") {
      fadeOutgoing(530);
      if (forward) {
        movePortrait(outgoing.querySelector("img"), targetBox, 900, .66);
        animate(incoming.querySelector(".desk"), [
          { opacity: .32, transform: "translateY(12px)" },
          { opacity: 1, transform: "none" },
        ], 640, 185);
      } else {
        moveFrom(target, subject, 860, 30);
      }
    } else if (forward) {
      fadeOutgoing(580, "scale(.96)");
      incoming.querySelectorAll(".vm").forEach((vmCard, index) => {
        moveFrom(vmCard, subject, 700, 50 + index * 90);
      });
      animate(incoming.querySelector(".connections"), [
        { clipPath: "inset(0 0 100% 0)" },
        { clipPath: "inset(0)" },
      ], 425, 475);
      animate(incoming.querySelector(".virtual-switch"), [{ opacity: 0 }, { opacity: 1 }], 270, 640);
    } else {
      fadeOutgoing(780);
      for (const vmCard of outgoing.querySelectorAll(".vm")) {
        animate(vmCard, [
          { transform: "none", transformOrigin: "top left" },
          { transform: align(box(vmCard, stage), targetBox), transformOrigin: "top left" },
        ], 670);
      }
    }

    Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (active === motion) finish();
    });
  }

  function reset() {
    finish();
    last = undefined;
  }

  return {
    capture,
    play,
    replay: () => play(last),
    reset,
  };
}
