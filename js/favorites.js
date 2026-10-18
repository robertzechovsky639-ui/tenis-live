/** Oblíbení hráči v localStorage. Klíč je příjmení + iniciála, ať sedí napříč zdroji. */

import { playerKey, shortName } from './util.js';

const KEY = 'tenis-live:favs';

export function favKey(name) {
  return playerKey(name);
}

export function loadFavorites() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((row) => row && row.key) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows));
}

export function isFavorite(rows, name) {
  const key = favKey(name);
  return Boolean(key) && rows.some((row) => row.key === key);
}

export function toggleFavorite(rows, name) {
  const key = favKey(name);
  if (!key) return rows;
  if (rows.some((row) => row.key === key)) return rows.filter((row) => row.key !== key);
  return [...rows, { key, name, short: shortName(name) }];
}
