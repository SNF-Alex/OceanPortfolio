/**
 * lightingEngine.js
 * Applies time-of-day + weather to the DOM (via data attributes → CSS vars)
 * and drives the scroll-based descent: crossfading depth layers, fading the
 * sun/rays/shimmer with depth, and reporting depth to subscribers
 * (canvas engine, depth gauge).
 *
 * Scroll work is rAF-throttled and touches ONLY opacity/transform.
 */

import { getTimeOfDay, getCelestialPosition, clamp, msToNextMinute } from "./timeOfDay.js";

const els = {};
const depthListeners = [];
let currentWeather = "PARTLY_CLOUDY";
let celestial = { el: null, px: 0, py: 0 }; // active sun/moon base position
let cursorNX = 0, cursorNY = 0;             // normalized cursor (-1 … 1)
let requestUpdate = null;                   // rAF-throttled scene refresh

export function initLighting() {
  els.sky = document.querySelector(".layer-sky");
  els.surface = document.querySelector(".layer-surface");
  els.mid = document.querySelector(".layer-mid");
  els.rays = document.getElementById("rays");
  els.shimmer = document.getElementById("shimmer");
  els.floorGlow = document.getElementById("floor-glow");
  els.sun = document.getElementById("sun");
  els.moon = document.getElementById("moon");
  els.gauge = document.getElementById("depth-value");
  els.water = document.getElementById("water-body");
  els.clouds = document.getElementById("clouds");

  applyTimeOfDay();
  scheduleMinuteTick();
  initScrollDriver();

  // Very subtle head-movement parallax: the sky shifts a few pixels
  // toward the cursor, as if you leaned to look. Disabled for reduced motion.
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.addEventListener("pointermove", (e) => {
      cursorNX = (e.clientX / window.innerWidth - 0.5) * 2;
      cursorNY = (e.clientY / window.innerHeight - 0.5) * 2;
      if (requestUpdate) requestUpdate();
    }, { passive: true });
  }
}

/** Subscribe to depth changes (0 = surface, 1 = deepest). */
export function onDepthChange(fn) {
  depthListeners.push(fn);
}

/** Current time-of-day applied to the scene. */
export function getAppliedTime() {
  return document.documentElement.dataset.time;
}

// ─────────────────────────────────────────────────────────────────────────
// Time of day + celestial positioning
// ─────────────────────────────────────────────────────────────────────────

export function applyTimeOfDay(date = new Date()) {
  const time = getTimeOfDay(date.getHours());
  document.documentElement.dataset.time = time;

  const { x, y, body } = getCelestialPosition(date);
  const el = body === "moon" ? els.moon : els.sun;
  positionCelestial(el, x, y);

  document.dispatchEvent(new CustomEvent("scene:time", { detail: { time } }));
}

function positionCelestial(el, x, y) {
  if (!el) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  // x sweeps 6% → 94% of width; y arcs between 8% (horizon) and 42% height.
  const px = (0.06 + x * 0.88) * w - 45;
  const py = (0.42 - y * 0.34) * h;
  celestial = { el, px, py };
  // Positioned in the document-anchored #world layer — scrolls away natively.
  el.style.transform = `translate(${px}px, ${py}px)`;
}

// ─────────────────────────────────────────────────────────────────────────
// Weather
// ─────────────────────────────────────────────────────────────────────────

export function applyWeather(weather) {
  currentWeather = weather.state;
  document.documentElement.dataset.weather = weather.state;
  document.dispatchEvent(new CustomEvent("scene:weather", { detail: weather }));
}

export function getAppliedWeather() {
  return currentWeather;
}

// ─────────────────────────────────────────────────────────────────────────
// Scroll-driven descent
// ─────────────────────────────────────────────────────────────────────────

function initScrollDriver() {
  let ticking = false;
  let paletteKey = "";
  let palette = { sky: "#4aa8e8", surface: "#1e7fb8", mid: "#0a4a78", deep: "#041f38", glow: 0 };
  const themeMeta = document.getElementById("theme-color");

  const update = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const p = clamp(window.scrollY / max, 0, 1);

    // Re-read palette colors only when time/weather actually changes —
    // getComputedStyle on every scroll frame is a mobile performance tax.
    const key = `${doc.dataset.time}|${doc.dataset.weather}`;
    if (key !== paletteKey) {
      paletteKey = key;
      const cs = getComputedStyle(doc);
      palette = {
        sky: cs.getPropertyValue("--sky-top").trim(),
        surface: cs.getPropertyValue("--surface-top").trim(),
        mid: cs.getPropertyValue("--mid-top").trim(),
        deep: cs.getPropertyValue("--deep-top").trim(),
        glow: parseFloat(cs.getPropertyValue("--floor-glow-opacity")) || 0,
      };
    }

    // Tint the mobile browser UI (address bar) to match the current depth,
    // so the "sky" doesn't linger at the top of the phone screen underwater.
    const uiColor = p < 0.12 ? palette.sky : p < 0.4 ? palette.surface
      : p < 0.7 ? palette.mid : palette.deep;
    if (themeMeta && themeMeta.content !== uiColor) themeMeta.content = uiColor;

    // Crossfade stacked layers (deep is the base and always visible):
    // sky fades out over 0 → 0.30, surface over 0.30 → 0.60, mid over 0.60 → 0.92.
    els.sky.style.opacity = fadeOut(p, 0.0, 0.3);
    els.surface.style.opacity = fadeOut(p, 0.3, 0.6);
    els.mid.style.opacity = fadeOut(p, 0.6, 0.92);

    // Sky, water surface, and rays are all document-anchored now — native
    // scrolling moves them in perfect sync (no JS = no mobile jitter).
    // JS only handles the cursor "lean" and depth-based opacity fades.
    if (els.clouds) {
      els.clouds.style.transform =
        `translate(${cursorNX * -10}px, ${cursorNY * -6}px)`;
    }
    if (celestial.el) {
      celestial.el.style.transform =
        `translate(${celestial.px + cursorNX * -4}px, ` +
        `${celestial.py + cursorNY * -2.5}px)`;
    }

    // Water surface: once you're fully submerged it fades away and the
    // underwater layer stack takes over (same colors — seamless).
    if (els.water) els.water.style.opacity = fadeOut(p, 0.3, 0.45);

    // Light rays: pour down from the waterline, gone by mid-water.
    els.rays.style.opacity = fadeOut(p, 0.28, 0.6);

    // Surface shimmer: only at the very top.
    els.shimmer.style.opacity = fadeOut(p, 0.0, 0.18);

    // Sea-floor glow: appears near the bottom, strength set by time (cached).
    els.floorGlow.style.opacity = fadeIn(p, 0.72, 0.95) * palette.glow;

    // Depth gauge: 0 → 300 ft.
    if (els.gauge) els.gauge.textContent = `${Math.round(p * 300)} ft`;

    for (const fn of depthListeners) fn(p);
  };

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  requestUpdate = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    applyTimeOfDay();
    onScroll();
  });
  update();
}

/** 1 before `from`, 0 after `to`, linear between. */
function fadeOut(p, from, to) {
  return 1 - clamp((p - from) / (to - from), 0, 1);
}

/** 0 before `from`, 1 after `to`, linear between. */
function fadeIn(p, from, to) {
  return clamp((p - from) / (to - from), 0, 1);
}

// ─────────────────────────────────────────────────────────────────────────
// Real-time updates (sun keeps moving while the page is open)
// ─────────────────────────────────────────────────────────────────────────

function scheduleMinuteTick() {
  setTimeout(() => {
    applyTimeOfDay();
    scheduleMinuteTick();
  }, msToNextMinute());
}
