/** Načte okno včera–zítra a složí zápasy ze všech zapnutých zdrojů. */

import { addDays, getJSON, pragueYMD } from '../util.js';
import { fetchApiTennis, fetchChallengerSnapshot } from './apitennis.js';
import { fetchEspnWindow } from './espn.js';
import { mergeMatches } from './merge.js';
import { fetch365Window } from './scores365.js';

const BOARD_KEY = 'tenis-live:board';

export function readBoardCache() {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeBoardCache(board) {
  try {
    const slim = {
      ...board,
      matches: board.matches.map((match) => ({ ...match, stats: match.stats ? match.stats.slice(0, 8) : null })),
    };
    localStorage.setItem(BOARD_KEY, JSON.stringify(slim));
  } catch {
    /* soukromý režim nebo plné úložiště */
  }
}

export function readApiKey() {
  try {
    const settings = JSON.parse(localStorage.getItem('tenis-live:settings') || '{}');
    return String(settings.apiTennisKey || '').trim();
  } catch {
    return '';
  }
}

export async function loadBoard(now = Date.now()) {
  const today = pragueYMD(now);
  const from = addDays(today, -1);
  const to = addDays(today, 1);
  const notes = [];
  let espn = [];
  let scores = [];
  let challengerError = '';

  const [espnResult, scoresResult] = await Promise.allSettled([
    fetchEspnWindow(from, to),
    fetch365Window(from, to),
  ]);

  if (espnResult.status === 'fulfilled') {
    espn = espnResult.value.matches;
    if (espnResult.value.errors.length) notes.push(`ESPN částečně: ${espnResult.value.errors.join('; ')}`);
  } else {
    notes.push('ESPN teď neodpovídá, ATP a WTA jdou z náhradního zdroje, pokud je dostupný.');
  }

  if (scoresResult.status === 'fulfilled') scores = scoresResult.value;
  else {
    challengerError = 'Veřejný zdroj Challengeru (365scores) teď neodpovídá.';
    notes.push(challengerError);
  }

  let apiMatches = [];
  const apiKey = readApiKey();
  if (apiKey) {
    try {
      apiMatches = await fetchApiTennis(apiKey, from, to);
      notes.push('Challenger je doplněný z API-Tennis.');
    } catch (error) {
      notes.push(`API-Tennis: ${error.message || error}`);
    }
  }

  let snapshotNote = '';
  if (!scores.length) {
    const snapshot = await fetchChallengerSnapshot();
    if (snapshot.matches.length) {
      apiMatches = apiMatches.length ? apiMatches : snapshot.matches;
      snapshotNote = snapshot.updated ? `snímek ${snapshot.updated}` : 'uložený snímek';
      notes.push(`Challenger ze snímku (${snapshotNote}).`);
    }
  }

  const matches = mergeMatches(espn, [...scores, ...apiMatches]).filter((match) => {
    if (match.status === 'live') return true;
    if (!match.start) return false;
    const day = pragueYMD(match.start);
    return day >= from && day <= to;
  });
  const hasChallenger = matches.some((match) => match.tour === 'challenger');
  if (!hasChallenger && challengerError && !apiMatches.length) {
    challengerError = `${challengerError} Bez klíče API-Tennis tu teď zápas neuvidíte. Klíč se ukládá jen v tomto prohlížeči (Nastavení), nebo ho lze pustit přes GitHub Action a soubor data/challenger.json.`;
  } else {
    challengerError = '';
  }

  const board = {
    today,
    from,
    to,
    matches,
    notes,
    challengerError,
    fetchedAt: Date.now(),
    sources: {
      espn: espnResult.status === 'fulfilled',
      scores365: scoresResult.status === 'fulfilled',
      apiTennis: Boolean(apiKey) && apiMatches.some((match) => match.sources?.includes('api-tennis')),
    },
  };
  writeBoardCache(board);
  return board;
}

export async function pingModelHost() {
  try {
    await getJSON('https://robertzechovsky639-ui.github.io/tenis/data/meta.json', 8000);
    return true;
  } catch {
    return false;
  }
}
