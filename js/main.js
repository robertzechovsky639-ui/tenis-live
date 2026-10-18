/** Vstup aplikace: data, obnovování, směrování, vykreslení. */

import { annotateMatches, refreshLiveNumbers } from './predict/attach.js';
import { predictionStatus } from './predict/model.js';
import { loadFavorites, saveFavorites, toggleFavorite } from './favorites.js';
import { fetch365H2H } from './providers/scores365.js';
import { fetchRankings } from './providers/rankings.js';
import { loadBoard, readBoardCache } from './providers/load.js';
import { getState, patch, subscribe } from './store.js';
import { detailScreen } from './ui/detail.js';
import { favoritesScreen, headerHtml, matchesScreen, navHtml, rankingsScreen, settingsScreen } from './ui/screens.js';
import { pragueYMD } from './util.js';

const main = document.querySelector('#main');
const top = document.querySelector('#top');
const nav = document.querySelector('#nav');

let scroll = 0;
let lastRoute = '';
let refreshTimer = 0;
let predGen = 0;

function readHash() {
  const parts = (location.hash || '#/zapasy').replace(/^#\/?/, '').split('/').filter(Boolean);
  const head = parts[0] || 'zapasy';
  if (head === 'zapas' && parts[1]) return { route: 'detail', matchId: decodeURIComponent(parts.slice(1).join('/')) };
  if (head === 'zebricek') return { route: 'rankings', matchId: '' };
  if (head === 'oblibene') return { route: 'favorites', matchId: '' };
  if (head === 'nastaveni') return { route: 'settings', matchId: '' };
  return { route: 'matches', matchId: '' };
}

function render() {
  const state = getState();
  const active = document.activeElement;
  const keepInput = active && (active.id === 'q' || active.id === 'api-key');
  const selection = keepInput ? [active.selectionStart, active.selectionEnd] : null;
  if (!keepInput && lastRoute === state.route) scroll = window.scrollY;
  top.innerHTML = headerHtml(state);
  nav.innerHTML = navHtml(state);
  if (state.route === 'detail') main.innerHTML = detailScreen(state);
  else if (state.route === 'rankings') main.innerHTML = rankingsScreen(state);
  else if (state.route === 'favorites') main.innerHTML = favoritesScreen(state);
  else if (state.route === 'settings') main.innerHTML = settingsScreen(state);
  else main.innerHTML = matchesScreen(state);
  if (keepInput) {
    const again = document.getElementById(active.id);
    if (again) {
      again.focus();
      if (selection) again.setSelectionRange(selection[0], selection[1]);
    }
  } else if (lastRoute === state.route) {
    window.scrollTo(0, scroll);
  } else {
    window.scrollTo(0, 0);
  }
  lastRoute = state.route;
}

async function reloadBoard() {
  patch({ loading: !getState().board, error: '' });
  try {
    const board = await loadBoard();
    const state = getState();
    patch({ board, loading: false, offline: false, error: '', day: state.day || board.today });
    if (getState().route === 'detail') {
      const opened = board.matches.find((match) => match.id === getState().matchId);
      ensureH2H(opened);
    }
    schedule();
    predict(board.matches);
  } catch (error) {
    const cached = readBoardCache();
    patch({
      loading: false,
      offline: Boolean(cached),
      error: 'Živá data se nepodařilo stáhnout.',
      board: cached || getState().board,
      day: getState().day || cached?.today || pragueYMD(),
    });
    console.warn(error);
    schedule();
  }
}

function predict(matches) {
  const gen = ++predGen;
  annotateMatches(matches, () => {
    if (gen !== predGen) return;
    const status = predictionStatus();
    patch({ predNote: status.phase === 'loading' ? 'model…' : '' });
  }).finally(() => {
    if (gen !== predGen) return;
    const status = predictionStatus();
    patch({ predNote: status.phase === 'error' ? 'bez modelu' : '' });
  });
}

function schedule() {
  clearTimeout(refreshTimer);
  const live = (getState().board?.matches || []).some((match) => match.status === 'live');
  refreshTimer = setTimeout(() => {
    if (!document.hidden) reloadBoard();
    else schedule();
  }, live ? 25000 : 120000);
}

async function ensureRankings(tour) {
  const state = getState();
  if (state.rankings[tour]?.length) return;
  try {
    const rows = await fetchRankings(tour);
    patch({ rankings: { ...getState().rankings, [tour]: rows }, rankError: '' });
    try { localStorage.setItem(`tenis-live:rank:${tour}`, JSON.stringify({ t: Date.now(), rows })); } catch { /* cache je volitelná */ }
  } catch (error) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(`tenis-live:rank:${tour}`) || 'null'); } catch { cached = null; }
    patch({
      rankings: cached?.rows ? { ...getState().rankings, [tour]: cached.rows } : getState().rankings,
      rankError: cached?.rows ? 'Žebříček je z uložené kopie.' : 'Žebříček se nepodařilo načíst.',
    });
  }
}

