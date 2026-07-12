# 🌊 Ocean Descent — Alexander Pace's Portfolio

A single-page, scroll-driven marine ecosystem. You start in the sky at the
surface (hero), sink through mid-water (projects), and land on the sea floor
(skills + contact). The whole scene reacts to **your local time of day** and
**real-world weather** — no WebGL, no build tools, no frameworks. Just HTML,
CSS (Tailwind via CDN), Canvas 2D, and ES modules.

---

## ARCHITECTURE

```
/project-root
  index.html            — page structure + fixed scene layers
  /css/styles.css       — time-of-day palettes (CSS variables), weather
                          modifiers, glassmorphism, all keyframe animations
  /js/
    main.js             — entry point: loads JSON, renders content, boots modules
    timeOfDay.js        — pure helpers: hour → morning/midday/evening/night,
                          sun & moon arc positions
    lightingEngine.js   — applies time + weather to the DOM, drives the
                          scroll descent (layer crossfades, ray/shimmer fade)
    weatherSystem.js    — OpenWeather fetch + normalize + FAIL-SAFES
    animations.js       — scroll reveal, cloud builder, mobile nav
    canvasEngine.js     — stars, bubbles, fish / sharks / octopus / crabs
  /data/portfolio.json  — ALL portfolio content (edit this, not the HTML)
  /assets/              — your images (see assets/README.txt)
  README.md
```

**How the pieces talk:**

1. `main.js` fetches `data/portfolio.json` and builds the DOM.
2. `timeOfDay.js` classifies the hour; `lightingEngine.js` sets
   `data-time="…"` on `<html>`, which switches every color via CSS variables,
   and positions the sun/moon along an arc (transform only).
3. `weatherSystem.js` resolves a state (`CLEAR` / `PARTLY_CLOUDY` / `CLOUDY`)
   — always, even offline — and `lightingEngine.js` sets `data-weather="…"`,
   which dims the sun/rays and changes cloud opacity. `animations.js`
   rebuilds the cloud field with more or fewer clouds.
4. On scroll, `lightingEngine.js` crossfades four fixed background layers
   (sky → surface → mid → deep) using **opacity only**, and reports the
   depth (0–1) to `canvasEngine.js`, which decides which creatures are
   visible at that depth.
5. `canvasEngine.js` runs one `requestAnimationFrame` loop for stars,
   bubbles, and marine life. Day = colorful fish; sunset = slower movement;
   night = sharks, an octopus, crabs, and soft radial-gradient glows.

---

## SETUP

### Run locally

Because the site uses ES modules and `fetch()` for `portfolio.json`, it must
be served over HTTP — **opening `index.html` directly from the file system
will not work.**

