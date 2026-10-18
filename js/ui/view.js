/** Společné vykreslení skóre, šance a stavů. */

import { isFavorite } from '../favorites.js';
import { surfaceLabel, tourLabel } from '../levels.js';
import { esc, formatTime, pct } from '../util.js';

export function liveLabel(match) {
  const text = match.statusText || '';
  const set = text.match(/set\s*(\d+)/i);
  if (set) return `${set[1]}. set`;
  if (match.current) {
    const done = (match.sets || []).length;
    return `${done + 1}. set`;
  }
  return 'Živě';
}

export function statusHtml(match) {
  if (match.status === 'live') return `<span class="livepill"><i></i>${esc(liveLabel(match))}</span>`;
  if (match.status === 'finished') return '<span>Konec</span>';
  if (match.status === 'retired') return '<span>Skreč</span>';
  if (match.status === 'walkover') return '<span>Bez boje</span>';
  if (match.status === 'canceled') return '<span>Zrušeno</span>';
  if (match.status === 'suspended') return '<span>Přerušeno</span>';
  return `<span>${esc(formatTime(match.start))}</span>`;
}

function tiebreak(set, side) {
  if (set.tbA == null && set.tbB == null) return '';
  const mine = side === 0 ? set.a : set.b;
  const other = side === 0 ? set.b : set.a;
  if (!(mine > other)) return '';
  const loserPoints = side === 0 ? set.tbB : set.tbA;
  const value = loserPoints != null && loserPoints >= 0 ? loserPoints : Math.min(set.tbA ?? 99, set.tbB ?? 99);
  if (!Number.isFinite(value) || value < 0 || value > 30) return '';
  return `<sup>${value}</sup>`;
}

export function scoreHtml(match, side) {
  const key = side === 0 ? 'a' : 'b';
  const other = side === 0 ? 'b' : 'a';
  const sets = [...(match.sets || [])];
  if (match.current && (match.status === 'live' || match.status === 'suspended')) sets.push(match.current);
  const current = match.current && (match.status === 'live' || match.status === 'suspended') ? sets.length - 1 : -1;
  const ball = match.status === 'live' && match.server === side + 1 ? 'ball' : 'ball off';
  const cells = sets.map((set, index) => {
    const won = index !== current && set[key] !== set[other] && set[key] > set[other];
    return `<span class="g ${won ? 'won' : ''} ${index === current ? 'now' : ''}">${set[key]}${tiebreak(set, side)}</span>`;
  }).join('');
  const points = match.status === 'live' && match.points ? `<b class="pts">${esc(match.points[key])}</b>` : '';
  return `<span class="scores"><i class="${ball}"></i>${cells}${points}</span>`;
}

export function playerRow(match, side, favorites) {
  const player = match.players[side];
  const fav = isFavorite(favorites, player.name);
  const finished = match.status === 'finished' || match.status === 'retired' || match.status === 'walkover';
  const win = finished && match.winner === side + 1;
  const lose = finished && match.winner && match.winner !== side + 1;
  const flag = player.flag ? `<img class="flag" alt="" src="${esc(player.flag)}">` : '<span class="flag"></span>';
  return `<div class="player ${win ? 'win' : ''} ${lose ? 'lose' : ''}">
    ${flag}
    <span class="nm">${esc(player.short || player.name)}${player.rank ? ` <small class="meta">${esc(String(player.rank))}.</small>` : ''}</span>
    ${scoreHtml(match, side)}
    <button class="star ${fav ? 'on' : ''}" data-fav="${esc(player.name)}" aria-label="Oblíbený ${esc(player.name)}">${fav ? '★' : '☆'}</button>
  </div>`;
}

export function probHtml(match) {
  const prediction = match.prediction;
  if (!prediction) return '<p class="preline">Šance se počítá…</p>';
  if (prediction.pre == null) return '';
  if (match.status === 'finished' || match.status === 'retired' || match.status === 'walkover' || match.status === 'canceled') {
    return `<p class="preline">Před zápasem ${pct(prediction.pre)} : ${pct(1 - prediction.pre)}</p>`;
  }
  const value = match.status === 'live' || match.status === 'suspended' ? prediction.live : prediction.pre;
  if (value == null) return '';
  const caption = match.status === 'live' ? 'živá šance' : 'před zápasem';
  return `<div class="prob" aria-label="${caption}">
    <span class="${value >= 0.5 ? 'hot' : ''}">${pct(value)}</span>
    <div class="bar"><i style="width:${Math.max(0, Math.min(100, value * 100)).toFixed(1)}%"></i></div>
    <span class="${value < 0.5 ? 'hot' : ''}">${pct(1 - value)}</span>
  </div>`;
}

export function groupMatches(list) {
  const groups = new Map();
  for (const match of list) {
    const key = `${match.tour}|${match.tournament}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  const order = { live: 0, suspended: 1, scheduled: 2, finished: 3, retired: 3, walkover: 3, canceled: 4 };
  return [...groups.values()].map((rows) => {
    rows.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || a.start - b.start);
    return {
      tour: rows[0].tour,
      tournament: rows[0].tournament,
      surface: surfaceLabel(rows.find((row) => row.surface)?.surface || ''),
      badge: rows[0].badge || '',
      rows,
    };
  }).sort((a, b) => {
    const liveA = a.rows.some((row) => row.status === 'live') ? 0 : 1;
    const liveB = b.rows.some((row) => row.status === 'live') ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;
    return Math.min(...a.rows.map((row) => row.start || 0)) - Math.min(...b.rows.map((row) => row.start || 0));
  });
}

export function matchCard(match, favorites) {
  const fav = match.players.some((player) => isFavorite(favorites, player.name));
  const round = [match.round, match.court].filter(Boolean).join(' · ');
  return `<article class="match ${match.status === 'live' ? 'live' : ''} ${fav ? 'fav' : ''}" data-match="${esc(match.id)}" tabindex="0">
    ${playerRow(match, 0, favorites)}
    ${playerRow(match, 1, favorites)}
    <div class="rowstatus">${statusHtml(match)}<span>${esc(round)}</span></div>
    ${probHtml(match)}
  </article>`;
}

export function tourTag(tour, badge) {
  return `<span class="tag ${esc(tour)}">${esc(badge || tourLabel(tour))}</span>`;
}
