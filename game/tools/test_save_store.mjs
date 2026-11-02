// F1.6: save files. Runs the real server routes against a temp folder.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSaveStore, serverBackend, validName } from '../src/save_store.js';
import { SAVE_VERSION, migrateSave } from '../src/sim/save.js';
import { handleSaves } from '../saves_api.mjs';

const dir = join(mkdtempSync(join(tmpdir(), 'infamy-saves-')), 'saves');
const server = createServer(async (req, res) => { if (!(await handleSaves(req, res, dir))) res.writeHead(404).end(); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const store = createSaveStore(serverBackend(`${base}/saves`, fetch));
const fake = day => ({ version: SAVE_VERSION, tick: day * 100, state: { clock: { day }, big: Array(500).fill(day) }, private: { game: { seed: day } } });

try {
  // write, list (headers only), read back equal
  await store.write('mine', fake(2), { clan: 'yakuza', mode: 'classic', label: 'My save', gameVersion: '1' });
  const list = await store.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'mine'); assert.equal(list[0].label, 'My save'); assert.equal(list[0].day, 2);
  assert.ok(!('state' in list[0]) && !('private' in list[0]), 'list returns headers only');
  const back = await store.read('mine');
  assert.deepEqual(back.state, fake(2).state); assert.deepEqual(back.private, fake(2).private);
  assert.equal(back.format, 'infamy-save');
  // no .tmp left behind
  assert.ok(!readdirSync(dir).some(f => f.endsWith('.tmp')));

  // autosave rotation keeps exactly 3
  for (let d = 1; d <= 5; d++) await store.autosave(fake(d), { clan: 'yakuza' });
  const autos = (await store.list()).filter(h => h.name.startsWith('autosave_'));
  assert.deepEqual(autos.map(h => h.name).sort(), ['autosave_1', 'autosave_2', 'autosave_3']);
  assert.equal((await store.read('autosave_1')).state.clock.day, 5);
  assert.equal((await store.read('autosave_2')).state.clock.day, 4);
  assert.equal((await store.read('autosave_3')).state.clock.day, 3);

  // bad names are rejected in the store and by the server
  for (const bad of ['../x', 'a/b', 'A', '', 'x'.repeat(41), 'a.b']) assert.ok(!validName(bad), bad);
  await assert.rejects(() => store.write('../x', fake(1)), /Bad save name/);
  assert.equal((await fetch(`${base}/saves/..%2Fx`, { method: 'PUT', body: '{}' })).status, 400);
  assert.equal((await fetch(`${base}/saves/BAD`)).status, 400);

  // delete moves to _trash
  await store.remove('mine');
  assert.ok(!existsSync(join(dir, 'mine.json')));
  assert.equal(readdirSync(join(dir, '_trash')).filter(f => f.startsWith('mine-')).length, 1);
  assert.ok(!(await store.list()).some(h => h.name === 'mine'));

  // migrations: sample v1 -> v2, and an unknown version is refused with a message
  const mig = [{ from: 1, to: 2, run: s => { s.state.added = true; } }];
  const up = migrateSave({ version: 1, state: {}, private: {} }, { migrations: mig, target: 2 });
  assert.equal(up.version, 2); assert.equal(up.state.added, true);
  assert.throws(() => migrateSave({ version: SAVE_VERSION + 5, state: {} }), /different version/);
  assert.throws(() => migrateSave({ version: 0, state: {} }), /different version/);
  assert.throws(() => migrateSave(null), /different version/);
  assert.equal(migrateSave({ version: SAVE_VERSION, state: {} }).version, SAVE_VERSION);
} finally { server.close(); }
console.log('test_save_store: ok');
