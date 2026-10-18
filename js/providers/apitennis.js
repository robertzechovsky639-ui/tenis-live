/**
 * Volitelný zdroj API-Tennis (api-tennis.com). Zapne se, když je v prohlížeči klíč
 * nebo když GitHub Action uloží snímek do data/challenger.json.
 * Nikdy sem nepatří samotný klíč.
 */

import { bestOf, roundLabel, surfaceFromText } from '../levels.js';
import { getJSON, shortName } from '../util.js';

const ENDPOINT = 'https://api.api-tennis.com/tennis/';

function pragueMs(date, time) {
  if (!date) return 0;
  const clock = (time || '00:00').slice(0, 5);
  for (const offset of ['+02:00', '+01:00']) {
    const ms = Date.parse(`${date}T${clock}:00${offset}`);
    if (Number.isNaN(ms)) continue;
    const shown = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Prague',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(ms);
    if (shown === clock) return ms;
  }
  return Date.parse(`${date}T${clock}:00Z`) || 0;
}

function mapStatus(event) {
  const text = `${event.event_status || ''} ${event.event_live || ''}`;
  if (/walk/i.test(text)) return 'walkover';
  if (/retir/i.test(text)) return 'retired';
  if (/cancel|postpon/i.test(text)) return 'canceled';
  if (event.event_live === '1' || event.event_live === 1 || /^set\s*\d/i.test(event.event_status || '')) return 'live';
  if (/finish|ended|retired/i.test(event.event_status || '')) return 'finished';
  return 'scheduled';
}

function isChallengerSingles(event) {
  const type = String(event.event_type_type || '');
  return /challenger/i.test(type) && /single/i.test(type) && !/double/i.test(type);
}

export function parseApiTennisEvents(events) {
  const matches = [];
  for (const event of events || []) {
    if (!isChallengerSingles(event)) continue;
    const first = event.event_first_player;
    const second = event.event_second_player;
    if (!first || !second || first.includes('/') || second.includes('/')) continue;
    const status = mapStatus(event);
    const sets = (event.scores || []).map((row) => ({
      a: Number(row.score_first),
      b: Number(row.score_second),
      tbA: null,
      tbB: null,
    })).filter((set) => Number.isFinite(set.a) && Number.isFinite(set.b));
    let points = null;
    const game = String(event.event_game_result || '');
    const pointMatch = game.match(/(\d+|A|Ad)\s*-\s*(\d+|A|Ad)/i);
    if (status === 'live' && pointMatch) points = { a: pointMatch[1].toUpperCase() === 'AD' ? 'A' : pointMatch[1], b: pointMatch[2].toUpperCase() === 'AD' ? 'A' : pointMatch[2] };
    let server = 0;
    if (/first/i.test(event.event_serve || '')) server = 1;
    else if (/second/i.test(event.event_serve || '')) server = 2;
    let winner = 0;
    if (/first/i.test(event.event_winner || '')) winner = 1;
    else if (/second/i.test(event.event_winner || '')) winner = 2;
    const qualifying = String(event.event_qualification || '').toLowerCase() === 'true' || /qualif/i.test(event.tournament_round || '');
    const stats = pairStats(event.statistics, event.first_player_key, event.second_player_key);
    matches.push({
      id: `api-${event.event_key}`,
      tour: 'challenger',
      gender: /women/i.test(event.event_type_type || '') ? 'W' : 'M',
      tournament: String(event.tournament_name || 'Challenger').replace(/\s+(Men|Women)$/i, ''),
      round: roundLabel(event.tournament_round || '', qualifying),
      surface: surfaceFromText(event.tournament_name || ''),
      levelCode: 3,
      qualifying,
      bestOf: bestOf(3, 'M', qualifying),
      start: pragueMs(event.event_date, event.event_time),
      status,
      statusText: event.event_status || '',
      court: '',
      players: [
        { id: String(event.first_player_key || ''), name: first, short: shortName(first), country: '', flag: '', rank: null },
        { id: String(event.second_player_key || ''), name: second, short: shortName(second), country: '', flag: '', rank: null },
      ],
      sets: status === 'live' ? sets.slice(0, -1) : sets,
      current: status === 'live' ? (sets.at(-1) || { a: 0, b: 0, tbA: null, tbB: null }) : null,
      points,
      server,
      winner,
      stats,
      sources: ['api-tennis'],
      external: { apiTennis: String(event.event_key), playerKeys: [String(event.first_player_key || ''), String(event.second_player_key || '')] },
    });
  }
  return matches;
}

function pairStats(statistics, firstKey, secondKey) {
  if (!Array.isArray(statistics) || !statistics.length) return null;
  const rows = new Map();
  for (const stat of statistics) {
    if (stat.stat_period && stat.stat_period !== 'match') continue;
    const name = stat.stat_name;
    if (!name) continue;
    const row = rows.get(name) || { name, a: '', b: '' };
    const value = stat.stat_value ?? '';
    if (String(stat.player_key) === String(firstKey)) row.a = value;
    else if (String(stat.player_key) === String(secondKey)) row.b = value;
    rows.set(name, row);
  }
  const list = [...rows.values()].filter((row) => row.a !== '' || row.b !== '');
  return list.length ? list.slice(0, 12) : null;
}

export async function fetchApiTennis(apiKey, fromYmd, toYmd) {
  if (!apiKey) return [];
  const common = `APIkey=${encodeURIComponent(apiKey)}&timezone=Europe/Prague`;
  const fixturesUrl = `${ENDPOINT}?method=get_fixtures&date_start=${fromYmd}&date_stop=${toYmd}&${common}`;
  const liveUrl = `${ENDPOINT}?method=get_livescore&${common}`;
  const [fixtures, live] = await Promise.all([
    getJSON(fixturesUrl),
    getJSON(liveUrl).catch(() => ({ result: [] })),
  ]);
  if (fixtures && fixtures.success === 0) throw new Error(fixtures.error || 'API-Tennis odmítlo klíč');
  const byId = new Map();
  for (const event of [...(fixtures?.result || []), ...(live?.result || [])]) byId.set(String(event.event_key), event);
  return parseApiTennisEvents([...byId.values()]);
}

export async function fetchChallengerSnapshot() {
  try {
    const payload = await getJSON('./data/challenger.json', 8000);
    const events = [...(payload?.fixtures || []), ...(payload?.live || [])];
    return { updated: payload?.updated || '', matches: parseApiTennisEvents(events) };
  } catch {
    return { updated: '', matches: [] };
  }
}
