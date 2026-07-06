/**
 * timeOfDay.js
 * Pure helpers: classify the local hour into a time-of-day state and
 * compute sun / moon positions along a sky arc.
 * No DOM access here — lightingEngine.js applies the results.
 */

/**
 * @param {number} [hour] - 0–23; defaults to the user's local hour.
 * @returns {"morning"|"midday"|"evening"|"night"}
 */
export function getTimeOfDay(hour = new Date().getHours()) {
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 10 && hour < 16) return "midday";
  if (hour >= 16 && hour < 19) return "evening";
  return "night";
}

/** Human greeting used in the hero. */
export function getGreeting(timeOfDay) {
  return {
    morning: "Good morning — calm seas ahead",
    midday: "Good afternoon — bright waters",
    evening: "Good evening — golden hour",
    night: "Good night — the deep is glowing",
  }[timeOfDay];
}

/**
 * Position of the sun (day) or moon (night) as fractions of the sky layer.
 * x: 0 (left) → 1 (right); y: 0 (horizon) → 1 (zenith).
 * Daytime arc runs 6:00 → 19:00 (sun rises left, sets right).
 * Night arc runs 19:00 → 6:00 for the moon.
 *
 * @param {Date} [date]
 * @returns {{ x: number, y: number, body: "sun"|"moon" }}
 */
export function getCelestialPosition(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  const time = getTimeOfDay(date.getHours());

  if (time === "night") {
    // Map 19:00 → 30:00 (i.e. 6:00 next day) onto 0..1
    const t = ((h < 6 ? h + 24 : h) - 19) / 11;
    return { x: t, y: arc(t), body: "moon" };
  }

  // Daytime: 6:00 → 19:00 onto 0..1
  const t = clamp((h - 6) / 13, 0, 1);
  return { x: t, y: arc(t), body: "sun" };
}

/** Simple parabolic arc peaking at t = 0.5. */
function arc(t) {
  return Math.max(0.08, 1 - Math.pow((t - 0.5) * 2, 2));
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Milliseconds until the next minute boundary — used to re-evaluate
 * the scene as real time passes without polling aggressively.
 */
export function msToNextMinute(date = new Date()) {
  return (60 - date.getSeconds()) * 1000 - date.getMilliseconds() + 50;
}
