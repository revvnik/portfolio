const ease = "cubic-bezier(.4, .08, .3, 1)";

const handoffs = {
  "slide-2/slide-3": "locations-qsolid",
  "slide-3/slide-4": "qsolid-portrait",
  "slide-4/slide-5": "portrait-workstation",
  "slide-5/slide-6": "workstation-lab",
};

const subjects = {
  "slide-2": ".gallery-model",
  "slide-3": ".chip-core",
  "slide-4": ".portrait img",
  "slide-5": ".computer-screen",
  "slide-6": ".vm",
};

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
  const copies = slides.map(slide => slide.querySelector(".copy"));
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
    if (from < 0 || reducedMotion.matches || !stage.animate) return null;
    const first = slides[Math.min(from, to)].id;
    const second = slides[Math.max(from, to)].id;
    const name = handoffs[`${first}/${second}`];
    if (!name && Math.abs(from - to) !== 1) return null;

    return {
      name: name ?? "crossfade",
      from,
      to,
      plate: box(plates[from], stage),
      copy: box(copies[from], stage),
      subject: name ? box(slides[from].querySelector(subjects[slides[from].id]), stage) : null,
    };
  }

  function play(transition) {
    if (!transition || reducedMotion.matches) return;
    finish();
    const { name, from, to, plate, copy, subject } = transition;
    last = { transition, destination: box(plates[to], stage) };
    const forward = to > from;
    const incoming = slides[to];
    const target = subject ? incoming.querySelector(subjects[incoming.id]) : null;
    const targetBox = target ? box(target, stage) : null;

    const layer = document.createElement("div");
    layer.className = "handoff-layer";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;

    const outgoing = plates[from].cloneNode(true);
    outgoing.classList.add("handoff-outgoing");
    if (slides[from].id === "slide-2" && getComputedStyle(modelLayer).visibility === "hidden") {
      outgoing.classList.add("handoff-poster");
    }
    place(outgoing, plate);
    const outgoingCopy = copies[from].cloneNode(true);
    outgoingCopy.classList.add("handoff-copy");
    outgoingCopy.querySelector("h1, h2").removeAttribute("id");
    place(outgoingCopy, copy);
    layer.append(outgoing, outgoingCopy);
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

    animate(outgoingCopy, [{ opacity: 1 }, { opacity: 0 }], 260);
    animate(copies[to], [{ opacity: 0 }, { opacity: 1 }], 350, 150);

    if (name === "crossfade") {
      fadeOutgoing(620);
    } else if (name === "locations-qsolid") {
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
        fadeOutgoing(835);
        animate(target, [
          { clipPath: cropTo(targetBox, subject), opacity: .7 },
          { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 1 },
        ], 900, 90);
      } else {
        fadeOutgoing(670);
        movePortrait(outgoing.querySelector("img"), targetBox, 790, .68);
      }
    } else if (name === "portrait-workstation") {
      fadeOutgoing(730);
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

    return Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (active === motion) finish();
    });
  }

  function replay() {
    if (!last) return;
    const { transition, destination } = last;
    const current = box(plates[transition.to], stage);
    const scaleX = current.width / destination.width;
    const scaleY = current.height / destination.height;
    const reposition = bounds => ({
      x: current.x + (bounds.x - destination.x) * scaleX,
      y: current.y + (bounds.y - destination.y) * scaleY,
      width: bounds.width * scaleX,
      height: bounds.height * scaleY,
    });
    return play({
      ...transition,
      plate: reposition(transition.plate),
      copy: reposition(transition.copy),
      subject: transition.subject ? reposition(transition.subject) : null,
    });
  }

  function reset() {
    finish();
    last = undefined;
  }

  return { capture, play, replay, reset };
}
