/**
 * main.js — entry point.
 * Boot order:
 *   1. Render portfolio content from data/portfolio.json
 *   2. Apply time-of-day lighting immediately (never blocked by network)
 *   3. Fetch weather in the background; scene updates when it arrives
 *   4. Start canvas life, scroll driver, reveals, nav
 */

import { getTimeOfDay, getGreeting } from "./timeOfDay.js";
import { initLighting, applyWeather, onDepthChange } from "./lightingEngine.js";
import { startWeatherUpdates } from "./weatherSystem.js";
import { initCanvasEngine, setDepth } from "./canvasEngine.js";
import { initScrollReveal, buildClouds, initMobileNav } from "./animations.js";

const $ = (sel) => document.querySelector(sel);

async function boot() {
  // 1 ─ Content
  const data = await loadPortfolio();
  if (data) renderContent(data);

  // 2 ─ Scene (time-of-day works with zero network)
  initLighting();
  initCanvasEngine(document.getElementById("ocean-canvas"));
  onDepthChange(setDepth);
  buildClouds(document.documentElement.dataset.weather);

  // 3 ─ Weather (fail-safe: always resolves, fallback = PARTLY_CLOUDY)
  startWeatherUpdates((weather) => {
    applyWeather(weather);
    buildClouds(weather.state);
    const status = $("#weather-status");
    if (status) {
      status.textContent =
        weather.source === "api"
          ? `Live weather: ${weather.description}`
          : "Weather: partly cloudy (offline default)";
    }
  });

  // 4 ─ UI behaviors
  initScrollReveal();
  initMobileNav();
  $("#year").textContent = new Date().getFullYear();

  // Re-render greeting if the time-of-day changes while the page is open
  document.addEventListener("scene:time", (e) => {
    const el = $("#hero-time-greeting");
    if (el) el.textContent = getGreeting(e.detail.time);
  });
  const greetEl = $("#hero-time-greeting");
  if (greetEl) greetEl.textContent = getGreeting(getTimeOfDay());
}

// ─────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────

