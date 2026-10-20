// A projected vector scene: no assets, WebGL context or animation dependency.
export function createSignalScene(canvas, onProgress) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const ice = "#9acbd1";
  const coral = "#ed927a";
  let width = 0;
  let height = 0;
  let scale = 1;
  let paused = false;
  let visible = true;
  let frame = 0;
  let previousTime = 0;
  let selected = 0;
  let packet = 1;
  let pointer = [0, 0];
  let tilt = [0, 0];
  const names = ["WeChat", "WeCom", "Feishu", "Telegram", "WhatsApp"];
  const lanes = [-170, -85, 0, 85, 170];

  function project([x, y, z = 0]) {
    const angle = .34 + tilt[0] * .06;
    const pitch = .5 + tilt[1] * .035;
    return [
      width * .55 + (x * Math.cos(angle) - y * Math.sin(angle)) * scale,
      height * .46 + (x * Math.sin(angle) + y * Math.cos(angle)) * pitch * scale - z * scale,
    ];
  }

  function polygon(points, fill, stroke = "#375361") {
    ctx.beginPath();
    points.map(project).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .8; ctx.stroke(); }
  }

  function line(points, color, lineWidth = 1) {
    ctx.beginPath();
    points.map(project).forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function box(x, y, w, d, z, h, color, edge = "#45606f") {
    const a = [x, y, z + h], b = [x + w, y, z + h];
    const c = [x + w, y + d, z + h], e = [x, y + d, z + h];
    polygon([e, c, [x + w, y + d, z], [x, y + d, z]], "#142632", edge);
    polygon([b, c, [x + w, y + d, z], [x + w, y, z]], "#1a3240", edge);
    polygon([a, b, c, e], color, edge);
  }

  function label(text, pos, color = "#7795a5", size = 9, align = "left") {
    const [x, y] = project(pos);
    ctx.font = `${size}px "Cascadia Code", Consolas, monospace`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function pathFor(index) {
    const y = lanes[index];
    return [[-275, y, 15], [-165, y, 15], [-85, 0, 15], [35, 0, 15],
      [35, 0, 107], [105, 0, 107], [135, 0, 15], [310, 0, 15]];
  }

  function sample(points, t) {
    const distances = points.slice(1).map((p, i) => Math.hypot(...p.map((v, j) => v - points[i][j])));
    let distance = Math.max(0, Math.min(1, t)) * distances.reduce((a, b) => a + b, 0);
    for (let i = 0; i < distances.length; i++) {
      if (distance <= distances[i] || i === distances.length - 1) {
        const part = distance / distances[i];
        return points[i].map((v, j) => v + (points[i + 1][j] - v) * part);
      }
      distance -= distances[i];
    }
    return points.at(-1);
  }

  function drawBoard() {
    polygon([[-330, -220, 0], [355, -220, 0], [355, 220, 0], [-330, 220, 0]], "#10212b75", null);
  }

  function drawChannels() {
    lanes.forEach((y, i) => {
      const active = selected === i;
      line(pathFor(i).slice(0, 4), active ? "#749fae" : "#314c5c", active ? 1.4 : .8);
      box(-305, y - 18, 55, 36, 3, 12, active ? "#264451" : "#142a36", active ? ice : "#3a5361");
      // A small envelope drawn in the projected plane.
      line([[-291, y - 8, 16], [-265, y - 8, 16], [-265, y + 8, 16], [-291, y + 8, 16], [-291, y - 8, 16], [-278, y + 1, 16], [-265, y - 8, 16]], active ? ice : "#65899c");
      if (width >= 500) label(names[i], [-320, y + 2, 13], active ? "#d2e6ed" : "#7f9dab", 11, "right");
    });
    line([[135, 0, 15], [310, 0, 15]], "#7b9eac", 1.2);
    for (let i = 0; i < 3; i++) {
      box(245 + i * 9, -45 + i * 6, 78, 90, 4 + i * 9, 3, "#203946", "#547684");
    }
    line([[275, -22, 35], [300, -22, 35]], ice, 2);
    line([[275, -10, 35], [307, -10, 35]], "#658999", 1);
    line([[275, 2, 35], [295, 2, 35]], "#658999", 1);
  }

  function drawCore(time) {
    // Three suspended plates make the processing boundary visible in depth.
    box(-35, -72, 140, 144, 3, 12, "#213b49");
    box(-27, -64, 124, 128, 31, 4, "#254655b0", "#547887");
    box(-20, -57, 110, 114, 61, 4, "#244452b0", "#668d9b");
    const glow = packet < 1 ? .3 + Math.sin(time / 260) * .1 : .08;
    ctx.shadowColor = `rgba(154,203,209,${glow})`;
    ctx.shadowBlur = 30 * scale;
    const upper = project([-12, -50, 107]);
    const lower = project([84, 50, 107]);
    const glass = ctx.createLinearGradient(upper[0], upper[1], lower[0], lower[1]);
    glass.addColorStop(0, "#557985");
    glass.addColorStop(.5, "#2d5261");
    glass.addColorStop(1, "#1b3645");
    box(-12, -50, 96, 100, 95, 12, glass, ice);
    ctx.shadowBlur = 0;
    line([[-3, 49, 108], [75, 49, 108]], coral, 2);
    if (packet > .42 && packet < .88) {
      const expansion = (packet - .42) / .46;
      const radius = 85 + expansion * 100;
      const alpha = (1 - expansion) * .45;
      polygon([[35 - radius, -radius, 16], [35 + radius, -radius, 16],
        [35 + radius, radius, 16], [35 - radius, radius, 16]], null, `rgba(154,203,209,${alpha})`);
    }
    // Face drawn in the same projection as the circuit, using the DuDu U-eye motif.
    for (const x of [8, 44]) {
      const points = [];
      for (let i = 0; i <= 20; i++) {
        const angle = i / 20 * Math.PI;
        points.push([x + 11 - Math.cos(angle) * 11, -8 + Math.sin(angle) * 19, 108]);
      }
      line(points, "#e1f0f2", 3 * scale);
    }
    const [lx, ly] = project([35, 0, 149]);
    ctx.fillStyle = "#e4edf1";
    ctx.font = `500 ${Math.max(15, 22 * scale)}px "Bahnschrift", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("DuDu", lx, ly);
    [[-12, -50], [84, -50], [-12, 50], [84, 50]].forEach(([x, y]) => {
      line([[x, y, 20], [x, y, 92]], "#47697655");
    });
  }

  function drawPacket() {
    if (packet >= 1) return;
    const points = pathFor(selected);
    const end = sample(points, packet);
    const trail = Array.from({length: 22}, (_, i) => sample(points, Math.max(0, packet - .1 + i / 21 * .1)));
    ctx.shadowColor = ice;
    ctx.shadowBlur = 15;
    line(trail, "#b6e1e7", 2.3);
    const p = project(end);
    ctx.fillStyle = "#f1fafb";
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw(time = 0) {
    frame = 0;
    const dt = Math.min(time - previousTime, 40);
    previousTime = time;
    tilt = tilt.map((value, i) => value + (pointer[i] - value) * .045);
    if (!paused && packet < 1) {
      packet = Math.min(1, packet + dt / 2300);
      onProgress(packet);
    }
    ctx.clearRect(0, 0, width, height);
    drawBoard();
    drawChannels();
    drawCore(time);
    drawPacket();
    if (!paused && visible && (packet < 1 || tilt.some((v, i) => Math.abs(v - pointer[i]) > .001))) requestDraw();
  }

  function requestDraw() {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width; height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    scale = width / 810;
    if (width < 500) scale = width / 760;
    requestDraw();
  }

  canvas.addEventListener("pointermove", event => {
    if (paused || event.pointerType === "touch") return;
    const rect = canvas.getBoundingClientRect();
    pointer = [(event.clientX - rect.left) / width * 2 - 1, (event.clientY - rect.top) / height * 2 - 1];
    requestDraw();
  });
  canvas.addEventListener("pointerleave", () => { pointer = [0, 0]; requestDraw(); });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { previousTime = performance.now(); requestDraw(); }
    else { cancelAnimationFrame(frame); frame = 0; }
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { previousTime = performance.now(); requestDraw(); }
  });
  resize();

  return {
    send(index) {
      selected = index;
      packet = paused ? 1 : 0;
      previousTime = performance.now();
      onProgress(paused ? 1 : 0);
      requestDraw();
    },
    setPaused(value) {
      paused = value;
      if (value) { pointer = [0, 0]; tilt = [0, 0]; packet = 1; onProgress(1); }
      previousTime = performance.now();
      requestDraw();
    },
    isVisible: () => visible && !document.hidden,
  };
}
