// Saved HUD layouts (Tim 2026-11-16): server routes (layouts_api.mjs, saves/layouts, delete moves to to_delete) and the
// editor's Layout row (src/hud_layout.js: choose, Save as, Delete, Reset = Default, changes on Default go to "My layout").
// Run: node game/tools/test_layouts.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleLayouts } from '../layouts_api.mjs';

// ---- server ----
const root = await mkdtemp(join(tmpdir(), 'layouts-')), dir = join(root, 'saves', 'layouts'), trash = join(root, 'to_delete', 'layouts');
const server = createServer(async (req, res) => { if (!(await handleLayouts(req, res, dir, trash))) res.writeHead(404).end(); });
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`, url = n => `${base}/layouts/${encodeURIComponent(n)}`;
assert.deepEqual(await (await fetch(`${base}/layouts`)).json(), { names: [] });
assert.equal((await fetch(url('Big map'), { method: 'PUT', body: JSON.stringify({ panels: { hud: { dx: 5 } } }) })).status, 204);
assert.equal((await fetch(url('Tim'), { method: 'PUT', body: JSON.stringify({ panels: {} }) })).status, 204);
assert.deepEqual((await (await fetch(`${base}/layouts`)).json()).names, ['Big map', 'Tim']);
assert.deepEqual(await (await fetch(url('Big map'))).json(), { panels: { hud: { dx: 5 } } });
assert.equal((await fetch(url('Default'), { method: 'PUT', body: '{"panels":{}}' })).status, 400, 'Default is the shipped layout');
assert.equal((await fetch(url('../x'), { method: 'PUT', body: '{"panels":{}}' })).status, 400, 'no paths');
assert.equal((await fetch(url('Bad'), { method: 'PUT', body: '{"nope":1}' })).status, 400, 'only layouts');
assert.equal((await fetch(url('Tim'), { method: 'DELETE' })).status, 204);
assert.deepEqual((await (await fetch(`${base}/layouts`)).json()).names, ['Big map']);
assert.match((await readdir(trash))[0], /^Tim-\d+\.json$/, 'a deleted layout moves to to_delete');
assert.equal((await fetch(url('Tim'))).status, 404);
server.close();

// ---- editor ----
const { createHudLayout } = await import('../src/hud_layout.js');
class El { constructor(id = '') { this.id = id; } style = {}; children = []; handlers = {}; hidden = false; dataset = {}; attributes = {}; value = ''; innerHTML = '';
  classList = { toggle() {}, contains: () => false, remove() {} }; addEventListener(t, f) { (this.handlers[t] ||= []).push(f); }
  append(...c) { this.children.push(...c); } appendChild(c) { this.append(c); } after() {} setAttribute(k, v) { this.attributes[k] = v; } focus() {} blur() {}
  querySelector() { return null; } querySelectorAll() { return []; } get offsetWidth() { return 100; } get offsetHeight() { return 80; }
  getBoundingClientRect() { return { left: 100, top: 100, width: 100, height: 80, right: 200, bottom: 180 }; } }
const body = new El(), panel = new El('contract'); body.children.push(panel);
const ls = {}, puts = [], files = { Streaming: { contract: { dx: 300, dy: 40, ax: 'l', ay: 't' } } };
globalThis.document = { body, getElementById: id => id === 'contract' ? panel : null, createElement: () => new El() };
globalThis.localStorage = { getItem: k => ls[k] ?? null, setItem: (k, v) => { ls[k] = v; }, removeItem: k => { delete ls[k]; } };
globalThis.fetch = async (u, o = {}) => {
  const name = decodeURIComponent(String(u).replace(/^\/layouts\/?/, ''));
  if (!name) return { ok: true, json: async () => ({ names: Object.keys(files) }) };
  if (o.method === 'PUT') { files[name] = JSON.parse(o.body).panels; puts.push(name); return { ok: true }; }
  if (o.method === 'DELETE') { const had = name in files; delete files[name]; return { ok: had }; }
  return files[name] ? { ok: true, json: async () => ({ panels: files[name] }) } : { ok: false };
};
globalThis.addEventListener = () => {}; globalThis.ResizeObserver = class { observe() {} }; globalThis.innerWidth = 1200; globalThis.innerHeight = 900;
const seen = [];
const L = createHudLayout({ fromFile: {}, defaults: { contract: { dx: 10, dy: 10, ax: 'l', ay: 't' } }, current: 'Default', onLayouts: x => seen.push(x) });
await L.refresh();
assert.deepEqual(L.layouts(), ['Default', 'Streaming']); assert.equal(L.current(), 'Default');
assert.equal(seen.at(-1).current, 'Default', 'Settings hears the list');
assert.equal(await L.choose('Streaming'), true); assert.equal(L.current(), 'Streaming'); assert.equal(ls['infamy.hudLayout.current.v1'], 'Streaming', 'remembered');
assert.equal(await L.saveAs('Big map'), true); assert.deepEqual(files['Big map'], files.Streaming); assert.equal(L.current(), 'Big map');
assert.equal(await L.saveAs('default'), false, 'Default cannot be saved over'); assert.equal(await L.saveAs('a/b'), false);
assert.equal(await L.remove('Big map'), true); assert.equal(L.current(), 'Default', 'deleting the one in use goes back to Default'); assert.ok(!('Big map' in files));
L.reset(); assert.equal(L.current(), 'Default');
// a change made on Default is saved as "My layout", never over the shipped file
L.begin(); L.done();
assert.equal(puts.at(-1), 'My layout'); assert.equal(L.current(), 'My layout'); assert.ok(L.layouts().includes('My layout'));
// Cancel goes back to the layout used when editing started
L.begin(); await L.choose('Streaming'); L.cancel(); assert.equal(L.current(), 'My layout');
console.log('test_layouts: ok');
