/**
 * canvasEngine.js
 * A single fixed 2D canvas renders everything alive in the scene.
 *
 * WORLD SPACE: fish, the octopus, crabs, sand, seagrass, and coral
 * are anchored to positions in the full scrollable page (the "water column"),
 * not the screen. Scrolling moves the viewport past them — like lowering
 * your head below the waterline at an aquarium. Fish do NOT follow the
 * camera; you descend past fish that stay where they live.
 *
 * Also: stars in the night sky, bubbles, patterned fish (stripes / spots /
 * two-tone), dune sand with pebbles, and glows at night.
 * Respects prefers-reduced-motion, pauses when the tab is hidden,
 * caps devicePixelRatio at 2, and only draws what is on screen.
 */

import { clamp } from "./timeOfDay.js";

const DAY_FISH_COLORS = ["#ffb347", "#ff6b6b", "#4ecdc4", "#ffe66d", "#c084fc", "#60d394", "#f97fb5", "#5eb3fa"];
const NIGHT_FISH_COLORS = ["#5eead4", "#7dd3fc", "#a5b4fc"];
const PATTERNS = ["solid", "stripes", "spots", "twoTone"];
const SEAWEED_COLORS = ["#3e8e5a", "#2f7d4f", "#4da167"];

/* Sand palettes per time of day: [crest (lit), base (shaded)] */
const SAND_COLORS = {
  morning: ["#d3b285", "#7d6544"],
  midday:  ["#dcc094", "#87704e"],
  evening: ["#bd9468", "#6b503a"],
  night:   ["#4a4436", "#1c1812"],
};

let canvas, ctx, w, h, dpr;
let docH = 0;                     // full scrollable page height (world height)
let depth = 0;                    // 0 surface → 1 sea floor
let timeOfDay = "midday";
let reducedMotion = false;
let rafId = null;
let lastT = 0;

let fish = [];
let octopi = [];
let anglers = [];
let birds = [];
let whale = null;                 // rare visitor — see updateDrawWhale
let nextWhaleAt = 0;
let mouseX = -9999, mouseY = -9999;
let crabs = [];
let bubbles = [];
let stars = [];
let seaweeds = [];
let corals = [];
let duneBack, duneFront;
let speckles = [];

// ─────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────

