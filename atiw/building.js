const stone = { top: "#aeb9aa", front: "#8d9f96", side: "#778d85", windows: true };
const entrance = { top: "#88998d", front: "#57726b", side: "#667e76", windows: true };
const roof = { top: "#85948b", front: "#687e76", side: "#5d726b" };
const base = { top: "#d5d7c8", front: "#b9beb0", side: "#a9b2a4" };

// Two courtyard wings, the recessed central connector and the low entrance canopy.
const blocks = [
  [-105, 105, -33, 36, -2.8, 0, base],
  [-94, -24, 8, 26, 0, 21, stone],
  [-94, -79, -25, 8, 0, 21, stone],
  [-39, -24, -25, 8, 0, 21, stone],
  [24, 94, 8, 26, 0, 21, stone],
  [24, 39, -25, 8, 0, 21, stone],
  [79, 94, -25, 8, 0, 21, stone],
  [-24, 24, -17, 0, 0, 21, entrance],
  [-24, 24, 0, 19, 0, 7, entrance],
  [-79, -57, 10, 21, 21, 24, roof],
  [-40, -26, -18, 8, 21, 24, roof],
  [27, 42, 9, 21, 21, 24, roof],
  [66, 86, 10, 21, 21, 24, roof],
];

function boxFaces([left, right, back, front, floor, top, material]) {
  const frontLeft = [left, floor, front];
  const frontRight = [right, floor, front];
  const backLeft = [left, floor, back];
  const backRight = [right, floor, back];
  const highFrontLeft = [left, top, front];
  const highFrontRight = [right, top, front];
  const highBackLeft = [left, top, back];
  const highBackRight = [right, top, back];
  const floors = top > 8 ? 5 : 1;

  return [
    { vertices: [frontLeft, frontRight, highFrontRight, highFrontLeft], normal: [0, 0, 1], color: material.front, span: right - left, floors },
    { vertices: [backRight, backLeft, highBackLeft, highBackRight], normal: [0, 0, -1], color: material.front, span: right - left, floors },
    { vertices: [frontRight, backRight, highBackRight, highFrontRight], normal: [1, 0, 0], color: material.side, span: front - back, floors },
    { vertices: [backLeft, frontLeft, highFrontLeft, highBackLeft], normal: [-1, 0, 0], color: material.side, span: front - back, floors },
    { vertices: [highFrontLeft, highFrontRight, highBackRight, highBackLeft], normal: [0, 1, 0], color: material.top },
  ].map(face => ({ ...face, windows: material.windows && Boolean(face.floors) }));
}

const faces = blocks.flatMap(boxFaces);
const glass = ["#344d4b", "#415957", "#506762", "#758e84", "#395653", "#6d8b83"];

function fill(context, points, color) {
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = color;
  context.fill();
}

function paintWindows(context, [bottomLeft, bottomRight, topRight, topLeft], span, floors) {
  const columns = Math.max(2, Math.round(span / 3.2));
  const position = (u, v) => [0, 1].map(axis => {
    const bottom = bottomLeft[axis] + u * (bottomRight[axis] - bottomLeft[axis]);
    const top = topLeft[axis] + u * (topRight[axis] - topLeft[axis]);
    return bottom + v * (top - bottom);
  });

  for (let row = 0; row < floors; row++) {
    const bottom = (row + .11) / floors;
    const top = (row + .87) / floors;
    for (let column = 0; column < columns; column++) {
      const left = (column + .21) / columns;
      const right = (column + (column % 5 === 2 ? .63 : .8)) / columns;
      const color = glass[(column * 5 + row * 2 + Math.floor(column / 4)) % glass.length];
      fill(context, [position(left, bottom), position(right, bottom), position(right, top), position(left, top)], color);
    }
  }
}

export function createBuilding(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const coverAngle = -.38;
  const locationAngle = .46;
  let angle = coverAngle;
  let width = 0;
  let height = 0;
  let frame = 0;

  function draw() {
    if (!width || !height) return;

    const pitch = .44;
    const sinYaw = Math.sin(angle);
    const cosYaw = Math.cos(angle);
    const sinPitch = Math.sin(pitch);
    const cosPitch = Math.cos(pitch);
    const scale = Math.min((width * .92) / 216, (height * .76) / 87);
    const originX = width * .5;
    const originY = height * .53;
    const viewDepth = ([x, y, z]) => (x * sinYaw + z * cosYaw) * cosPitch + y * sinPitch;

    function project([x, y, z]) {
      const horizontal = x * cosYaw - z * sinYaw;
      const vertical = (y - 8) * cosPitch - (x * sinYaw + z * cosYaw) * sinPitch;
      return [originX + horizontal * scale, originY - vertical * scale];
    }

    context.clearRect(0, 0, width, height);
    context.save();
    context.filter = "blur(11px)";
    const shadow = [[-106, -3, 37], [109, -3, 37], [109, -3, -32], [-106, -3, -32]].map(project);
    fill(context, shadow.map(([x, y]) => [x + 5, y + 9]), "#33443e47");
    context.restore();

    const visible = faces
      .filter(face => viewDepth(face.normal) > 0)
      .map(face => ({ ...face, depth: face.vertices.reduce((sum, vertex) => sum + viewDepth(vertex), 0) / 4 }))
      .sort((first, second) => first.depth - second.depth);

    for (const face of visible) {
      const points = face.vertices.map(project);
      fill(context, points, face.color);
      if (face.windows) paintWindows(context, points, face.span, face.floors);
    }
  }

  const resize = new ResizeObserver(([entry]) => {
    width = entry.contentRect.width;
    height = entry.contentRect.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  });
  resize.observe(canvas);

  return {
    turn(isCover, immediate = false) {
      const target = isCover ? coverAngle : locationAngle;
      cancelAnimationFrame(frame);
      if (immediate || motion.matches) {
        angle = target;
        draw();
        return;
      }

      const start = performance.now();
      const initial = angle;
      function tick(now) {
        const progress = Math.min((now - start) / 620, 1);
        angle = initial + (target - initial) * (1 - (1 - progress) ** 3);
        draw();
        if (progress < 1) frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    },
  };
}