async function loadPortfolio() {
  try {
    const res = await fetch("data/portfolio.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(
      "[portfolio] Could not load data/portfolio.json. " +
        "Serve the site over HTTP (e.g. VS Code Live Server) — " +
        "fetch() is blocked on file:// URLs.",
      err
    );
    const grid = $("#projects-grid");
    if (grid) {
      grid.innerHTML =
        '<p class="glass rounded-2xl p-6 text-white/90">' +
        "Portfolio data failed to load. Run this site from a local server " +
        "(see README) rather than opening index.html directly.</p>";
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────

function renderContent(data) {
  document.title = `${data.identity.name} — Ocean Descent Portfolio`;

  // Hero
  $("#hero-greeting").textContent = data.hero.greeting;
  $("#hero-roles").textContent = data.identity.roles.join("  ·  ");
  $("#hero-summary").textContent = data.hero.summary;
  setImageWithFallback($("#hero-avatar"), data.identity.profileImage, data.identity.profileImageRemote);

  $("#hero-socials").append(
    socialLink(data.contact.github, "GitHub", iconGitHub()),
    socialLink(data.contact.linkedin, "LinkedIn", iconLinkedIn())
  );

  // About
  const about = $("#about-text");
  for (const para of data.about) {
    const p = document.createElement("p");
    p.textContent = para;
    about.appendChild(p);
  }

  // Projects
  const projects = $("#projects-grid");
  data.projects.forEach((proj, i) => projects.appendChild(projectCard(proj, i)));

  // Certifications
  const certs = $("#certs-grid");
  for (const cert of data.certifications) certs.appendChild(certCard(cert));

  // Skills
  const skills = $("#skills-grid");
  for (const [category, items] of Object.entries(data.skills)) {
    skills.appendChild(skillCard(category, items));
  }

  // Contact
  $("#contact-intro").textContent = data.contact.intro;
  const links = $("#contact-links");
  links.append(
    contactItem(`mailto:${data.contact.email}`, data.contact.email, "Email"),
    contactItem(null, data.contact.location, "Location"),
    contactItem(data.contact.github, "GitHub — SNF-Alex", "GitHub"),
    contactItem(data.contact.linkedin, "LinkedIn — Alexander Pace", "LinkedIn")
  );
}

function projectCard(proj, index) {
  const card = document.createElement("article");
  card.className = "card glass reveal";

  const img = document.createElement("img");
  img.alt = `${proj.title} preview`;
  img.loading = "lazy";
  img.decoding = "async";
  setImageWithFallback(img, proj.image, proj.imageRemote);

  const body = document.createElement("div");
  body.className = "p-5";

  const h = document.createElement("h3");
  h.className = "text-lg font-bold text-white";
  h.textContent = proj.title;

  const desc = document.createElement("p");
  desc.className = "mt-2 text-sm leading-relaxed text-white/85";
  desc.textContent = proj.description;

  const chips = document.createElement("div");
  chips.className = "mt-3 flex flex-wrap gap-2";
  for (const tech of proj.tech) {
    const chip = document.createElement("span");
    chip.className = "tech-chip";
    chip.textContent = tech;
    chips.appendChild(chip);
  }

  const link = document.createElement("a");
  link.href = proj.link;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "mt-4 inline-flex items-center gap-1 text-sm font-semibold text-cyan-300 hover:text-cyan-200";
  link.textContent = "Visit project ↗";
  link.setAttribute("aria-label", `Visit ${proj.title} (opens in new tab)`);

  body.append(h, desc, chips, link);
  card.append(img, body);
  card.style.transitionDelay = `${Math.min(index * 70, 350)}ms`;
  return card;
}

function certCard(cert) {
  const card = document.createElement("article");
  card.className = "card glass reveal";

  const img = document.createElement("img");
  img.alt = cert.title;
  img.loading = "lazy";
  img.decoding = "async";
  setImageWithFallback(img, cert.image, cert.imageRemote);

  const body = document.createElement("div");
  body.className = "p-5";
  const h = document.createElement("h4");
  h.className = "text-base font-bold text-white";
  h.textContent = cert.title;
  const p = document.createElement("p");
  p.className = "mt-1 text-sm text-white/80";
  p.textContent = `${cert.detail} · ${cert.year}`;
  body.append(h, p);

  card.append(img, body);
  return card;
}

function skillCard(category, items) {
  const card = document.createElement("div");
  card.className = "glass reveal rounded-3xl p-6";

  const h = document.createElement("h3");
  h.className = "text-base font-bold text-cyan-200";
  h.textContent = category;

  const list = document.createElement("ul");
  list.className = "mt-4 flex flex-wrap gap-2";
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "tech-chip";
    li.textContent = item;
    list.appendChild(li);
  }

  card.append(h, list);
  return card;
}

function contactItem(href, label, kind) {
  const el = document.createElement(href ? "a" : "div");
  el.className = "contact-item";
  if (href) {
    el.href = href;
    if (href.startsWith("http")) {
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
  }
  const tag = document.createElement("span");
  tag.className = "text-xs font-bold uppercase tracking-wider text-cyan-300";
  tag.textContent = kind;
  const text = document.createElement("span");
  text.textContent = label;
  el.append(tag, text);
  return el;
}

function socialLink(href, label, svg) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.setAttribute("aria-label", `${label} (opens in new tab)`);
  a.className =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 " +
    "text-white transition-transform hover:-translate-y-0.5";
  a.innerHTML = svg;
  return a;
}

/** Try the local /assets copy first; fall back to the live-site URL. */
function setImageWithFallback(img, localSrc, remoteSrc) {
  if (!img) return;
  img.addEventListener(
    "error",
    () => {
      if (remoteSrc && img.src !== remoteSrc) img.src = remoteSrc;
      else img.style.display = "none"; // no image available — hide gracefully
    },
    { once: false }
  );
  img.src = localSrc || remoteSrc || "";
}

function iconGitHub() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.04.77 2.1v3.12c0 .3.21.66.8.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>';
}

function iconLinkedIn() {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/></svg>';
}

boot();
