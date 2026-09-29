/**
 * core/id.ts
 *
 * `crypto.randomUUID()` is NOT reliably available in React Native/Hermes
 * without an extra polyfill (unlike browser React, where it just works).
 * Rather than add a dependency for this, a short random+timestamp id is
 * good enough for local-only, single-device records like tasks and
 * outage windows.
 */
export function generateId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${time}${rand}`;
}
