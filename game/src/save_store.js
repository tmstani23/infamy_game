// Save files (frontier plan F1.6). One small interface, swappable backends:
//   createSaveStore(backend) -> { list, write, read, remove, autosave }
// Backends: serverBackend (dev server /saves routes), browserBackend (download / upload a .json).
// A later desktopBackend (Steam build, OS user-data folder) only has to offer the same four calls.
// No game rules here and no DOM at import time, so Node tests can load it.
import { SAVE_VERSION, migrateSave } from './sim/save.js';

export const SAVE_FORMAT = 'infamy-save';
export const NAME_RE = /^[a-z0-9_-]{1,40}$/;
export const AUTOSAVES = 3;                       // dawns kept
export const autosaveName = n => `autosave_${n}`;
export const isAutosave = name => /^autosave_\d+$/.test(name);
export const validName = name => typeof name === 'string' && NAME_RE.test(name);

// Header fields come first in the file, `state` and `private` last, so list() can read just
// the start of each file (see headerOf).
export function makeFile(save, meta = {}) {
  const day = meta.day ?? save.state?.clock?.day ?? null;
  return {
    format: SAVE_FORMAT, version: save.version, gameVersion: meta.gameVersion ?? '0',
    savedAt: meta.savedAt ?? new Date().toISOString(), mode: meta.mode ?? 'classic',
    clan: meta.clan ?? 'player', day, label: String(meta.label ?? (day != null ? `Day ${day}, ${meta.clan ?? 'player'}` : 'Save')).slice(0, 80),
    tick: save.tick, state: save.state, private: save.private,
  };
}
const HEADER_KEYS = ['format', 'version', 'gameVersion', 'savedAt', 'mode', 'clan', 'day', 'label', 'tick'];
export const headerOf = file => Object.fromEntries(HEADER_KEYS.map(k => [k, file[k]]));
// Parse only the header out of the first chunk of a file's text
export function headerFromText(text) {
  const cut = text.indexOf(',"state":');
  if (cut < 0) return null;
  try { const h = JSON.parse(text.slice(0, cut) + '}'); return h.format === SAVE_FORMAT ? h : null; } catch { return null; }
}
// What the load menu shows for a save from another version
export function usable(file) {
  try { migrateSave(file); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; }
}

export function createSaveStore(backend) {
  const need = name => { if (!validName(name)) throw new Error('Bad save name'); };
  const store = {
    // headers only, newest first
    async list() { return (await backend.list()).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))); },
    async write(name, save, meta) { need(name); const file = makeFile(save, meta); await backend.write(name, file); return headerOf(file); },
    async read(name) { need(name); return backend.read(name); },
    async remove(name) { need(name); return backend.remove(name); },
    // dawn autosave: autosave_1 is newest; older ones shift down, the oldest drops off
    async autosave(save, meta) {
      const have = new Set((await backend.list()).map(h => h.name));
      for (let n = AUTOSAVES - 1; n >= 1; n--) {
        if (have.has(autosaveName(n))) await backend.write(autosaveName(n + 1), await backend.read(autosaveName(n)));
      }
      return store.write(autosaveName(1), save, { ...meta, label: meta?.label ?? `Dawn, day ${save.state?.clock?.day ?? '?'}` });
    },
  };
  return store;
}

// --- dev server backend (routes in game/saves_api.mjs) -----------------------------------
export function serverBackend(base = '/saves', fetchFn = globalThis.fetch?.bind(globalThis)) {
  const url = n => `${base}/${encodeURIComponent(n)}`;
  const ok = async r => { if (!r.ok && r.status !== 204) throw new Error(`Save server said ${r.status}`); return r; };
  return {
    async list() { return (await ok(await fetchFn(base))).json(); },
    async read(name) { return (await ok(await fetchFn(url(name)))).json(); },
    async write(name, file) { await ok(await fetchFn(url(name), { method: 'PUT', body: JSON.stringify(file) })); },
    async remove(name) { await ok(await fetchFn(url(name), { method: 'DELETE' })); },
  };
}

// --- no server: download / upload one .json file ---------------------------------------------
export function browserBackend(doc = globalThis.document) {
  return {
    async list() { return []; },   // a plain browser cannot browse a folder; Load uses read('')
    async write(name, file) {
      const a = doc.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
      a.download = `${name}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    read() {
      return new Promise((resolve, reject) => {
        const i = doc.createElement('input'); i.type = 'file'; i.accept = '.json,application/json';
        i.onchange = async () => { try { resolve(JSON.parse(await i.files[0].text())); } catch (e) { reject(e); } };
        i.click();
      });
    },
    async remove() { throw new Error('Delete the file yourself'); },
  };
}
