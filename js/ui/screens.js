/** Seznamy: zápasy, žebříček, oblíbení, nastavení. */

import { isFavorite } from '../favorites.js';
import { addDays, esc, formatDayLabel, formatDayNumber, pragueYMD } from '../util.js';
import { groupMatches, matchCard, tourTag } from './view.js';

function onDay(match, day, today) {
  const played = pragueYMD(match.start);
  if (played === day) return true;
  return day === today && match.status === 'live';
}

export function matchesScreen(state) {
  const board = state.board;
  if (!board) {
    return `<section class="empty">${state.loading ? 'Načítám živé zápasy…' : 'Zatím tu nejsou žádná data.'}</section>`;
  }
  const today = board.today || pragueYMD();
  const days = [addDays(today, -1), today, addDays(today, 1)];
  const selected = days.includes(state.day) ? state.day : today;
  const tours = ['all', 'atp', 'wta', 'challenger'];
  const pool = board.matches.filter((match) => onDay(match, selected, today));
  const counts = {
    all: pool.length,
    atp: pool.filter((match) => match.tour === 'atp').length,
    wta: pool.filter((match) => match.tour === 'wta').length,
    challenger: pool.filter((match) => match.tour === 'challenger').length,
  };
  const visible = pool.filter((match) => state.tour === 'all' || match.tour === state.tour);
  const favRows = visible.filter((match) => match.players.some((player) => isFavorite(state.favorites, player.name)));
  const groups = groupMatches(visible);
  const banners = [];
  if (state.offline) banners.push('Offline. Ukazuji poslední uložené zápasy.');
  if (state.error) banners.push(state.error);
  if (board.challengerError && (state.tour === 'challenger' || state.tour === 'all')) banners.push(board.challengerError);
  for (const note of board.notes || []) {
    if (!banners.includes(note)) banners.push(note);
  }
  const body = !visible.length
    ? `<section class="empty">${state.tour === 'challenger' && board.challengerError ? 'Challenger teď nejde zobrazit.' : 'V tento den tu není žádný zápas zvoleného okruhu.'}</section>`
    : `${favRows.length ? `<p class="sectiontitle">Oblíbení</p>${favRows.map((match) => matchCard(match, state.favorites)).join('')}` : ''}
       ${groups.map((group) => `<section class="group"><h2><b>${tourTag(group.tour, group.badge)}${esc(group.tournament)}</b><span class="meta">${esc(group.surface)}</span></h2>${group.rows.map((match) => matchCard(match, state.favorites)).join('')}</section>`).join('')}`;
  return `${banners.map((text) => `<p class="banner">${esc(text)}</p>`).join('')}
    <div class="days" data-keep>
      ${days.map((day) => `<button type="button" data-day="${day}" class="${day === selected ? 'on' : ''}">${esc(formatDayLabel(day, today))}<small>${esc(formatDayNumber(day))}</small></button>`).join('')}
    </div>
    <div class="tours">
      ${tours.map((tour) => `<button type="button" data-tour="${tour}" class="${state.tour === tour ? 'on' : ''}">${tour === 'all' ? 'Vše' : tour === 'challenger' ? 'Challenger' : tour.toUpperCase()}<small>${counts[tour]}</small></button>`).join('')}
    </div>
    ${body}`;
}

