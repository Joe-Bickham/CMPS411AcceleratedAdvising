// Tiny in-memory cache with TTL
const store = new Map(); // key -> { value, expiresAt }

export function setCache(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function getCache(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { store.delete(key); return null; }
  return hit.value;
}

export function delCache(key) {
  store.delete(key);
}
