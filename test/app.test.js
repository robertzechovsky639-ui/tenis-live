import assert from 'node:assert/strict';
import test from 'node:test';
import { parseApiTennisEvents } from '../js/providers/apitennis.js';
import { parseEspnScoreboard } from '../js/providers/espn.js';
import { mergeMatches } from '../js/providers/merge.js';
import { parseRankings } from '../js/providers/rankings.js';
import { parse365Payload } from '../js/providers/scores365.js';
import { rankProbability } from '../js/predict/attach.js';
import { liveMarkov, markovWin } from '../js/predict/markov.js';
import { addDays, playerKey, pragueYMD, samePlayers } from '../js/util.js';

const espn = {
  events: [{
    name: 'Rolex Shanghai Masters',
    date: '2026-10-18T04:00:00Z',
    groupings: [{
      grouping: { slug: 'mens-singles' },
      competitions: [{
        id: '100',
        date: '2026-10-18T12:00:00Z',
        status: { type: { state: 'in', name: 'STATUS_IN_PROGRESS', shortDetail: '2nd set' } },
        round: { displayName: 'Semifinal' },
        venue: { court: 'Centre Court' },
        competitors: [
          {
            order: 1,
            winner: false,
            athlete: { displayName: 'Jannik Sinner', shortName: 'J. Sinner', flag: { href: 'https://example/it.png', alt: 'Italy' } },
            linescores: [{ value: 6 }, { value: 3 }],
          },
          {
            order: 2,
            winner: false,
            athlete: { displayName: 'Carlos Alcaraz', shortName: 'C. Alcaraz', flag: { alt: 'Spain' } },
            linescores: [{ value: 4 }, { value: 2 }],
          },
        ],
      }, {
        id: '101',
        date: '2026-10-18T08:00:00Z',
        status: { type: { state: 'post', name: 'STATUS_FINAL', shortDetail: 'Final' } },
        round: { displayName: 'Final' },
        competitors: [
          {
            order: 1,
            winner: true,
            athlete: { displayName: 'Novak Djokovic' },
            linescores: [{ value: 7, tiebreak: 7 }, { value: 6 }],
          },
          {
            order: 2,
            winner: false,
            athlete: { displayName: 'Daniil Medvedev' },
            linescores: [{ value: 6, tiebreak: 5 }, { value: 3 }],
          },
        ],
      }],
    }, {
      grouping: { slug: 'mens-doubles' },
      competitions: [{
        id: '200',
        date: '2026-10-18T12:00:00Z',
        status: { type: { state: 'pre', name: 'STATUS_SCHEDULED' } },
        competitors: [
          { order: 1, athlete: { displayName: 'A/B' } },
          { order: 2, athlete: { displayName: 'C/D' } },
        ],
      }],
    }],
  }],
};

test('ESPN parser bere dvouhru, sety a živý stav', () => {
  const matches = parseEspnScoreboard(espn, 'atp');
  assert.equal(matches.length, 2);
  const live = matches.find((match) => match.id === 'espn-atp-100');
  assert.equal(live.status, 'live');
  assert.equal(live.sets.length, 1);
  assert.equal(live.sets[0].a, 6);
  assert.equal(live.current.a, 3);
  assert.equal(live.current.b, 2);
  assert.equal(live.players[0].name, 'Jannik Sinner');
  assert.equal(live.levelCode, 5);
  const done = matches.find((match) => match.id === 'espn-atp-101');
  assert.equal(done.status, 'finished');
  assert.equal(done.winner, 1);
  assert.equal(done.sets[0].tbB, 5);
  assert.equal(done.current, null);
});

