// Pure helpers for the Save / Load menus (frontier F1.6b). No DOM here, so Node can test them.
import { isAutosave, validName } from './save_store.js';

// Default name box text: "Day 3, yakuza"
export const defaultLabel = (day, clan) => `Day ${day ?? '?'}, ${clan ?? 'player'}`;
// File name from what the player typed: lower case, a-z 0-9 _ - only, at most 40 characters
export function slug(label) {
  const s = String(label ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return s || 'save';
}
// Newest first; ties keep the list order
export const sortSaves = headers => headers.map((h, i) => [h, i])
  .sort((a, b) => String(b[0].savedAt).localeCompare(String(a[0].savedAt)) || a[1] - b[1]).map(x => x[0]);
export function rowText(h) {
  const when = h.savedAt ? new Date(h.savedAt).toLocaleString() : '';
  const tag = isAutosave(h.name) ? 'Dawn · ' : '';
  return `${tag}${h.label || h.name} · ${h.clan ?? ''} · day ${h.day ?? '?'} · ${h.mode ?? ''} · ${when}`;
}
// Saving over an existing file asks first
export const willOverwrite = (headers, name) => headers.some(h => h.name === name);
// Continue = newest save of any kind
export const newest = headers => sortSaves(headers)[0] ?? null;

// Settings loads rebuild the whole presentation, just like a main-menu load. Carry only
// the server save name across navigation, never a second copy of the saved simulation.
export function saveLoadURL(name, currentURL) {
  if (!validName(name)) throw new Error('Bad save name');
  const url = new URL(currentURL); url.search = ''; url.hash = '';
  url.searchParams.set('load', name);
  return url.href;
}
export function saveFromURL(currentURL) {
  const name = new URL(currentURL).searchParams.get('load');
  if (name !== null && !validName(name)) throw new Error('Bad save name');
  return name;
}
