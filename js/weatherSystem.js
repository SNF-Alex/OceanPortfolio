/**
 * weatherSystem.js
 * Fetches live weather from OpenWeather and normalizes it to one of three
 * scene states: CLEAR, PARTLY_CLOUDY, CLOUDY.
 *
 * FAIL-SAFE GUARANTEE: getWeatherState() NEVER throws and NEVER rejects.
 * Missing key, bad key, network failure, rate limit, timeout, malformed
 * response — every path resolves to a usable state (PARTLY_CLOUDY fallback)
 * so the scene always renders: sun keeps moving, clouds keep drifting.
 */

// ─────────────────────────────────────────────────────────────────────────
// CONFIG — edit these values
// ─────────────────────────────────────────────────────────────────────────
export const WEATHER_CONFIG = {
  /** Paste your OpenWeather API key here (https://openweathermap.org/api). */
  apiKey: "",

  /** Location query. Format: "City,State code,Country code". */
  location: "Largo,FL,US",

  /** Abort the request if it takes longer than this (ms). */
  timeoutMs: 6000,

  /** Re-fetch interval (ms). 30 min stays well inside free-tier limits. */
  refreshMs: 30 * 60 * 1000,
};
// ─────────────────────────────────────────────────────────────────────────

export const WEATHER_STATES = Object.freeze({
  CLEAR: "CLEAR",
  PARTLY_CLOUDY: "PARTLY_CLOUDY",
  CLOUDY: "CLOUDY",
});

const FALLBACK = {
  state: WEATHER_STATES.PARTLY_CLOUDY,
  source: "fallback",
  description: "partly cloudy (default)",
};

/**
 * Resolve the current weather state. Always resolves; never rejects.
 * @returns {Promise<{state: string, source: string, description: string}>}
 */
export async function getWeatherState() {
  if (!WEATHER_CONFIG.apiKey) {
    return { ...FALLBACK, description: "partly cloudy (no API key set)" };
  }

  const url =
    "https://api.openweathermap.org/data/2.5/weather" +
    `?q=${encodeURIComponent(WEATHER_CONFIG.location)}` +
    `&appid=${encodeURIComponent(WEATHER_CONFIG.apiKey)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_CONFIG.timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });

    // Bad key (401), rate limit (429), server errors — all fall back.
    if (!res.ok) {
      console.warn(`[weather] API responded ${res.status}; using fallback.`);
      return FALLBACK;
    }

    const data = await res.json();
    const main = data?.weather?.[0]?.main;
    const description = data?.weather?.[0]?.description ?? "unknown";
    const cloudPct = typeof data?.clouds?.all === "number" ? data.clouds.all : 50;

    if (typeof main !== "string") {
      console.warn("[weather] Unexpected response shape; using fallback.");
      return FALLBACK;
    }

    return { state: normalize(main, cloudPct), source: "api", description };
  } catch (err) {
    // Network down, CORS, timeout/abort, JSON parse failure…
    console.warn("[weather] Fetch failed; using fallback.", err?.message ?? err);
    return FALLBACK;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map OpenWeather conditions onto the three scene states.
 * Anything heavy (rain, storm, mist…) reads as CLOUDY — dim, more clouds.
 */
function normalize(main, cloudPct) {
  switch (main) {
    case "Clear":
      return WEATHER_STATES.CLEAR;
    case "Clouds":
      return cloudPct < 55 ? WEATHER_STATES.PARTLY_CLOUDY : WEATHER_STATES.CLOUDY;
    default:
      return WEATHER_STATES.CLOUDY;
  }
}

/**
 * Fetch now and keep refreshing on an interval.
 * @param {(weather: {state:string, source:string, description:string}) => void} onUpdate
 * @returns {() => void} stop function
 */
export function startWeatherUpdates(onUpdate) {
  let stopped = false;

  const tick = async () => {
    const weather = await getWeatherState();
    if (!stopped) onUpdate(weather);
  };

  tick();
  const interval = setInterval(tick, WEATHER_CONFIG.refreshMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