test('365scores oddělí Challenger a body v gemu', () => {
  const matches = parse365Payload({
    countries: [{ id: 301, name: 'Challenger' }, { id: 10, name: 'Argentina' }],
    competitions: [{ id: 7, countryId: 301, name: 'Florence Challenger' }],
    games: [{
      id: 55,
      competitionId: 7,
      competitionDisplayName: 'Challenger, Florence, Clay',
      stageName: 'Qualifications',
      roundName: 'Round',
      startTime: '2026-10-18T15:00:00+02:00',
      statusGroup: 3,
      statusText: 'Set 1',
      homeCompetitor: { id: 1, name: 'Quinn Vandecasteele', countryId: 10, inPossession: true },
      awayCompetitor: { id: 2, name: 'Michael Antonius', countryId: 10 },
      stages: [
        { shortName: 'Game', name: 'Game', homeCompetitorScore: 40, awayCompetitorScore: 30 },
        { shortName: 'S1', name: 'Set 1', homeCompetitorScore: 4, awayCompetitorScore: 3, isLive: true },
      ],
    }],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tour, 'challenger');
  assert.equal(matches[0].surface, 'Clay');
  assert.equal(matches[0].qualifying, true);
  assert.equal(matches[0].server, 1);
  assert.deepEqual(matches[0].points, { a: '40', b: '30' });
  assert.equal(matches[0].current.a, 4);
});

test('sloučení doplní podání z 365 a nechá Challenger', () => {
  const espnMatches = parseEspnScoreboard(espn, 'atp');
  const extra = parse365Payload({
    countries: [],
    competitions: [
      { id: 1, countryId: 88, name: 'Shanghai' },
      { id: 2, countryId: 301, name: 'Cali' },
    ],
    games: [{
      id: 9,
      competitionId: 1,
      competitionDisplayName: 'ATP, Shanghai, Hard',
      startTime: '2026-10-18T14:00:00+02:00',
      statusGroup: 3,
      statusText: 'Set 2',
      homeCompetitor: { name: 'J. Sinner', inPossession: false },
      awayCompetitor: { name: 'C. Alcaraz', inPossession: true },
      stages: [
        { shortName: 'S1', homeCompetitorScore: 6, awayCompetitorScore: 4, isEnded: true },
        { shortName: 'S2', homeCompetitorScore: 4, awayCompetitorScore: 2, isLive: true },
        { shortName: 'Game', homeCompetitorScore: 15, awayCompetitorScore: 0 },
      ],
    }, {
      id: 10,
      competitionId: 2,
      competitionDisplayName: 'Challenger, Cali, Clay',
      startTime: '2026-10-18T20:00:00+02:00',
      statusGroup: 2,
      statusText: 'Scheduled',
      homeCompetitor: { name: 'Ana Player' },
      awayCompetitor: { name: 'Eva Player' },
      stages: [],
    }],
  });
  const merged = mergeMatches(espnMatches, extra);
  const live = merged.find((match) => match.players[0].name === 'Jannik Sinner');
  assert.equal(live.server, 2);
  assert.deepEqual(live.points, { a: '15', b: '0' });
  assert.ok(live.sources.includes('espn') && live.sources.includes('365scores'));
  assert.ok(merged.some((match) => match.tour === 'challenger'));
});

test('API-Tennis bere jen challengerovou dvouhru', () => {
  const matches = parseApiTennisEvents([{
    event_key: '1',
    event_date: '2026-10-19',
    event_time: '14:00',
    event_first_player: 'A. Tester',
    event_second_player: 'B. Tester',
    first_player_key: '10',
    second_player_key: '11',
    event_type_type: 'Challenger Men Singles',
    tournament_name: 'Brno Challenger Men',
    event_status: 'Set 1',
    event_live: '1',
    event_game_result: '30 - 15',
    event_serve: 'Second Player',
    scores: [{ score_first: '3', score_second: '2', score_set: '1' }],
    statistics: [
      { player_key: '10', stat_period: 'match', stat_name: 'Aces', stat_value: '4' },
      { player_key: '11', stat_period: 'match', stat_name: 'Aces', stat_value: '1' },
    ],
  }, {
    event_key: '2',
    event_type_type: 'Atp Singles',
    event_first_player: 'X',
    event_second_player: 'Y',
    event_date: '2026-10-19',
  }]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].server, 2);
  assert.equal(matches[0].stats[0].a, '4');
  assert.equal(matches[0].stats[0].b, '1');
});

test('žebříček a jména', () => {
  const rows = parseRankings({ rankings: [{ ranks: [{ current: 1, previous: 2, points: 11000, athlete: { displayName: 'Jannik Sinner', id: '1' } }] }] });
  assert.equal(rows[0].rank, 1);
  assert.equal(playerKey('Jannik Sinner'), playerKey('J. Sinner'));
  assert.equal(samePlayers('Jannik Sinner', 'Carlos Alcaraz', 'C. Alcaraz', 'J. Sinner'), true);
  const favorite = rankProbability(1, 20);
  assert.ok(favorite > 0.75);
});

test('bodový model drží předzápasovou šanci a reaguje na sety', () => {
  const tied = markovWin(0.62, { sa: 0, sb: 0, ga: 0, gb: 0, aPts: 0, bPts: 0, tbA: 0, tbB: 0, inTB: false }, 3, 0, false);
  assert.ok(Math.abs(tied - 0.62) < 0.02, tied);
  const ahead = markovWin(0.5, { sa: 1, sb: 0, ga: 5, gb: 2, aPts: 3, bPts: 0, tbA: 0, tbB: 0, inTB: false }, 3, 1, false);
  assert.ok(ahead > 0.8, ahead);
  const over = liveMarkov({
    status: 'live',
    gender: 'M',
    bestOf: 3,
    server: 0,
    sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }],
    current: null,
    points: null,
  }, 0.4);
  assert.ok(over > 0.95, over);
});

test('pražský kalendář přičítá dny', () => {
  assert.equal(addDays('2026-10-18', 1), '2026-10-19');
  assert.match(pragueYMD(Date.parse('2026-10-18T23:30:00Z')), /^2026-10-19$/);
});
