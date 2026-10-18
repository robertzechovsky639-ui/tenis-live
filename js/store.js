/** Jednoduchý stav obrazovky. UI se překreslí při každé změně. */

const state = {
  route: 'matches',
  matchId: '',
  day: '',
  tour: 'all',
  board: null,
  loading: false,
  offline: false,
  error: '',
  favorites: [],
  rankings: { atp: [], wta: [] },
  rankTour: 'atp',
  rankQuery: '',
  rankError: '',
  predNote: '',
  settingsKey: '',
  detailH2H: null,
  detailH2HFor: '',
};

const listeners = new Set();

export function getState() {
  return state;
}

export function patch(partial) {
  Object.assign(state, partial);
  for (const listener of listeners) listener(state);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
