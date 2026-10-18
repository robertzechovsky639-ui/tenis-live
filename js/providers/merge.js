/** Sloučení ESPN (ATP/WTA) a 365scores / API-Tennis (body, podání, Challenger). */

import { playerKey, pragueYMD, samePlayers } from '../util.js';

const STATUS_RANK = { scheduled: 1, suspended: 2, live: 3, retired: 4, walkover: 4, finished: 5, canceled: 0 };

function gamesPlayed(match) {
  const done = (match.sets || []).reduce((sum, set) => sum + set.a + set.b, 0);
  const current = match.current ? match.current.a + match.current.b : 0;
  return done + current;
}

function closeInTime(a, b) {
  if (!a.start || !b.start) return true;
  return Math.abs(a.start - b.start) < 36 * 3600 * 1000;
}

function findTwin(match, list) {
  return list.find((other) => other.tour === match.tour && samePlayers(match.players[0].name, match.players[1].name, other.players[0].name, other.players[1].name) && closeInTime(match, other));
}

function flipped(match) {
  const flipSet = (set) => set && ({ a: set.b, b: set.a, tbA: set.tbB, tbB: set.tbA });
  return {
    ...match,
    players: [match.players[1], match.players[0]],
    sets: (match.sets || []).map(flipSet),
    current: flipSet(match.current),
    points: match.points ? { a: match.points.b, b: match.points.a } : null,
    server: match.server ? 3 - match.server : 0,
    winner: match.winner ? 3 - match.winner : 0,
    stats: (match.stats || []).map((row) => ({ ...row, a: row.b, b: row.a })) || null,
  };
}

function orient(base, extra) {
  const baseKey = `${base.players[0].name}`;
  const sameOrder = samePlayers(base.players[0].name, base.players[1].name, extra.players[0].name, extra.players[1].name)
    && base.players[0].name.split(/\s+/).at(-1)?.toLowerCase() === extra.players[0].name.split(/\s+/).at(-1)?.toLowerCase();
  if (sameOrder) return extra;
  const sur = (name) => name.toLowerCase().split(/\s+/).at(-1);
  if (sur(base.players[0].name) && sur(base.players[0].name) === sur(extra.players[0].name)) return extra;
  if (sur(base.players[0].name) && sur(base.players[0].name) === sur(extra.players[1].name)) return flipped(extra);
  return extra;
}

function preferScore(base, extra) {
  const extraRicher = gamesPlayed(extra) > gamesPlayed(base) + 0
    || (STATUS_RANK[extra.status] || 0) > (STATUS_RANK[base.status] || 0);
  if (!extraRicher) return base;
  return {
    ...base,
    status: extra.status,
    statusText: extra.statusText || base.statusText,
    sets: extra.sets,
    current: extra.current,
    winner: extra.winner || base.winner,
  };
}

function mergePair(base, extra) {
  const other = orient(base, extra);
  const next = preferScore(base, other);
  next.points = other.points || next.points;
  next.server = other.server || next.server;
  next.surface = next.surface || other.surface;
  next.court = next.court || other.court;
  next.stats = (next.stats && next.stats.length) ? next.stats : other.stats;
  next.players = next.players.map((player, index) => ({
    ...player,
    rank: player.rank || other.players[index]?.rank || null,
    country: player.country || other.players[index]?.country || '',
    flag: player.flag || other.players[index]?.flag || '',
  }));
  next.sources = [...new Set([...(base.sources || []), ...(extra.sources || [])])];
  next.external = { ...(base.external || {}), ...(extra.external || {}) };
  next.badge = next.badge || other.badge || '';
  return next;
}

export function mergeMatches(espnMatches, extraMatches) {
  const used = new Set();
  const merged = espnMatches.map((match) => {
    const twin = findTwin(match, extraMatches);
    if (!twin) return match;
    used.add(twin.id);
    return mergePair(match, twin);
  });
  for (const match of extraMatches) {
    if (used.has(match.id)) continue;
    if (match.tour === 'atp' || match.tour === 'wta') {
      const twin = findTwin(match, merged);
      if (twin) continue;
    }
    merged.push(match);
  }
  const byKey = new Map();
  for (const match of merged) {
    const key = `${match.tour}|${match.start ? pragueYMD(match.start) : match.id}|${[playerKey(match.players[0].name), playerKey(match.players[1].name)].sort().join('~')}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, match);
      continue;
    }
    const prevScore = (STATUS_RANK[prev.status] || 0) * 100 + (prev.stats?.length || 0) + (prev.points ? 5 : 0);
    const nextScore = (STATUS_RANK[match.status] || 0) * 100 + (match.stats?.length || 0) + (match.points ? 5 : 0);
    byKey.set(key, nextScore > prevScore ? mergePair(prev, match) : mergePair(match, prev));
  }
  return [...byKey.values()];
}