export function initCanvasEngine(el) {
  canvas = el;
  ctx = canvas.getContext("2d");
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  resize();
  window.addEventListener("resize", () => {
    const ow = w, oh = h;
    resize();
    rescaleWorld(ow, oh, document.documentElement.scrollHeight);
    if (reducedMotion) drawFrame(0);
  });
  // Layout settles once images/content load — stretch the world, don't rebuild.
  window.addEventListener("load", () =>
    rescaleWorld(w, h, document.documentElement.scrollHeight)
  );

  document.addEventListener("scene:time", (e) => {
    // This event fires every minute (the sun keeps moving), but the cast
    // only changes when the time BAND changes (e.g. evening → night).
    // Repopulating on every tick teleported everything once a minute.
    if (e.detail.time === timeOfDay) return;
    timeOfDay = e.detail.time;
    populate();
    if (reducedMotion) drawFrame(0);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  timeOfDay = document.documentElement.dataset.time || "midday";
  populate();

  // Subtle cursor awareness: fish keep a polite distance from the pointer.
  if (!reducedMotion) {
    window.addEventListener("pointermove", (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });
    window.addEventListener("pointerleave", () => {
      mouseX = -9999;
      mouseY = -9999;
    });
  }

  // First whale sighting 15–45s in; after that they're rare.
  nextWhaleAt = performance.now() + 15000 + Math.random() * 30000;

  if (reducedMotion) drawFrame(0);
  else start();
}

export function setDepth(p) {
  depth = p;
  if (reducedMotion) drawFrame(0);
}

function start() {
  if (rafId !== null || reducedMotion) return;
  lastT = performance.now();
  rafId = requestAnimationFrame(loop);
}

function stop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

// ─────────────────────────────────────────────────────────────────────────
// Setup / world population
// ─────────────────────────────────────────────────────────────────────────

let isMobile = false;

function resize() {
  w = window.innerWidth;
  h = window.innerHeight;
  isMobile = w < 768;
  // Phones: cap pixel density lower — the single biggest fill-rate win.
  dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function populate() {
  docH = Math.max(document.documentElement.scrollHeight, h * 2);
  const density = clamp(w / 1200, 0.5, 1.3);
  const night = timeOfDay === "night";

  // The inhabited water column (world coordinates)
  const zoneTop = h * 0.95;            // just under the surface
  const zoneBottom = docH - h * 0.32;  // above the sand

  const mob = isMobile ? 0.65 : 1; // lighter populations on phones

  // ── Fish: scattered through the whole column, each with its own look ──
  fish = [];
  const perScreen = (night ? 3.5 : 7) * mob;
  const count = Math.round(clamp(((zoneBottom - zoneTop) / h) * perScreen * density, 8, 42));
  const colors = night ? NIGHT_FISH_COLORS : DAY_FISH_COLORS;
  for (let i = 0; i < count; i++) {
    const worldY = zoneTop + Math.random() * (zoneBottom - zoneTop);
    const color = colors[Math.floor(Math.random() * colors.length)];
    let secondary = colors[Math.floor(Math.random() * colors.length)];
    if (secondary === color) secondary = "#ffffff";
    fish.push({
      x: Math.random() * w,
      worldY,
      targetY: worldY,
      homeY: worldY,
      size: 9 + Math.random() * 14,
      speed: 14 + Math.random() * 18,        // px per SECOND
      speedJitter: 1,
      dir: Math.random() < 0.5 ? -1 : 1,
      color,
      secondary,
      pattern: PATTERNS[Math.floor(Math.random() * PATTERNS.length)],
      spots: Array.from({ length: 5 }, () => ({
        dx: (Math.random() - 0.4) * 1.4,
        dy: (Math.random() - 0.5) * 0.7,
        r: 0.08 + Math.random() * 0.09,
      })),
      finTall: Math.random() < 0.4,          // some fish get a dorsal fin
      phase: Math.random() * Math.PI * 2,
      wanderT: Math.random() * 3000,
    });
  }

  // ── Octopus: a night visitor near the floor ──
  octopi = [];
  if (night) {
    octopi.push({
      x: (0.2 + Math.random() * 0.6) * w,
      worldY: docH - h * 0.28,
      size: 26,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ── Anglerfish: the deepest, darkest band — lure always glowing ──
  anglers = [];
  for (let i = 0; i < 2; i++) {
    anglers.push({
      x: Math.random() * w,
      worldY: docH - h * (0.35 + Math.random() * 0.55),
      size: 18 + Math.random() * 10,
      speed: 7 + Math.random() * 6,          // px/s — an ominous drift
      dir: i % 2 === 0 ? 1 : -1,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ── Birds: gulls gliding across the sky (not at night) ──
  birds = [];
  if (!night) {
    for (let i = 0; i < Math.round(5 * density); i++) {
      birds.push({
        x: Math.random() * w,
        y: (0.08 + Math.random() * 0.42) * h,   // sky band (screen-space)
        size: 7 + Math.random() * 8,
        speed: 18 + Math.random() * 22,
        dir: Math.random() < 0.5 ? -1 : 1,
        flap: 0.7 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // ── Crabs: on the sand, all hours ──
  crabs = [];
  for (let i = 0; i < 3; i++) {
    const baseX = (0.12 + Math.random() * 0.76) * w;
    crabs.push({
      x: baseX,
      baseX,
      patrol: 60 + Math.random() * 70,
      vx: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 8),
      size: 12 + Math.random() * 7,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ── Bubbles (ambient, screen-space) ──
  if (bubbles.length === 0) {
    const n = Math.round(16 * density * mob);
    for (let i = 0; i < n; i++) bubbles.push(makeBubble(true));
  }

  // ── Stars ──
  stars = [];
  for (let i = 0; i < Math.round(90 * density * mob); i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.7,
      r: Math.random() * 1.3 + 0.4,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 1.5,
    });
  }

  // ── Sand dunes ──
  duneBack = {
    base: 64, a1: 16, f1: (Math.PI * 2) / (w * 0.55), p1: Math.random() * 9,
    a2: 7, f2: (Math.PI * 2) / (w * 0.19), p2: Math.random() * 9,
  };
  duneFront = {
    base: 34, a1: 10, f1: (Math.PI * 2) / (w * 0.42), p1: Math.random() * 9,
    a2: 5, f2: (Math.PI * 2) / (w * 0.15), p2: Math.random() * 9,
  };

  speckles = [];
  for (let i = 0; i < Math.round(70 * density * mob); i++) {
    speckles.push({
      x: Math.random() * w,
      frac: Math.random(),
      r: 0.7 + Math.random() * 1.8,
      a: 0.08 + Math.random() * 0.14,
      light: Math.random() < 0.35,
    });
  }

  // ── Seagrass clusters swaying on the dunes ──
  seaweeds = [];
  for (let i = 0; i < Math.round(7 * density * mob); i++) {
    const x = (0.04 + Math.random() * 0.92) * w;
    const blades = [];
    const bladeCount = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < bladeCount; b++) {
      blades.push({
        off: (b - bladeCount / 2) * 7 + (Math.random() - 0.5) * 5,
        len: 34 + Math.random() * 52,
        lean: (Math.random() - 0.5) * 14,
        phase: Math.random() * Math.PI * 2,
        width: 2.5 + Math.random() * 1.8,
        color: SEAWEED_COLORS[Math.floor(Math.random() * SEAWEED_COLORS.length)],
      });
    }
    seaweeds.push({ x, blades, front: Math.random() < 0.6 });
  }

  // ── Coral, here and there ──
  corals = [];
  const coralColors = ["#e07a8b", "#f2a65a", "#9b5de5", "#f4756b"];
  const types = ["branch", "fan", "mound"];
  for (let i = 0; i < Math.round(5 * density); i++) {
    corals.push({
      x: (0.06 + Math.random() * 0.88) * w,
      type: types[Math.floor(Math.random() * types.length)],
      size: 16 + Math.random() * 22,
      color: coralColors[Math.floor(Math.random() * coralColors.length)],
      phase: Math.random() * Math.PI * 2,
      front: Math.random() < 0.5,
    });
  }
}

/**
 * A fish that swims off one edge re-enters the other side refreshed —
 * new cruising depth, speed, and rhythm — so it reads as a different
 * individual arriving, not the same one teleporting.
 */
function refreshFishOnWrap(f) {
  f.homeY = clamp(f.homeY + (Math.random() - 0.5) * 240, h * 0.95, docH - h * 0.3);
  f.worldY = f.homeY;
  f.targetY = f.homeY;
  f.speed = 14 + Math.random() * 18;
  f.phase = Math.random() * Math.PI * 2;
}

/**
 * The page's layout can change (images loading, window resize, mobile URL
 * bar). Instead of regenerating the world — which teleports every creature —
 * we rescale existing positions proportionally. Nobody jumps; the world
 * just stretches quietly underneath them.
 */
function rescaleWorld(oldW, oldH, newDocH) {
  const rx = oldW > 0 ? w / oldW : 1;
  const rh = oldH > 0 ? h / oldH : 1;
  const rd = docH > 0 ? newDocH / docH : 1;
  docH = Math.max(newDocH, h * 2);

  for (const f of fish) { f.x *= rx; f.worldY *= rd; f.homeY *= rd; f.targetY *= rd; }
  for (const a of anglers) { a.x *= rx; a.worldY *= rd; }
  for (const o of octopi) { o.x *= rx; o.worldY *= rd; }
  for (const bd of birds) { bd.x *= rx; bd.y *= rh; }
  for (const c of crabs) { c.x *= rx; c.baseX *= rx; }
  for (const s of stars) { s.x *= rx; s.y *= rh; }
  for (const b of bubbles) { b.x *= rx; b.y *= rh; }
  for (const sw of seaweeds) sw.x *= rx;
  for (const c of corals) c.x *= rx;
  for (const sp of speckles) sp.x *= rx;
  if (whale) { whale.x *= rx; whale.worldY *= rd; }

  // dune wave frequencies are width-relative
  if (duneBack) {
    duneBack.f1 = (Math.PI * 2) / (w * 0.55);
    duneBack.f2 = (Math.PI * 2) / (w * 0.19);
  }
  if (duneFront) {
    duneFront.f1 = (Math.PI * 2) / (w * 0.42);
    duneFront.f2 = (Math.PI * 2) / (w * 0.15);
  }
}

function duneY(d, x, floorScreen) {
  return floorScreen - d.base - d.a1 * Math.sin(x * d.f1 + d.p1) - d.a2 * Math.sin(x * d.f2 + d.p2);
}

function makeBubble(anywhere = false) {
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 10,
    r: 1.5 + Math.random() * 4,
    vy: 14 + Math.random() * 20,
    sway: Math.random() * Math.PI * 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────

function loop(t) {
  const dt = Math.min(t - lastT, 50);
  lastT = t;
  drawFrame(t, dt);
  rafId = requestAnimationFrame(loop);
}

function drawFrame(t, dt = 0) {
  ctx.clearRect(0, 0, w, h);

  // Keep the world sized to the page (content/images can change height).
  // Rescale in place — a full repopulate would teleport every creature.
  const liveDocH = document.documentElement.scrollHeight;
  if (Math.abs(liveDocH - docH) > 8) rescaleWorld(w, h, liveDocH);

  const scrollY = window.scrollY;
  const waterline = h * 0.82 - scrollY + 10;      // water surface on screen
  const floorScreen = docH - scrollY;             // page bottom on screen
  const night = timeOfDay === "night";
  const speedFactor = timeOfDay === "evening" ? 0.55 : night ? 0.75 : 1;
  const sdt = dt * speedFactor;

  if (night && depth < 0.35) drawStars(t, waterline, scrollY);
  for (const bd of birds) updateDrawBird(bd, t, dt, waterline, scrollY);
  updateDrawWhale(t, dt, scrollY, waterline); // far background — behind everything

  // Sea floor stack (only when it's near the viewport)
  if (floorScreen < h + 260) {
    drawSand(floorScreen);
    for (const s of seaweeds) if (!s.front) drawSeaweed(s, t, floorScreen);
    for (const c of corals) if (!c.front) drawCoral(c, t, floorScreen);
    for (const s of seaweeds) if (s.front) drawSeaweed(s, t, floorScreen);
    for (const c of corals) if (c.front) drawCoral(c, t, floorScreen);
    for (const c of crabs) updateDrawCrab(c, t, sdt, night, floorScreen);
  }

  for (const b of bubbles) updateDrawBubble(b, dt, waterline);
  for (const f of fish) updateDrawFish(f, t, sdt, scrollY, waterline, night);
  for (const a of anglers) updateDrawAngler(a, t, sdt, scrollY, waterline);
  for (const o of octopi) updateDrawOctopus(o, t, scrollY, waterline);
}

// ─────────────────────────────────────────────────────────────────────────
// Color helpers (pseudo-3D shading)
// ─────────────────────────────────────────────────────────────────────────

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const g = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function bodyGradient(color, size) {
  const g = ctx.createLinearGradient(0, -size * 0.55, 0, size * 0.55);
  g.addColorStop(0, shade(color, 55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -55));
  return g;
}

// ─────────────────────────────────────────────────────────────────────────
// Sand + decorations
// ─────────────────────────────────────────────────────────────────────────

function drawSand(floorScreen) {
  const [lit, dark] = SAND_COLORS[timeOfDay] || SAND_COLORS.midday;

  drawDune(duneBack, shade(dark, 18), dark, 0.9, floorScreen);
  drawDune(duneFront, lit, shade(dark, 8), 1, floorScreen);

  for (const s of speckles) {
    const top = duneY(duneFront, s.x, floorScreen);
    if (top > h) continue;
    const y = top + 5 + s.frac * Math.max(0, Math.min(h, floorScreen) - top - 8);
    ctx.globalAlpha = s.a;
    ctx.fillStyle = s.light ? "#f5e9cf" : "#241c10";
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawDune(d, crestColor, baseColor, alpha, floorScreen) {
  const step = Math.max(14, w / 70);
  const top = floorScreen - d.base - d.a1 - d.a2;
  if (top > h) return;

  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(0, top, 0, Math.min(floorScreen, h) + 40);
  grad.addColorStop(0, crestColor);
  grad.addColorStop(0.55, baseColor);
  grad.addColorStop(1, shade(baseColor, -20));
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(0, duneY(d, 0, floorScreen));
  for (let x = step; x <= w + step; x += step) ctx.lineTo(x, duneY(d, x, floorScreen));
  ctx.lineTo(w, h + 2);
  ctx.lineTo(0, h + 2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = "rgba(255, 248, 225, 0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, duneY(d, 0, floorScreen));
  for (let x = step; x <= w + step; x += step) ctx.lineTo(x, duneY(d, x, floorScreen));
  ctx.stroke();

  ctx.globalAlpha = 1;
}

function drawSeaweed(sw, t, floorScreen) {
  const d = sw.front ? duneFront : duneBack;
  const baseY = duneY(d, sw.x, floorScreen) + 2;
  if (baseY > h + 60 || baseY < -80) return;

  const night = timeOfDay === "night";
  ctx.lineCap = "round";
  for (const b of sw.blades) {
    const sway = Math.sin(t / 1300 + b.phase) * 7 + b.lean;
    const x0 = sw.x + b.off;
    const color = night ? shade(b.color, -60) : b.color;

    const g = ctx.createLinearGradient(x0, baseY, x0, baseY - b.len);
    g.addColorStop(0, shade(color, -35));
    g.addColorStop(1, shade(color, 25));
    ctx.strokeStyle = g;
    ctx.lineWidth = b.width;
    ctx.globalAlpha = sw.front ? 0.95 : 0.7;

    ctx.beginPath();
    ctx.moveTo(x0, baseY);
    ctx.quadraticCurveTo(x0 + sway * 0.4, baseY - b.len * 0.55, x0 + sway, baseY - b.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawCoral(c, t, floorScreen) {
  const d = c.front ? duneFront : duneBack;
  const baseY = duneY(d, c.x, floorScreen) + 3;
  if (baseY > h + 60 || baseY < -80) return;

  const night = timeOfDay === "night";
  const color = night ? shade(c.color, -70) : c.color;
  ctx.save();
  ctx.translate(c.x, baseY);
  ctx.globalAlpha = c.front ? 0.95 : 0.75;

  // grounding shadow
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 2, c.size * 0.8, c.size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  if (night) drawGlowLocal(0, -c.size * 0.5, c.size * 1.8, c.color, 0.25);

  if (c.type === "branch") {
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineWidth = c.size * 0.2;
    // trunk + branches
    const arms = [
      [0, 0, 0, -c.size],
      [0, -c.size * 0.45, -c.size * 0.5, -c.size * 0.95],
      [0, -c.size * 0.6, c.size * 0.5, -c.size * 1.05],
    ];
    for (const [x1, y1, x2, y2] of arms) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + 3, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
    }
    // polyp tips
    ctx.fillStyle = shade(color, 45);
    for (const [, , x2, y2] of arms) {
      ctx.beginPath();
      ctx.arc(x2, y2, c.size * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (c.type === "fan") {
    // sea fan: filled half-disc + ribs
    const g = ctx.createLinearGradient(0, 0, 0, -c.size);
    g.addColorStop(0, shade(color, -30));
    g.addColorStop(1, shade(color, 30));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, c.size, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -50);
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.7;
    for (let a = -0.85; a <= 0.85; a += 0.28) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(a) * c.size * 0.95, -Math.cos(a) * c.size * 0.95);
      ctx.stroke();
    }
  } else {
    // mound (brain coral): shaded half-ellipse with wavy grooves
    const g = ctx.createLinearGradient(0, -c.size * 0.8, 0, 0);
    g.addColorStop(0, shade(color, 35));
    g.addColorStop(1, shade(color, -35));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.size, c.size * 0.72, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -55);
    ctx.lineWidth = 1;
    ctx.globalAlpha *= 0.6;
    for (let i = 1; i <= 3; i++) {
      const ry = c.size * 0.72 * (i / 3.6);
      ctx.beginPath();
      ctx.ellipse(0, 0, c.size * (i / 3.6), ry, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────

function drawStars(t, waterline, scrollY) {
  const skyAlpha = clamp(1 - depth / 0.35, 0, 1);
  for (const s of stars) {
    // Stars scroll away with the rest of the sky-world.
    const sy = s.y - scrollY;
    if (sy > waterline - 10 || sy < -5) continue;
    const twinkle = 0.5 + 0.5 * Math.sin(t / 900 * s.speed + s.phase);
    ctx.globalAlpha = skyAlpha * (0.3 + 0.7 * twinkle);
    ctx.fillStyle = "#e8f0ff";
    ctx.beginPath();
    ctx.arc(s.x, sy, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Bubbles
// ─────────────────────────────────────────────────────────────────────────

function updateDrawBubble(b, dt, waterline) {
  b.y -= b.vy * (dt / 1000);
  b.x += Math.sin(b.y / 40 + b.sway) * 0.3;
  if (b.y < waterline + 8 || b.y < -10) Object.assign(b, makeBubble());
  if (b.y < waterline) return;

  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Fish — world-anchored, slow wanderers with individual patterns
// ─────────────────────────────────────────────────────────────────────────

function updateDrawFish(f, t, dt, scrollY, waterline, night) {
  // Wander: new cruising depth near home + speed variation, every few seconds
  f.wanderT -= dt;
  if (f.wanderT <= 0) {
    f.targetY = clamp(f.homeY + (Math.random() - 0.5) * 260, h * 0.95, docH - h * 0.3);
    f.speedJitter = 0.7 + Math.random() * 0.6;
    f.wanderT = 2500 + Math.random() * 4500;
  }

  f.x += f.dir * f.speed * f.speedJitter * (dt / 1000);
  f.worldY += (f.targetY - f.worldY) * Math.min(1, dt / 2600);

  // Subtle cursor avoidance — fish politely drift away from the pointer
  const fsy = f.worldY - scrollY;
  const mdx = f.x - mouseX;
  const mdy = fsy - mouseY;
  const md2 = mdx * mdx + mdy * mdy;
  if (md2 < 14400 && md2 > 1) { // within 120px
    const md = Math.sqrt(md2);
    const push = (1 - md / 120) * 46 * (dt / 1000);
    f.x += (mdx / md) * push;
    f.worldY += (mdy / md) * push * 0.8;
    f.targetY += (mdy / md) * push * 0.6;
  }

  // Swim fully off one edge, re-enter the other side as a "new" arrival
  if (f.dir > 0 && f.x > w + 70) { f.x = -70; refreshFishOnWrap(f); }
  if (f.dir < 0 && f.x < -70)    { f.x = w + 70; refreshFishOnWrap(f); }

  const y = f.worldY - scrollY + Math.sin(t / 1100 + f.phase) * 3;
  if (y < -40 || y > h + 40) return;             // off screen
  if (y < waterline + f.size + 26) return;       // never above the surface

  if (night) drawGlow(f.x, y, f.size * 2.4, f.color, 0.35);

  const s = f.size;
  ctx.save();
  ctx.translate(f.x, y);
  ctx.scale(f.dir, 1);
  ctx.rotate(clamp((f.targetY - f.worldY) / 500, -0.2, 0.2));
  // swimming undulation — a soft horizontal shear bends the whole body
  const flex = Math.sin(t / 240 + f.phase) * 0.07;
  ctx.transform(1, 0, flex, 1, 0, 0);
  ctx.globalAlpha = 0.95;

  // fusiform body outline (shared by fill and pattern clipping)
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.bezierCurveTo(s * 0.6, -s * 0.55, -s * 0.35, -s * 0.5, -s * 0.8, -s * 0.12);
    ctx.lineTo(-s * 0.8, s * 0.12);
    ctx.bezierCurveTo(-s * 0.35, s * 0.5, s * 0.6, s * 0.55, s, 0);
    ctx.closePath();
  };

  // caudal (tail) fin — forked, wagging; drawn first so the body overlaps it
  const wag = Math.sin(t / 240 + f.phase + 0.9) * s * 0.28;
  ctx.fillStyle = shade(f.color, -35);
  ctx.beginPath();
  ctx.moveTo(-s * 0.72, 0);
  ctx.quadraticCurveTo(-s * 1.05, -s * 0.1 + wag * 0.4, -s * 1.45, -s * 0.5 + wag);
  ctx.quadraticCurveTo(-s * 1.1, wag * 0.2, -s * 1.45, s * 0.5 + wag);
  ctx.quadraticCurveTo(-s * 1.05, s * 0.1 + wag * 0.4, -s * 0.72, 0);
  ctx.closePath();
  ctx.fill();

  // dorsal fin — curved membrane with a slight sway
  const finH = f.finTall ? 0.9 : 0.62;
  const finSway = Math.sin(t / 380 + f.phase) * s * 0.06;
  ctx.fillStyle = shade(f.color, -40);
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, -s * 0.38);
  ctx.quadraticCurveTo(-s * 0.05 + finSway, -s * finH, s * 0.3, -s * 0.4);
  ctx.closePath();
  ctx.fill();

  // pelvic fin under the belly
  ctx.beginPath();
  ctx.moveTo(s * 0.05, s * 0.4);
  ctx.quadraticCurveTo(-s * 0.05, s * 0.62, -s * 0.28, s * 0.42);
  ctx.closePath();
  ctx.fill();

  // body — countershaded like a real fish: dark back, pale belly
  const cg = ctx.createLinearGradient(0, -s * 0.5, 0, s * 0.5);
  cg.addColorStop(0, shade(f.color, -45));
  cg.addColorStop(0.45, f.color);
  cg.addColorStop(1, shade(f.color, 70));
  ctx.fillStyle = cg;
  bodyPath();
  ctx.fill();

  // pattern, clipped to the body
  if (f.pattern !== "solid") {
    ctx.save();
    bodyPath();
    ctx.clip();
    ctx.fillStyle = f.secondary;
    if (f.pattern === "stripes") {
      ctx.globalAlpha = 0.55;
      for (let i = -1; i <= 1; i++) {
        ctx.save();
        ctx.rotate(0.15);
        ctx.fillRect(i * f.size * 0.42 - f.size * 0.07, -f.size * 0.6, f.size * 0.15, f.size * 1.2);
        ctx.restore();
      }
    } else if (f.pattern === "spots") {
      ctx.globalAlpha = 0.6;
      for (const s of f.spots) {
        ctx.beginPath();
        ctx.arc(s.dx * f.size, s.dy * f.size, s.r * f.size * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (f.pattern === "twoTone") {
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-f.size, 0, f.size * 2, f.size); // darker/lighter belly half
    }
    ctx.restore();
    ctx.globalAlpha = 0.95;
  }

  // top highlight (specular glint)
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(s * 0.15, -s * 0.24, s * 0.5, s * 0.12, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.95;

  // fine details, clipped inside the body
  ctx.save();
  bodyPath();
  ctx.clip();
  if (s > 13 && !isMobile) {
    // scale crescents on bigger fish (skipped on phones — invisible anyway)
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(s * (0.3 - i * 0.32), 0, s * 0.3, -0.85, 0.85);
      ctx.stroke();
    }
  }
  // lateral line
  ctx.strokeStyle = "rgba(8,22,36,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.55, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.1, s * 0.06, -s * 0.75, 0);
  ctx.stroke();
  // gill cover
  ctx.strokeStyle = "rgba(8,22,36,0.35)";
  ctx.lineWidth = Math.max(1, s * 0.05);
  ctx.beginPath();
  ctx.arc(s * 0.42, 0, s * 0.3, -1.2, 1.2);
  ctx.stroke();
  ctx.restore();

  // pectoral fin — visibly rowing
  const flap = Math.sin(t / 320 + f.phase) * 0.35;
  ctx.save();
  ctx.translate(s * 0.22, s * 0.08);
  ctx.rotate(0.55 + flap);
  ctx.fillStyle = shade(f.color, -30);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(s * 0.34, s * 0.1, s * 0.44, s * 0.36);
  ctx.quadraticCurveTo(s * 0.16, s * 0.32, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 0.95;

  // eye — iris ring, pupil, catchlight
  ctx.fillStyle = "#e8eef4";
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.1, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1826";
  ctx.beginPath();
  ctx.arc(s * 0.57, -s * 0.1, s * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.beginPath();
  ctx.arc(s * 0.59, -s * 0.13, s * 0.022, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Whale — a rare, huge silhouette passing in the far haze
// ─────────────────────────────────────────────────────────────────────────

function updateDrawWhale(t, dt, scrollY, waterline) {
  if (!whale) {
    if (reducedMotion || t < nextWhaleAt) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const size = 200 + Math.random() * 120;
    whale = {
      dir,
      size,
      x: dir > 0 ? -size * 1.6 : w + size * 1.6,
      worldY: docH * (0.32 + Math.random() * 0.28),
      speed: 34 + Math.random() * 14,     // slow, unhurried
      phase: Math.random() * Math.PI * 2,
    };
  }

  whale.x += whale.dir * whale.speed * (dt / 1000);
  const gone = whale.dir > 0
    ? whale.x > w + whale.size * 1.7
    : whale.x < -whale.size * 1.7;
  if (gone) {
    whale = null;
    nextWhaleAt = t + 90000 + Math.random() * 120000; // next in 1.5–3.5 min
    return;
  }

  const y = whale.worldY - scrollY + Math.sin(t / 2600 + whale.phase) * 10;
  if (y < -whale.size || y > h + whale.size) return;
  if (y < waterline + whale.size * 0.4) return;

  const b = whale.size;
  const color = timeOfDay === "night" ? "#0d1b2c" : "#16344f";
  const wagW = Math.sin(t / 1700 + whale.phase) * b * 0.05;

  ctx.save();
  ctx.translate(whale.x, y);
  ctx.scale(whale.dir, 1);
  ctx.globalAlpha = 0.22;               // distant — half-lost in the haze
  ctx.fillStyle = color;

  // body
  ctx.beginPath();
  ctx.moveTo(b, 0);
  ctx.bezierCurveTo(b * 0.55, -b * 0.3, -b * 0.35, -b * 0.26, -b * 0.92, -b * 0.04);
  ctx.lineTo(-b * 0.95, 0);
  ctx.bezierCurveTo(-b * 0.3, b * 0.32, b * 0.5, b * 0.36, b, 0);
  ctx.closePath();
  ctx.fill();

  // fluke
  ctx.beginPath();
  ctx.moveTo(-b * 0.92, 0);
  ctx.quadraticCurveTo(-b * 1.05, -b * 0.08 + wagW, -b * 1.25, -b * 0.22 + wagW);
  ctx.quadraticCurveTo(-b * 1.05, wagW, -b * 1.25, b * 0.2 + wagW);
  ctx.quadraticCurveTo(-b * 1.02, b * 0.06, -b * 0.92, 0);
  ctx.closePath();
  ctx.fill();

  // pectoral flipper
  ctx.beginPath();
  ctx.moveTo(b * 0.25, b * 0.12);
  ctx.quadraticCurveTo(b * 0.05, b * 0.5, -b * 0.2, b * 0.55);
  ctx.quadraticCurveTo(b * 0.05, b * 0.28, b * 0.25, b * 0.12);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Birds — gull silhouettes gliding over the water (sky only)
// ─────────────────────────────────────────────────────────────────────────

function updateDrawBird(bd, t, dt, waterline, scrollY) {
  // Birds belong to the sky: fade out as you submerge
  const alpha = clamp(1 - depth / 0.25, 0, 1);
  if (alpha <= 0.01) return;

  bd.x += bd.dir * bd.speed * (dt / 1000);
  if (bd.dir > 0 && bd.x > w + 40) bd.x = -40;
  if (bd.dir < 0 && bd.x < -40) bd.x = w + 40;

  // World-anchored: the flock stays over the surface and scrolls away with it
  const y = bd.y - scrollY + Math.sin(t / 1600 + bd.phase) * 8;
  if (y > waterline - 30 || y < -30) return; // never below the surface

  const flap = Math.sin((t / 190) * bd.flap + bd.phase) * bd.size * 0.55;
  const isEvening = timeOfDay === "evening";

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  ctx.strokeStyle = isEvening ? "rgba(45,25,40,0.9)" : "rgba(30,41,59,0.85)";
  ctx.lineWidth = Math.max(1.4, bd.size * 0.16);
  ctx.lineCap = "round";
  ctx.translate(bd.x, y);
  ctx.scale(bd.dir, 1);

  // classic two-arc gull: wings lift and dip with the flap
  ctx.beginPath();
  ctx.moveTo(-bd.size, -flap * 0.35);
  ctx.quadraticCurveTo(-bd.size * 0.45, -flap, 0, 0);
  ctx.quadraticCurveTo(bd.size * 0.45, -flap, bd.size, -flap * 0.35);
  ctx.stroke();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Anglerfish — deep-water resident with a glowing lure
// ─────────────────────────────────────────────────────────────────────────

function updateDrawAngler(a, t, dt, scrollY, waterline) {
  a.x += a.dir * a.speed * (dt / 1000);
  if (a.dir > 0 && a.x > w + 80) a.x = -80;
  if (a.dir < 0 && a.x < -80) a.x = w + 80;

  const y = a.worldY - scrollY + Math.sin(t / 1900 + a.phase) * 10;
  if (y < -60 || y > h + 60) return;
  if (y < waterline + a.size) return;

  const s = a.size;
  // lure position in world (for the glow, drawn before the body)
  const lureX = a.x + a.dir * s * 1.05;
  const lureY = y - s * 0.85;
  const pulse = 0.75 + 0.25 * Math.sin(t / 480 + a.phase);
  drawGlow(lureX, lureY, s * 1.6 * pulse, "#aef6ff", 0.45 * pulse);

  ctx.save();
  ctx.translate(a.x, y);
  ctx.scale(a.dir, 1);
  ctx.globalAlpha = 0.95;

  // body — a dark, bulky presence
  ctx.fillStyle = bodyGradient("#33445c", s);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.68, 0, 0, Math.PI * 2);
  ctx.fill();

  // tail
  const wag = Math.sin(t / 500 + a.phase) * s * 0.15;
  ctx.fillStyle = shade("#33445c", -25);
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.lineTo(-s * 1.35, -s * 0.4 + wag);
  ctx.lineTo(-s * 1.35, s * 0.4 + wag);
  ctx.closePath();
  ctx.fill();

  // gaping lower jaw
  ctx.fillStyle = "#101c2a";
  ctx.beginPath();
  ctx.moveTo(s * 0.92, -s * 0.02);
  ctx.quadraticCurveTo(s * 0.55, s * 0.5, s * 0.05, s * 0.42);
  ctx.quadraticCurveTo(s * 0.5, s * 0.16, s * 0.92, -s * 0.02);
  ctx.closePath();
  ctx.fill();

  // needle teeth along the jaw
  ctx.fillStyle = "#e8f4ff";
  for (let i = 0; i < 4; i++) {
    const tx = s * (0.78 - i * 0.18);
    const ty = s * (0.05 + i * 0.08);
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - s * 0.05, ty + s * 0.16);
    ctx.lineTo(tx - s * 0.1, ty + s * 0.02);
    ctx.closePath();
    ctx.fill();
  }

  // lure stalk arcing forward over the head + glowing bulb
  ctx.strokeStyle = shade("#33445c", 30);
  ctx.lineWidth = Math.max(1.2, s * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s * 0.15, -s * 0.55);
  ctx.quadraticCurveTo(s * 0.55, -s * 1.15, s * 1.05, -s * 0.85);
  ctx.stroke();
  const bulb = ctx.createRadialGradient(s * 1.05, -s * 0.85, 0, s * 1.05, -s * 0.85, s * 0.16);
  bulb.addColorStop(0, "#ffffff");
  bulb.addColorStop(1, "#7de8ff");
  ctx.fillStyle = bulb;
  ctx.beginPath();
  ctx.arc(s * 1.05, -s * 0.85, s * 0.15 * pulse + s * 0.06, 0, Math.PI * 2);
  ctx.fill();

  // small pale eye
  ctx.fillStyle = "#b9cde0";
  ctx.beginPath();
  ctx.arc(s * 0.45, -s * 0.2, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0b1420";
  ctx.beginPath();
  ctx.arc(s * 0.47, -s * 0.2, s * 0.045, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Octopus (night, deep, world-anchored)
// ─────────────────────────────────────────────────────────────────────────

function updateDrawOctopus(o, t, scrollY, waterline) {
  const y = o.worldY - scrollY + Math.sin(t / 1400 + o.phase) * 8;
  if (y < -80 || y > h + 80) return;
  if (y < waterline + o.size) return;

  drawGlow(o.x, y, o.size * 3, "#c084fc", 0.4);

  ctx.save();
  ctx.translate(o.x, y);
  ctx.globalAlpha = 0.92;

  ctx.fillStyle = bodyGradient("#9d6bce", o.size);
  ctx.beginPath();
  ctx.ellipse(0, -o.size * 0.3, o.size * 0.75, o.size * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shade("#9d6bce", -25);
  ctx.lineWidth = o.size * 0.18;
  ctx.lineCap = "round";
  for (let i = 0; i < 6; i++) {
    const spread = (i - 2.5) * o.size * 0.32;
    const sway = Math.sin(t / 600 + o.phase + i) * o.size * 0.3;
    ctx.beginPath();
    ctx.moveTo(spread * 0.5, o.size * 0.3);
    ctx.quadraticCurveTo(spread, o.size * 0.85, spread + sway, o.size * 1.25);
    ctx.stroke();
  }

  ctx.fillStyle = "#f5f3ff";
  for (const dx of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.arc(dx * o.size, -o.size * 0.35, o.size * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#1e1b4b";
  for (const dx of [-0.28, 0.28]) {
    ctx.beginPath();
    ctx.arc(dx * o.size, -o.size * 0.33, o.size * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Crab — patrols the front dune day and night
// ─────────────────────────────────────────────────────────────────────────

function updateDrawCrab(c, t, dt, night, floorScreen) {
  c.x += c.vx * (dt / 1000);
  if (c.x > c.baseX + c.patrol) { c.x = c.baseX + c.patrol; c.vx = -Math.abs(c.vx); }
  if (c.x < c.baseX - c.patrol) { c.x = c.baseX - c.patrol; c.vx = Math.abs(c.vx); }

  const y = duneY(duneFront, c.x, floorScreen) - c.size * 0.45;
  if (y > h + 60 || y < -60) return;

  const legLift = Math.sin(t / 200 + c.phase) * 2.2;
  const crabColor = night ? "#b35c33" : "#d9764a";

  if (night) drawGlow(c.x, y, c.size * 2.6, "#fb923c", 0.35);

  ctx.save();
  ctx.translate(c.x, y);
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, c.size * 0.55, c.size * 1.3, c.size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = shade(crabColor, -30);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(side * c.size * 0.6, 0);
      ctx.lineTo(side * c.size * (1.1 + i * 0.25), c.size * 0.5 + (i % 2 ? legLift : -legLift));
      ctx.stroke();
    }
  }

  ctx.fillStyle = bodyGradient(crabColor, c.size * 1.2);
  ctx.beginPath();
  ctx.ellipse(0, 0, c.size, c.size * 0.62, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(-c.size * 0.2, -c.size * 0.25, c.size * 0.45, c.size * 0.16, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.95;

  ctx.fillStyle = shade(crabColor, -15);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * c.size * 1.15, -c.size * 0.42, c.size * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = shade(crabColor, -40);
  ctx.lineWidth = 1.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * c.size * 0.3, -c.size * 0.5);
    ctx.lineTo(side * c.size * 0.35, -c.size * 0.75);
    ctx.stroke();
  }
  ctx.fillStyle = "#1c1917";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * c.size * 0.35, -c.size * 0.78, c.size * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Glow helpers (radial gradient — cheaper than shadowBlur)
// ─────────────────────────────────────────────────────────────────────────

function drawGlow(x, y, radius, color, alpha) {
  if (alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Same, but in a translated (local) coordinate space. */
function drawGlowLocal(x, y, radius, color, alpha) {
  const prev = ctx.globalAlpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = prev;
}
