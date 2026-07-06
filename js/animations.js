/**
 * animations.js
 * Scroll-reveal (IntersectionObserver), CSS cloud generation,
 * mobile nav toggle. All motion is transform/opacity and respects
 * prefers-reduced-motion.
 */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ─────────────────────────────────────────────────────────────────────────
// Scroll reveal
// ─────────────────────────────────────────────────────────────────────────

export function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("revealed"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((el) => observer.observe(el));
}

// ─────────────────────────────────────────────────────────────────────────
// Clouds — count and character depend on the weather state
// ─────────────────────────────────────────────────────────────────────────

const CLOUD_COUNTS = { CLEAR: 3, PARTLY_CLOUDY: 6, CLOUDY: 10 };

export function buildClouds(weatherState) {
  const container = document.getElementById("clouds");
  if (!container) return;
  container.innerHTML = "";

  const count = CLOUD_COUNTS[weatherState] ?? CLOUD_COUNTS.PARTLY_CLOUDY;

  for (let i = 0; i < count; i++) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";

    const scale = 0.6 + Math.random() * 1.1;
    const width = 130 * scale;
    const height = 42 * scale;
    const opacity = (0.45 + Math.random() * 0.45).toFixed(2);
    const duration = 70 + Math.random() * 90; // slow drift
    const top = Math.random() * 32; // upper third of the sky

    cloud.style.width = `${width}px`;
    cloud.style.height = `${height}px`;
    cloud.style.top = `${top}%`;
    cloud.style.setProperty("--cloud-o", opacity);
    cloud.style.animationDuration = `${duration}s`;
    cloud.style.animationDelay = `-${Math.random() * duration}s`;

    // 4 overlapping puffs make one cloud
    const puffs = [
      { l: 0, t: 30, w: 45, h: 60 },
      { l: 25, t: 0, w: 50, h: 95 },
      { l: 55, t: 15, w: 45, h: 75 },
      { l: 20, t: 45, w: 70, h: 55 },
    ];
    for (const p of puffs) {
      const puff = document.createElement("div");
      puff.className = "puff";
      puff.style.left = `${p.l}%`;
      puff.style.top = `${p.t}%`;
      puff.style.width = `${p.w}%`;
      puff.style.height = `${p.h}%`;
      cloud.appendChild(puff);
    }

    if (reducedMotion) {
      // Static, scattered placement instead of drift
      cloud.style.left = `${Math.random() * 80}%`;
    }

    container.appendChild(cloud);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Mobile nav
// ─────────────────────────────────────────────────────────────────────────

export function initMobileNav() {
  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-mobile");
  if (!toggle || !menu) return;

  const close = () => {
    menu.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("hidden") === false;
    toggle.setAttribute("aria-expanded", String(open));
  });

  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