export function headerHtml(state) {
  const board = state.board;
  const live = board?.matches?.filter((match) => match.status === 'live').length || 0;
  const when = board?.fetchedAt ? new Date(board.fetchedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' }) : '';
  if (state.route === 'detail') {
    return `<div class="brand"><button type="button" class="textbtn" data-back>← Zápasy</button><button type="button" class="iconbtn" data-go="nastaveni" aria-label="Nastavení">⚙</button></div>`;
  }
  const titles = { matches: 'Zápasy', rankings: 'Žebříček', favorites: 'Oblíbení', settings: 'Nastavení' };
  return `<div class="brand"><h1>TENIS <span>LIVE</span></h1><button type="button" class="iconbtn" data-go="nastaveni" aria-label="Nastavení">⚙</button></div>
    <p class="sub" id="status">${esc(titles[state.route] || '')}${when ? ` · ${when}` : ''}${live ? ` · živě ${live}` : ''}${state.predNote ? ` · ${state.predNote}` : ''}</p>`;
}

export function rankingsScreen(state) {
  const tour = state.rankTour === 'wta' ? 'wta' : 'atp';
  const rows = state.rankings[tour] || [];
  const query = state.rankQuery.trim().toLocaleLowerCase('cs');
  const shown = rows.filter((row) => !query || row.name.toLocaleLowerCase('cs').includes(query)).slice(0, 150);
  return `<div class="seg">
      <button type="button" data-ranktour="atp" class="${tour === 'atp' ? 'on' : ''}">ATP</button>
      <button type="button" data-ranktour="wta" class="${tour === 'wta' ? 'on' : ''}">WTA</button>
    </div>
    <input class="search" id="q" placeholder="Hledat hráče" value="${esc(state.rankQuery)}" autocomplete="off">
    ${state.rankError ? `<p class="banner">${esc(state.rankError)}</p>` : ''}
    ${shown.length ? shown.map((row) => rankRow(row, state)).join('') : '<p class="empty">Žebříček se načítá, nebo hledání nic nenašlo.</p>'}`;
}

function rankRow(row, state) {
  const fav = isFavorite(state.favorites, row.name);
  const delta = row.previous && row.rank ? row.previous - row.rank : 0;
  const move = delta > 0 ? `<span class="up">▲${delta}</span>` : delta < 0 ? `<span class="down">▼${Math.abs(delta)}</span>` : '<span class="meta">–</span>';
  const flag = row.flag ? `<img class="flag" alt="" src="${esc(row.flag)}">` : '<span class="flag"></span>';
  return `<div class="rank">
    <b>${row.rank}</b>
    ${flag}
    <span>${esc(row.name)}</span>
    <span class="meta">${row.points ? Math.round(row.points) : ''}</span>
    ${move}
    <button class="star ${fav ? 'on' : ''}" data-fav="${esc(row.name)}" aria-label="Oblíbený ${esc(row.name)}">${fav ? '★' : '☆'}</button>
  </div>`;
}

export function favoritesScreen(state) {
  if (!state.favorites.length) return '<section class="empty">Zatím nemáte oblíbené hráče. Hvězdička je připne na začátek seznamu zápasů.</section>';
  const related = (state.board?.matches || []).filter((match) => match.players.some((player) => isFavorite(state.favorites, player.name)));
  return `<ul class="card">${state.favorites.map((row) => `<li>${esc(row.name)} <button class="star on" data-fav="${esc(row.name)}" aria-label="Odebrat ${esc(row.name)}">★</button></li>`).join('')}</ul>
    ${related.length ? `<p class="sectiontitle">Jejich zápasy</p>${related.map((match) => matchCard(match, state.favorites)).join('')}` : '<p class="note">V okně včera až zítra nemají oblíbení hráči zápas.</p>'}`;
}

export function settingsScreen(state) {
  return `<section class="card">
    <h3>API-Tennis pro Challenger</h3>
    <p class="note">ATP a WTA jedou z ESPN, Challenger z veřejného 365scores. Klíč API-Tennis je záloha, když 365scores vypadne, a umí i statistiky zápasu. Uloží se jen v tomto prohlížeči, do repozitáře se nezapisuje.</p>
    <label class="field">Klíč
      <input id="api-key" type="password" autocomplete="off" value="${esc(state.settingsKey)}" placeholder="vložte klíč z api-tennis.com">
    </label>
    <div class="actions">
      <button type="button" class="textbtn" data-save-key>Uložit a načíst</button>
      <button type="button" class="textbtn" data-clear-key>Smazat klíč</button>
    </div>
  </section>
  <section class="card">
    <h3>O datech</h3>
    <p class="note">Časy jsou v Europe/Prague. Seznam se při živém zápase obnovuje asi každých 25 sekund. Predikce před zápasem je model LightGBM z veřejného projektu tenis, živá šance se z něj posouvá podle skóre. Když model není dostupný, použije se Elo nebo rozdíl žebříčků a bodový model.</p>
  </section>`;
}

export function navHtml(state) {
  if (state.route === 'detail') return '';
  const item = (route, label) => `<button type="button" data-go="${route}" class="${state.route === route ? 'on' : ''}">${label}</button>`;
  return `${item('zapasy', 'Zápasy')}${item('zebricek', 'Žebříček')}${item('oblibene', 'Oblíbené')}`;
}
