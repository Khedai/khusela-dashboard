/**
 * Reverse geocoding using OpenStreetMap Nominatim (free, no API key).
 * In-memory cache to avoid repeated lookups for the same coordinates.
 * Respects Nominatim's 1 req/sec rate limit.
 */

const cache = new Map();
let lastRequestTime = 0;

/**
 * Convert lat/lng to a human-readable place name.
 * Returns suburb/town/city, or null if lookup fails.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  // Round to 4 decimal places for cache key (~11m precision — good enough for suburb)
  const key = `${lat.toFixed(4)}|${lng.toFixed(4)}`;
  if (cache.has(key)) return cache.get(key);

  // Rate limit: ensure at least 1 second between requests
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestTime));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=en`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'KhuselaHR/1.0 (internal dashboard)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    let name = null;

    if (data?.address) {
      const a = data.address;
      // Prefer suburb, then town, then city, then village
      name = a.suburb || a.town || a.city || a.village || null;

      // Filter out municipal ward/administrative names
      if (name && /\b(Ward|Ward \d+|City of Cape Town|Cape Town Ward|Suburb \d+)\b/i.test(name)) {
        name = null;
        // Try fallback to display_name parsing
        const parts = (data.display_name || '').split(',');
        for (const part of parts) {
          const t = part.trim();
          if (!/\b(ward|south africa|western cape|city of cape town)\b/i.test(t) && t.length > 2 && !/^\d+$/.test(t)) {
            name = t;
            break;
          }
        }
      }

      // Fallback: try county/state_district if we got nothing useful
      if (!name || /\bward\b/i.test(name)) {
        name = a.county || a.state_district || a.state || null;
      }
    }

    // Strip any trailing " Ward NN" suffix
    if (name) {
      name = name.replace(/\s*Ward\s*\d+/gi, '').trim();
    }

    cache.set(key, name || 'Unknown');
    return cache.get(key);
  } catch (err) {
    console.error(`[geocode] Failed for ${lat},${lng}:`, err.message);
    return null;
  }
}

/**
 * Batch reverse geocode multiple coordinate pairs.
 * @param {Array<{lat: number, lng: number}>} coords
 * @returns {Promise<Map<string, string>>}
 */
async function batchReverseGeocode(coords) {
  const results = new Map();
  for (const { lat, lng } of coords) {
    const name = await reverseGeocode(lat, lng);
    results.set(`${lat}|${lng}`, name);
  }
  return results;
}

module.exports = { reverseGeocode, batchReverseGeocode };