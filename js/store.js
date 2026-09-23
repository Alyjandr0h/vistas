// Remembers things on the phone (saved photos, favorites, settings).
// localStorage can throw in private mode or when storage is full, so every call is guarded.

const PREFIX = 'vistas.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Nothing useful to do; the app keeps working for this session.
  }
}