**Option A — VS Code Live Server (easiest):**
1. Install [VS Code](https://code.visualstudio.com/) and the
   **Live Server** extension (by Ritwick Dey).
2. Open the project folder in VS Code.
3. Right-click `index.html` → **Open with Live Server**.

**Option B — Python (no install needed on most systems):**
```bash
cd project-root
python3 -m http.server 8000
# open http://localhost:8000
```

**Option C — Node:**
```bash
npx serve .
```

Tailwind is precompiled into `css/tailwind.css` (~10 KB) — no CDN, no
internet needed, no runtime compile. If you add NEW Tailwind utility
classes to `index.html` or the JS files, regenerate it:

```bash
npm install tailwindcss@3
npx tailwindcss -o css/tailwind.css --minify \
  --content "index.html,js/*.js"
```

All custom (non-Tailwind) styling lives in `css/styles.css`.

### Deploy

The site is 100% static. Any static host works:

- **GitHub Pages** — push the folder to a repo → Settings → Pages →
  deploy from branch.
- **Netlify / Vercel** — drag-and-drop the folder or connect the repo.
  No build command, no output directory — it's already the output.
- **Any web server** — copy the folder to the web root.

---

## ASSETS

Put images in `/assets/`. Expected filenames (matching your live site — you
can download them straight from `https://alexpaces.com/assets/`):

| File | Used for |
|---|---|
| `ProfilePic.jpg` | Hero portrait |
| `junepoint-preview2.PNG` | JunePoint preview |
| `jpa-preview2.jpg` | JPA Contractors preview |
| `ico-emergency-preview.PNG` | ICO Emergency preview |
| `clicker-preview.PNG` | Epic Clicker preview |
| `pong-preview.PNG` | Pong Classic preview |
| `Cert.jpg` | Certification image |

**Fallback chain:** local `/assets/` file → remote copy on alexpaces.com →
image hidden gracefully. So the site never shows a broken-image icon.

Recommended: keep previews ≤ 1200px wide and compressed (JPEG/WebP ~80%
quality). All project images lazy-load.

---

## CUSTOMIZATION — `data/portfolio.json`

All content lives in one JSON file. The HTML never needs editing for
content changes.

**Add a project** — append to the `projects` array:
```json
{
  "title": "My New App",
  "description": "One or two clear sentences.",
  "tech": ["React", "Node.js"],
  "link": "https://example.com",
  "image": "assets/my-new-app.jpg",
  "imageRemote": ""
}
```

**Remove a project** — delete its object from the array.

**Change skills** — `skills` is an object of `"Category": [items]`.
Add/remove categories or items freely; each category renders as a card.

**Everything else** — hero text, about paragraphs, certifications, and
contact links each map to an obvious key. Keep the JSON valid (watch
trailing commas) — if it fails to parse, the site shows a load-error notice.

---

## WEATHER

Open `js/weatherSystem.js` — config is at the top:

```js
export const WEATHER_CONFIG = {
  apiKey: "",                 // ← paste your OpenWeather API key here
  location: "Largo,FL,US",    // ← "City,State code,Country code"
  timeoutMs: 6000,
  refreshMs: 30 * 60 * 1000,  // re-fetch every 30 min
};
```

- **Get a key:** free at <https://openweathermap.org/api> (the "Current
  Weather Data" endpoint). New keys can take ~10 minutes to activate.
- **Change location:** edit `location` (e.g. `"Tampa,FL,US"`, `"London,GB"`).

**What happens if the API fails (fail-safe design):**

| Failure | Behavior |
|---|---|
| No key set | Silent fallback → `PARTLY_CLOUDY` |
| Bad key (401) / rate limit (429) | Console warning → `PARTLY_CLOUDY` |
| Network down / timeout / CORS | Console warning → `PARTLY_CLOUDY` |
| Malformed response | Console warning → `PARTLY_CLOUDY` |

`getWeatherState()` **never throws and never rejects** — the sun keeps
moving, clouds keep drifting, and nothing crashes. The footer shows whether
weather is live or the offline default.

Weather → visuals: `CLEAR` = bright sun, 3 clouds · `PARTLY_CLOUDY` =
softer light, 6 clouds · `CLOUDY` = dim sun/rays (55% cut), 10 clouds.
Rain/storm/mist conditions all render as `CLOUDY`.

---

## LIGHTING

**Time bands** (`js/timeOfDay.js`): morning 6–10, midday 10–16,
evening 16–19, night 19–6. Edit `getTimeOfDay()` to change them.

**Colors**: every palette is CSS variables in `css/styles.css` under
`html[data-time="morning"]` etc. — sky gradients, sun color/glow, ray
color, cloud tint, and the night-only `--floor-glow-opacity`.

**Sun/moon path**: `getCelestialPosition()` in `timeOfDay.js` maps the
clock onto a left→right parabolic arc (morning = low left, midday =
overhead, evening = low right; the moon runs the same arc at night).
The vertical range of the arc is set in `positionCelestial()` in
`lightingEngine.js`.

**Descent fades**: in `lightingEngine.js`, the scroll driver crossfades
layers at these scroll-progress breakpoints — sky 0→0.30, surface
0.30→0.60, mid 0.60→0.92, floor glow appears 0.72→0.95. Adjust the numbers
in `initScrollDriver()` to make the descent feel faster or slower.

**Testing other times**: in the console, run
`document.documentElement.dataset.time = "night"` for a quick color check
(creatures repopulate on real time changes; refresh after changing your
system clock for the full effect).

---

## TROUBLESHOOTING

| Problem | Fix |
|---|---|
| Blank content / "data failed to load" | You opened `index.html` via `file://`. Serve over HTTP (see SETUP). |
| No Tailwind styling | CDN blocked/offline. Check the network tab; core scene styling still comes from `styles.css`. |
| Weather always "offline default" | Key missing, brand-new (wait ~10 min), or wrong. Check the console for `[weather]` warnings. |
| Images missing | Filenames in `/assets/` must match `portfolio.json` exactly (case-sensitive on Linux hosts). Remote fallback needs internet. |
| No animations at all | Your OS has "reduce motion" enabled — that's the accessible still-scene mode working as intended. |
| Choppy scrolling | Close dev tools; check no browser extension is injecting into the page; see PERFORMANCE below. |
| JSON edits broke the page | Validate `portfolio.json` (e.g. jsonlint.com) — usually a trailing comma. |

---

## PERFORMANCE

Already built in: one shared canvas + one rAF loop (paused when the tab is
hidden), `devicePixelRatio` capped at 2, animations restricted to
`transform`/`opacity`, rAF-throttled passive scroll listener, lazy-loaded
images, creature counts scaled to viewport width, radial-gradient glows
instead of expensive `shadowBlur`.

Tips if you customize:

- Keep creature counts modest — fish counts scale in
  `canvasEngine.js → populate()`.
- Don't animate `width`, `top`, `filter`, or `box-shadow`; stick to
  `transform` and `opacity`.
- Compress images (WebP where possible) and keep them ≤ ~200 KB each.
- Cloud count per weather state is in `animations.js → CLOUD_COUNTS`;
  fewer clouds = fewer composited layers.
- For production, consider replacing the Tailwind CDN with a small compiled
  CSS file (the CDN JIT adds ~100 ms of startup work).

---

## ACCESSIBILITY

Skip-to-content link, keyboard-visible focus rings, semantic landmarks,
aria-labels on icon links, 44px+ touch targets, dark glass cards that keep
text contrast high over every sky palette, and full
`prefers-reduced-motion` support (still scene, instant reveals, no drift).
