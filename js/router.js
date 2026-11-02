import { state } from './state.js';

export function getRoute() {
  return state.route;
}

export function setRouteFromHash() {
  const hash = window.location.hash.replace('#', '').trim();
  if (hash) {
    state.route = hash;
  }
}
