const crypto = require('crypto');

const MAX_ENTRIES = 400;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map(); // key -> { value, expiresAt }
const keyOrder = []; // LRU: oldest first

function hash(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function cacheKey(prefix, ...parts) {
  const combined = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\0');
  return `${prefix}:${hash(combined)}`;
}

function prune() {
  const now = Date.now();
  while (keyOrder.length > 0 && (cache.size > MAX_ENTRIES || (cache.get(keyOrder[0])?.expiresAt <= now))) {
    const oldest = keyOrder.shift();
    cache.delete(oldest);
  }
}

/**
 * Get cached result for an OpenAI call. Returns undefined if miss or expired.
 * @param {string} key - Cache key from makeKey
 * @returns {any|undefined}
 */
function get(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    const i = keyOrder.indexOf(key);
    if (i !== -1) keyOrder.splice(i, 1);
    return undefined;
  }
  return entry.value;
}

/**
 * Store result for an OpenAI call. Uses LRU eviction and TTL.
 * @param {string} key - Cache key from makeKey
 * @param {any} value - Result to cache (must be JSON-serializable for summarize/categorize/match)
 */
function set(key, value) {
  prune();
  const expiresAt = Date.now() + TTL_MS;
  if (cache.has(key)) {
    cache.set(key, { value, expiresAt });
    const i = keyOrder.indexOf(key);
    if (i !== -1) keyOrder.splice(i, 1);
    keyOrder.push(key);
  } else {
    cache.set(key, { value, expiresAt });
    keyOrder.push(key);
  }
}

/**
 * Cache keys for email routes.
 */
const keys = {
  summarize: (emailContent) => cacheKey('summarize', emailContent),
  categorize: (emailContent) => cacheKey('categorize', emailContent),
  matchCustomLabel: (emailContent, labelName, labelDescription) =>
    cacheKey('match', emailContent, labelName, labelDescription)
};

module.exports = {
  get,
  set,
  keys
};
