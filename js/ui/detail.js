/** Detail zápasu: sety, šance, graf, statistiky a vzájemné zápasy. */

import { surfaceLabel, tourLabel } from '../levels.js';
import { esc, formatTime, pct } from '../util.js';
import { probHtml, scoreHtml, statusHtml, tourTag } from './view.js';

const KIND = {
  model: 'LightGBM z projektu tenis',
  elo: 'Elo z projektu tenis',
  rank: 'rozdíl žebříčků',
  'live-ml': 'váhy živého modelu tenis, přepočet ze skóre',
  markov: 'bodový model navázaný na předzápasovou šanci',
  server: 'živý snímek zapsaný v repu tenis',
  none: 'zatím bez modelu',
};

function chart(points) {
  const usable = (points || []).filter((point) => point && point.p != null);
  if (usable.length < 2) return '';
  const width = 320;
  const height = 112;
  const pad = 10;
  const coords = usable.map((point, index) => {
    const x = pad + (index / (usable.length - 1)) * (width - pad * 2);
    const y = pad + (1 - Math.max(0, Math.min(1, point.p))) * (height - pad * 2);
    return [x, y];
  });
  const line = coords.map((pair, index) => `${index ? 'L' : 'M'}${pair[0].toFixed(1)},${pair[1].toFixed(1)}`).join(' ');
  const dots = coords.map((pair) => `<circle cx="${pair[0].toFixed(1)}" cy="${pair[1].toFixed(1)}" r="3.2" fill="#ff4f9a"></circle>`).join('');
  const labels = usable.map((point) => `<span>${esc(point.label || '')}</span>`).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Vývoj šance prvního hráče">
    <line x1="${pad}" y1="${height / 2}" x2="${width - pad}" y2="${height / 2}" stroke="rgba(255,255,255,.12)"></line>
    <path d="${line}" fill="none" stroke="#8b6cff" stroke-width="2.5" stroke-linejoin="round"></path>
    ${dots}
  </svg>
  <div class="legend">${labels}</div>`;
}

function setsTable(match) {
  const sets = [...(match.sets || [])];
  if (match.current && (match.status === 'live' || match.status === 'suspended')) sets.push(match.current);
  if (!sets.length) return '<p class="note">Skóre po setech ještě není.</p>';
  const heads = sets.map((_, index) => `<th>${index + 1}. set</th>`).join('');
  const row = (side) => sets.map((set) => `<td>${side === 0 ? set.a : set.b}</td>`).join('');
  return `<table class="sets"><thead><tr><th></th>${heads}<th>body</th></tr></thead>
    <tbody>
      <tr><td>${esc(match.players[0].name)}</td>${row(0)}<td>${match.points ? esc(match.points.a) : ''}</td></tr>
      <tr><td>${esc(match.players[1].name)}</td>${row(1)}<td>${match.points ? esc(match.points.b) : ''}</td></tr>
    </tbody></table>`;
}

function profileTable(match) {
  const profile = match.prediction?.profile;
  if (!profile) return '';
  const cell = (value) => (value == null ? '–' : `${Math.round(value * 1000) / 10} %`);
  return `<section class="card"><h3>Dlouhodobý profil</h3>
    <table class="stats">
      <tr><td>Body na podání</td><td>${cell(profile.a.spw)}</td><td>${cell(profile.b.spw)}</td></tr>
      <tr><td>Body na returnu</td><td>${cell(profile.a.rpw)}</td><td>${cell(profile.b.rpw)}</td></tr>
      <tr><td>Esa</td><td>${cell(profile.a.ace)}</td><td>${cell(profile.b.ace)}</td></tr>
      <tr><td>Dvojchyby</td><td>${cell(profile.a.df)}</td><td>${cell(profile.b.df)}</td></tr>
    </table>
    <p class="note">Podíl z modelu, ne statistika tohoto zápasu.</p>
  </section>`;
}

function matchStats(match) {
  if (!match.stats?.length) return '';
  return `<section class="card"><h3>Statistiky zápasu</h3>
    <table class="stats">${match.stats.map((row) => `<tr><td>${esc(row.name)}</td><td>${esc(row.a)}</td><td>${esc(row.b)}</td></tr>`).join('')}</table>
  </section>`;
}

function h2hBlock(match, state) {
  const record = match.prediction?.h2h;
  const modelLine = record && (record[0] || record[1]) ? `<p>Model: ${record[0]}–${record[1]} pro ${esc(match.players[0].short || match.players[0].name)}.</p>` : '';
  if (state.detailH2HFor !== match.id) return `<section class="card"><h3>Vzájemné zápasy</h3>${modelLine || '<p class="note">Načítám, pokud je zdroj nabízí.</p>'}</section>`;
  const rows = state.detailH2H || [];
  if (!rows.length && !modelLine) return '<section class="card"><h3>Vzájemné zápasy</h3><p class="note">Zdroj k tomuto zápasu vzájemné duely neposlal.</p></section>';
  return `<section class="card"><h3>Vzájemné zápasy</h3>${modelLine}
    ${rows.length ? `<ul class="h2h">${rows.slice(0, 8).map((row) => `<li><b>${esc(row.score || '–')}</b> ${esc(row.home)} – ${esc(row.away)}<br><span class="meta">${esc(row.tournament)} ${esc(String(row.when).slice(0, 10))}</span></li>`).join('')}</ul>` : ''}
  </section>`;
}

export function detailScreen(state) {
  const match = state.board?.matches?.find((item) => item.id === state.matchId);
  if (!match) return '<section class="empty">Tenhle zápas už v načteném okně není.</section>';
  const prediction = match.prediction;
  const live = match.status === 'live' || match.status === 'suspended';
  const shown = live ? prediction?.live : prediction?.pre;
  const samples = (match.predictionSamples || []).map((sample) => ({
    label: new Date(sample.t).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }),
    p: sample.p,
  }));
  const points = samples.length >= 2 ? samples : (prediction?.checkpoints || []);
  return `<article class="detail">
    <p class="meta">${tourTag(match.tour, match.badge)} ${esc(tourLabel(match.tour))}${match.qualifying ? ' · kvalifikace' : ''}</p>
    <h2>${esc(match.tournament)}</h2>
    <p class="meta">${esc([match.round, surfaceLabel(match.surface), match.court, formatTime(match.start)].filter(Boolean).join(' · '))}</p>
    <div class="card">
      <div class="rowstatus">${statusHtml(match)}<span>${match.server === 1 ? 'podává nahoře' : match.server === 2 ? 'podává dole' : ''}</span></div>
      <div class="line"><b>${esc(match.players[0].name)}</b>${scoreHtml(match, 0)}</div>
      <div class="line"><b>${esc(match.players[1].name)}</b>${scoreHtml(match, 1)}</div>
      ${setsTable(match)}
    </div>
    <section class="card">
      <h3>${live ? 'Šance teď' : 'Šance před zápasem'}</h3>
      <div class="bigp">
        <div>${shown == null ? '–' : pct(shown)}<small>${esc(match.players[0].short || match.players[0].name)}</small></div>
        <div>${shown == null ? '–' : pct(1 - shown)}<small>${esc(match.players[1].short || match.players[1].name)}</small></div>
      </div>
      ${probHtml(match)}
      ${live && prediction?.pre != null ? `<p class="note">Před zápasem ${pct(prediction.pre)} : ${pct(1 - prediction.pre)}.</p>` : ''}
      ${chart(points)}
      <p class="note">Předzápas: ${esc(KIND[prediction?.kind] || KIND.none)}. ${live ? `Živě: ${esc(KIND[prediction?.liveKind] || '')}.` : ''} Graf je šance prvního hráče.</p>
    </section>
    ${matchStats(match)}
    ${profileTable(match)}
    ${h2hBlock(match, state)}
    <p class="note">Zdroj skóre: ${esc((match.sources || []).join(', ') || '–')}.</p>
  </article>`;
}