async function ensureH2H(match) {
  if (!match?.external?.s365) {
    patch({ detailH2HFor: match?.id || '', detailH2H: [] });
    return;
  }
  if (getState().detailH2HFor === match.id && getState().detailH2H) return;
  try {
    const rows = await fetch365H2H(match.external.s365);
    patch({ detailH2HFor: match.id, detailH2H: rows });
  } catch {
    patch({ detailH2HFor: match.id, detailH2H: [] });
  }
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function onClick(event) {
  const star = event.target.closest('[data-fav]');
  if (star) {
    event.stopPropagation();
    event.preventDefault();
    const favorites = toggleFavorite(getState().favorites, star.dataset.fav);
    saveFavorites(favorites);
    patch({ favorites });
    return;
  }
  const day = event.target.closest('[data-day]');
  if (day) {
    patch({ day: day.dataset.day });
    return;
  }
  const tour = event.target.closest('[data-tour]');
  if (tour) {
    patch({ tour: tour.dataset.tour });
    return;
  }
  const rankTour = event.target.closest('[data-ranktour]');
  if (rankTour) {
    patch({ rankTour: rankTour.dataset.ranktour });
    ensureRankings(rankTour.dataset.ranktour);
    return;
  }
  const jump = event.target.closest('[data-go]');
  if (jump) {
    go(`#/${jump.dataset.go}`);
    return;
  }
  if (event.target.closest('[data-back]')) {
    history.length > 1 ? history.back() : go('#/zapasy');
    return;
  }
  if (event.target.closest('[data-save-key]')) {
    const value = document.querySelector('#api-key')?.value?.trim() || '';
    localStorage.setItem('tenis-live:settings', JSON.stringify({ apiTennisKey: value }));
    patch({ settingsKey: value });
    reloadBoard();
    return;
  }
  if (event.target.closest('[data-clear-key]')) {
    localStorage.setItem('tenis-live:settings', JSON.stringify({ apiTennisKey: '' }));
    patch({ settingsKey: '' });
    reloadBoard();
    return;
  }
  const match = event.target.closest('[data-match]');
  if (match) go(`#/zapas/${encodeURIComponent(match.dataset.match)}`);
}

function onInput(event) {
  if (event.target.id === 'q') patch({ rankQuery: event.target.value });
  if (event.target.id === 'api-key') patch({ settingsKey: event.target.value });
}

function syncRoute() {
  const next = readHash();
  patch(next);
  if (next.route === 'rankings') ensureRankings(getState().rankTour || 'atp');
  if (next.route === 'detail') {
    const match = getState().board?.matches?.find((item) => item.id === next.matchId);
    ensureH2H(match);
  }
}

function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

function boot() {
  let settingsKey = '';
  try { settingsKey = JSON.parse(localStorage.getItem('tenis-live:settings') || '{}').apiTennisKey || ''; } catch { settingsKey = ''; }
  patch({ favorites: loadFavorites(), settingsKey, day: pragueYMD() });
  subscribe(render);
  document.body.addEventListener('click', onClick);
  document.body.addEventListener('input', onInput);
  document.body.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target?.dataset?.match) go(`#/zapas/${encodeURIComponent(event.target.dataset.match)}`);
  });
  window.addEventListener('hashchange', syncRoute);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reloadBoard();
  });
  syncRoute();
  reloadBoard();
  registerWorker();
  setInterval(() => {
    const matches = getState().board?.matches;
    if (!matches?.some((match) => match.status === 'live')) return;
    refreshLiveNumbers(matches);
    if (getState().route === 'matches' || getState().route === 'detail' || getState().route === 'favorites') {
      patch({ predNote: getState().predNote });
    }
  }, 25000);
}

boot();
