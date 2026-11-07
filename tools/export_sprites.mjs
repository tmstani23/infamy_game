// Batch-exports spritesheets: each character model with its own animation set.
//
//   node tools/export_sprites.mjs              (every model)
//   node tools/export_sprites.mjs . thug brute (only these models)
//   add --glow-only to write just the weapon glow sheets and keep the colour sheets
//   add --clip=arms_hip_hop_dance to render only that named clip
//   add --pack to repack just these models into the live catalog afterwards
//       (tools/repack_model.mjs; --margin=N passes through)
//   add --portrait for the character-page portrait: the idle from art.json, front
//       row only (row 7) at 512 px, to assets/sprites/portraits/; with --pack it goes
//       to assets/sprites_packed/portraits/ (render/hero_preview.js loads it)
// Before a sheet is overwritten the old one is copied to
// assets/sprites_archive/<date>_<model>/ (once per day per file).
//
// Reads   assets/models/*.fbx      (rigged characters with skin; models/source is ignored)
//         assets/animations/**.fbx (Mixamo clips without skin)
// Writes  assets/sprites/<model>_<animation>.png  (overwrites earlier exports)
//         assets/sprites/<model>_<animation>_glow.png  for models holding an item:
//         the weapon alone as a soft white halo at half size, tinted in the game (data/weapon_glow.json)
//
// Animation files belong to a set by their subfolder, e.g.
// animations/brawler/Walking.fbx is the "walking" clip of the brawler set, with
// Mixamo's own filename. A filename prefix works too (animations/brawler_walk.fbx).
// Files directly in animations/ with no known prefix (the ronin's) count as the
// combat set. MODEL_SETS below says which sets each model gets; models not
// listed get DEFAULT_SETS.
// A variant file such as brawler/Mutant Walking.fbx is only for the models in
// VARIANTS; it replaces that model's plain brawler/Walking.fbx if there is one
// and is skipped for others.
//
// Held items (weapons, props) are models in assets/models/items/<file>.glb
// (or .fbx), attached to the hands as ITEMS says. "both" hands points the item
// from the right hand to the left hand in every frame (rifles, great swords);
// "right"/"left" rides on one hand. length is in character heights / 2
// (the character is 2 units tall), grip is where along the item the right
// hand holds it (0 = back end, 1 = front end). flip and roll fix a model that
// faces backwards or sits upside down; tune them in the sprite test page.
//
// Mounts and vehicles (MOUNTS below) are .glb files in assets/models/mounts/ with their
// clips baked in (tools/mounts_to_glb.py makes them from the Blender rigs). They keep
// their true size next to the characters (height is in world units, a character is 2),
// at the characters' pixel scale, in a bigger cell picked to fit every direction.
// Each sheet's cell size goes to assets/sprites/mounts.json (cellWorld and feetUp are the
// art.json characterFraming values for that model).
//   node tools/export_sprites.mjs . mare omnibus   (only these; mounts are part of a full run too)
//
// It drives look_tests/sprite_render_test.html in headless Chromium, so the
// sheets match what that page shows. Needs Node and Playwright once:
//   npm install playwright && npx playwright install chromium

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { KURODA_SPRITES, KURODA_FRAMING } from './kuroda_sprite_config.mjs';
import { TANK_SPRITES } from './tank_sprite_config.mjs';

const SETS = ['combat', 'brawler', 'gunner', 'civilian', 'ninja', 'archer'];
const MODEL_SETS = {
  ronin: ['combat'],
  swordsman: ['combat'],
  kuroda_spearman: ['combat'],
  koruda_enforcer: ['combat'],
  shinobi_enforcer: ['ninja'],
  rival_yakuza: ['combat'],
  thug: ['brawler'],
  lookout: ['brawler'],
  demolitions: ['brawler'],
  lieutenant1: ['brawler'],
  bandit: ['brawler'],
  police: ['brawler'],
  brute: ['brawler'],
  mercenary: ['gunner'],
  merc: ['gunner'],
  ninja_leader: ['ninja'],
  ninja_grunt: ['ninja'],
  ninja_tanto: ['ninja'],
  archer: ['archer'],
};
const DEFAULT_SETS = ['civilian'];
const VARIANTS = { brute: 'mutant' };
// Size relative to the others (every model is normalized to the same height first)
const SCALE = { brute: 1.12 };
const ITEMS = {
  mercenary: { file: 'rifle', mode: 'both', length: 1.25, grip: 0.25 },
  ninja_leader: { file: 'ninjato', mode: 'right', length: 1.05, grip: 0.17, idleBack: { drop: -45, hand: 'left' } },   // 40% bigger (Tim 2026-10-20)
  // Two-handed swords: flip points the blade away from the left hand (left hand near the pommel)
  // hang: when the hands part (idles, walks) the sword hangs from the right hand along the leg
  // idleBack: one-hand blade in the palm, in idles and walks pointing back behind at drop degrees below level, negative = tip up; hand 'left' = the other hand (ninja, Tim 2026-10-20: left hand, 45° up)
  // runBack: while a clip named run plays the blade trails behind the hand, almost level (drop = degrees tip below level, roll 180 bows the curve upward)
  // proc = stylized weapon built in code by the sprite page (drawn blade, wrapped hilt, rim light); beats the image slab
  ronin: { file: 'katana', proc: 'katana', mode: 'both', length: 1.15, grip: 0.2, flip: true, hang: true, runBack: { drop: 12, roll: 180 } },
  swordsman: { file: 'katana', proc: 'katana', mode: 'both', length: 1.15, grip: 0.2, flip: true, hang: true, runBack: { drop: 12, roll: 180 } },
  rival_yakuza: KURODA_SPRITES.rival_yakuza.item,
  kuroda_spearman: KURODA_SPRITES.kuroda_spearman.item,
  ninja_grunt: { file: 'ninjato', mode: 'right', length: 1.05, grip: 0.17, idleBack: { drop: -45, hand: 'left' } },   // 40% bigger (Tim 2026-10-20)
  ninja_tanto: { file: 'tanto', mode: 'right', length: 0.62, grip: 0.2, palmOffset: 0.08, idleBack: { drop: -45, hand: 'left', forward: true }, runBack: { drop: 5, roll: 0 } },
  archer: { file: 'bow', mode: 'left', length: 1.3, grip: 0.5 },
  // Brawlers swing clubs in the right hand (the brute's grows into a kanabo once it has a model)
  // dir = haft direction in the hand bone's frame (hammer grip: across the fist, head out of the thumb side)
  thug: { file: 'wooden_club', proc: 'club', mode: 'right', length: 0.95, grip: 0.15, dir: [0.92, 0.38, 0] },
  brute: { file: 'wooden_club', proc: 'club', mode: 'right', length: 1.0, grip: 0.15, dir: [0.92, 0.38, 0] },
  // Police: iron jitte in the right hand, same hammer grip as the clubs
  police: { file: 'jitte', proc: 'jitte', mode: 'right', length: 0.55, grip: 0.18, dir: [0.92, 0.38, 0] },
  // Rail gang (Tim 2026-11-07): the laborer body holding a sledge in the right hand, same hammer grip
  rail_worker: { file: 'hammer', proc: 'hammer', mode: 'right', length: 0.9, grip: 0.12, dir: [0.92, 0.38, 0] },
};
// Single clips borrowed from another set (path inside assets/animations)
const EXTRA = {
  swordsman: ['brawler/Walking.fbx'],
  rival_yakuza: ['brawler/Walking.fbx'],
  geisha: ['Arms Hip Hop Dance.fbx'],
  rail_worker: ['Great Sword Slash.fbx'],   // the hammer swing (overhead chop) until a proper pounding clip exists
  lieutenant1: ['Yelling Out.fbx'],   // talk clip for the gate dialogue (Tim OK 2026-11-06)
};
// Dedicated borrowed clips stay out of the root combat set.
// RIDE: the heroes' riding pose, for now the coachman's omnibus sitting clip (Tim 2026-11-06); art.json characters.<hero>.ride
const RIDE = { ronin: 'coach_sitting.fbx', ninja_leader: 'coach_sitting.fbx', rival_yakuza: 'coach_sitting.fbx' };
const EXTRA_ONLY = new Set(['Arms Hip Hop Dance.fbx', 'coach_sitting.fbx']);
// Name for the clip baked into the with-skin model file; null skips it
const BUILT_IN = { ronin: 'walk' };
// Mounts and vehicles: file in assets/models/mounts, height of the ref mesh (or the whole
// model) in world units (character = 2) or length (longest side, for boats), pxPerUnit = sheet resolution, merge = play all clips of a grouped scene as one,
// yaw = degrees to turn the model (default 180: Blender .glb exports face -Z). Heights by eye (2026-11-06); tune here.
// wheels: vehicles whose wheels are fused into the model get them cut out and rebuilt as spinning
// spoked wheels (sprite_render_test.html addWheels). Numbers are Blender coordinates read off the model.
// tilt: turn one part about a pivot so it meets the ground (the rickshaw hung level from the puller's hands, wheels in the air).
// extra: more clips from animation-only .glb files of the same scene (the horse teams' gallop,
// assets/models/source/gallop_anim.py), each merged into one clip named by merge.
// supersample: render at that many times the size and draw down, for softer edges.
const MOUNTS = {
  mare: { file: 'mare.glb', height: 2.4 },
  mare_saddled: { file: 'mare_saddled.glb', height: 2.4, ref: '^black_beauty' },
  calico: { file: 'calico.glb', height: 2.3 },
  ox: { file: 'ox.glb', height: 2.0 },
  ox_cart: { file: 'ox_cart.glb', height: 2.0, ref: '^ox$', merge: 'walk', supersample: 2,
    wheels: { mesh: 'ox_cart', fwd: 1, axle: [0.372, 0.425], list: [[-1.145, 0.315, 0.316]], spokes: 12 } },
  rickshaw: { file: 'rickshaw.glb', height: 2.0, ref: '^node_0', merge: 'walk', yaw: 0, supersample: 2,
    wheels: { mesh: 'rickshaw', fwd: -1, axle: [0.00262, 0.0031], list: [[0.0097, 0.0071, 0.0033]], spokes: 10 },
    tilt: { mesh: 'rickshaw', about: [-0.0011, 0.0057], degrees: -24 } },   // built around the Mixamo driver, who faces +Z
  omnibus: { file: 'omnibus.glb', height: 2.4, ref: '^black_beauty', merge: 'walk', supersample: 2,
    extra: [{ file: 'omnibus_gallop.glb', merge: 'gallop' }],
    wheels: { mesh: 'omnibus_body', fwd: 1, axle: [0.133, 0.172], list: [[-0.222, 0.108, 0.108], [0.209, 0.095, 0.087]], spokes: 10 } },
  // Horse-drawn rickshaw (Tim 2026-11-06): the black mare in the black rickshaw's stretched shafts, no puller
  // (assets/models/source/rickshaw_horse_rig/rickshaw_horse.py). Wheel numbers are in the scene's Blender coordinates.
  rickshaw_horse: { file: 'rickshaw_horse.glb', height: 2.4, ref: '^black_beauty', merge: 'walk', supersample: 2,
    extra: [{ file: 'rickshaw_horse_gallop.glb', merge: 'gallop' }],
    wheels: { mesh: 'rickshaw', fwd: 1, axle: [0.133, 0.195], list: [[-0.889, 0.179, 0.181]], spokes: 10 } },
  // Cannons: 'fire' = recoil only; muzzle flash and smoke are separate effects (Tim 2026-11-06)
  cannon_field: { file: 'cannon_field.glb', height: 1.3, merge: 'fire', yaw: 90 },   // muzzle along Blender -X
  cannon_wooden: { file: 'cannon_wooden.glb', height: 1.2, merge: 'fire', yaw: 90 },
  // Boats (hull cut at the waterline; the game draws the water): sized by hull length, and at half the
  // characters' pixel scale (pxPerUnit) so the big hulls stay a sane sheet size; fps 6 halves their frames (art.json plays them at speed 0.5; Tim 2026-11-06). Wake and spray come later as effects.
  boat_river: { file: 'boat_river.glb', length: 6, yaw: 90, pxPerUnit: 160 / 3 , fps: 6 },
  ship_coastal: { file: 'ship_coastal.glb', length: 12, yaw: 90, pxPerUnit: 80 / 3 , fps: 6 },
  ship_war: { file: 'ship_war.glb', length: 16, yaw: 90, pxPerUnit: 80 / 3 , fps: 6 },
};

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const flags = process.argv.slice(3).filter(s => s.startsWith('--'));
const only = process.argv.slice(3).filter(s => !s.startsWith('--')).map(s => s.toLowerCase());
const glowOnly = flags.includes('--glow-only');
const onlyClips = flags.filter(s => s.startsWith('--clip=')).map(s => s.slice(7).toLowerCase());
const portrait = flags.includes('--portrait'), pack = flags.includes('--pack');
const PORTRAIT_SIZE = 512, PORTRAIT_ROW = 7;
const artCatalog = JSON.parse(fs.readFileSync(path.join(root, 'game', 'data', 'art.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const exported = new Set();
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const page_url = pathToFileURL(path.join(root, 'look_tests', 'sprite_render_test.html')).href;
const fbx = dir => fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /\.fbx$/i.test(f)).map(f => path.join(dir, f)).sort()
  : [];
const base = f => path.basename(f).replace(/\.fbx$/i, '');
const setOf = f => {
  const dir = path.basename(path.dirname(f)).toLowerCase();
  if (SETS.includes(dir)) return dir;
  const m = base(f).toLowerCase().match(/^([a-z]+)_/);
  return m && SETS.includes(m[1]) ? m[1] : 'combat';
};
// Clip name from a file: set prefix and a trailing _noskin tag dropped
const clipOf = f => safe(base(f)).replace(new RegExp(`^(${SETS.join('|')})_`), '').replace(/_no_?skin$/, '');
const safe = s => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase();

let models = fbx(path.join(root, 'assets', 'models')).map(file => ({ file, name: safe(base(file)) }));
// A second weapon variant reuses the same rig, with independent sheet names.
const grunt = models.find(m => m.name === 'ninja_grunt');
if (grunt) models.push({ file: grunt.file, name: 'ninja_tanto' });
const swordsman = models.find(m => m.name === 'swordsman');
if (swordsman) models.push({ file: swordsman.file, name: 'kuroda_spearman' });
const laborerM = models.find(m => m.name === 'laborer');
if (laborerM) models.push({ file: laborerM.file, name: 'rail_worker' });   // laborer body + sledge for the rail gang
if (only.length) models = models.filter(m => only.includes(m.name));
const animDir = path.join(root, 'assets', 'animations');
const anims = [...fbx(animDir), ...SETS.flatMap(s => fbx(path.join(animDir, s)))].filter(a => !EXTRA_ONLY.has(path.basename(a)));
const outDir = path.join(root, 'assets', 'sprites');
fs.mkdirSync(outDir, { recursive: true });

const mountDir = path.join(root, 'assets', 'models', 'mounts');
let mounts = Object.entries(MOUNTS).filter(([n, m]) => fs.existsSync(path.join(mountDir, m.file)));
if (only.length) mounts = mounts.filter(([n]) => only.includes(n));
if (portrait) mounts = [];
if (!models.length && !mounts.length) { console.log('No models in assets/models'); process.exit(1); }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
let written = 0;
try {
for (const { file: model, name } of models) {
  const sets = MODEL_SETS[name] || DEFAULT_SETS;
  const variant = VARIANTS[name];
  const spearConfig = KURODA_SPRITES[name] || TANK_SPRITES[name];
  const allVariants = [...new Set(Object.values(VARIANTS))];
  const variantOf = a => allVariants.find(v => clipOf(a).startsWith(v + '_'));
  // Rename a clip by dropping this model's variant prefix (mutant_walk -> walk)
  const clipName = c => variant && c.startsWith(variant + '_') ? c.slice(variant.length + 1) : c;
  let mine = anims.filter(a => sets.includes(setOf(a)) && (!variantOf(a) || variantOf(a) === variant));
  const overridden = new Set(mine.filter(a => variant && variantOf(a) === variant).map(a => setOf(a) + ':' + clipName(clipOf(a))));
  mine = mine.filter(a => variantOf(a) || !overridden.has(setOf(a) + ':' + clipOf(a)));
  if (spearConfig) mine = Object.values(spearConfig.clips).map(f => path.join(animDir, f));
  for (const e of [...(spearConfig ? [] : EXTRA[name] || []), ...(RIDE[name] ? [RIDE[name]] : [])]) {
    const f = path.join(animDir, e);
    if (fs.existsSync(f)) mine.push(f); else console.log(`  missing extra clip ${e}`);
  }
  // Portrait: only the idle clip named in art.json (e.g. ronin_breathing_idle -> breathing_idle)
  const idleEntry = artCatalog.characters?.[name]?.idle;
  const wanted = portrait ? (idleEntry ? [(idleEntry.file || idleEntry).replace(name + '_', '')] : []) : onlyClips;
  if (portrait && !wanted.length) { console.log(`${name}: no idle in art.json, no portrait`); continue; }
  if (wanted.length) mine = mine.filter(a => wanted.includes(clipName(clipOf(a))));
  const builtIn = !wanted.length || wanted.includes(BUILT_IN[name]) ? BUILT_IN[name] ?? null : null;
  if (!mine.length && !builtIn) { console.log(`${name}: no animations in set(s) ${sets.join(', ')}, skipped`); continue; }

  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  page error:', e.message));
  page.on('console', m => /hips travel/.test(m.text()) && console.log('   ', m.text()));
  // Optional: serve three.js from a local copy when the CDN can't be reached
  if (process.env.THREE_LOCAL_DIR) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, r => r.fulfill({
      path: path.join(process.env.THREE_LOCAL_DIR, r.request().url().replace(/^.*three@[^/]+\//, '')),
      contentType: 'text/javascript',
    }));
  }
  await page.goto(page_url);
  await page.setInputFiles('#pick', [model, ...mine]);
  await page.waitForFunction(() => window.spriteTest?.ready(), null, { timeout: 300000 });
  await page.evaluate(s => window.spriteTest.setScale(s), SCALE[name] ?? 1);
  if (spearConfig) await page.evaluate(f => window.spriteTest.setFraming(f), KURODA_FRAMING);
  // Portrait: same framing, bigger frame; the glow blur grows with it so it reads the same
  const baseSize = await page.evaluate(() => Number(document.getElementById('size').value));
  if (portrait) await page.evaluate(s => { document.getElementById('size').value = String(s); }, PORTRAIT_SIZE);
  const renderOpts = portrait ? { rows: [PORTRAIT_ROW], blurScale: PORTRAIT_SIZE / baseSize } : {};
  const it = ITEMS[name] || TANK_SPRITES[name]?.item;
  if(it?.shield==='long')await page.evaluate(()=>window.spriteTest.loadLongShieldTexture());
  let holding = false;
  if (it?.proc) {
    holding = true;
    await page.evaluate(k => ['tonfa','kusarigama'].includes(k)?window.spriteTest.setTankItem(k):window.spriteTest.setProcItem(k), it.proc);
    await page.evaluate(o => window.spriteTest.setItemOptions(o), it);
    console.log(`  holding stylized ${it.proc}`);
  } else if (it) {
    const itemFile = ['glb', 'gltf', 'fbx'].map(e => path.join(root, 'assets', 'models', 'items', `${it.file}.${e}`)).find(f => fs.existsSync(f));
    if (itemFile) {
      await page.setInputFiles('#pickItem', itemFile);
      await page.waitForFunction(() => window.spriteTest.itemReady(), null, { timeout: 120000 });
      await page.evaluate(o => window.spriteTest.setItemOptions(o), it);
      holding = true;
      console.log(`  holding ${path.basename(itemFile)}`);
    } else console.log(`  no assets/models/items/${it.file}.glb yet, exporting empty-handed`);
  }
  const names = await page.evaluate(() => window.spriteTest.clipNames());
  console.log(`${name} (${sets.join(', ')}): ${names.length} animation(s)`);
  for (let i = 0; i < names.length; i++) {
    const isBuiltIn = /\(built in\)/.test(names[i]);
    if (isBuiltIn && !builtIn) continue;
    // <model>_<clip> with set and variant prefixes dropped, e.g. brute_walking.png from brawler/Mutant Walking.fbx
    const clip = isBuiltIn ? builtIn : clipName(safe(names[i]).replace(new RegExp(`^(${SETS.join('|')})_`), '').replace(/_no_?skin$/, ''));
    if (wanted.length && !wanted.includes(clip)) continue;
    const r = await page.evaluate(([i, g, o]) => window.spriteTest.render(i, g, o), [i, holding, renderOpts]);
    const fname = portrait ? `portraits/${name}_portrait_idle.png` : `${name}_${clip}.png`;
    fs.mkdirSync(path.dirname(path.join(outDir, fname)), { recursive: true });
    exported.add(name);
    // Never lose an old sheet: keep the first copy of the day
    const preserveOld = file => {
      if (!fs.existsSync(path.join(outDir, file))) return;
      const archive = path.join(root, 'assets', 'sprites_archive', `${today}_${name}`, path.dirname(file));
      fs.mkdirSync(archive, { recursive: true });
      const target = path.join(archive, path.basename(file));
      if (!fs.existsSync(target)) fs.copyFileSync(path.join(outDir, file), target);
    };
    if (!glowOnly) {
      preserveOld(fname);
      fs.writeFileSync(path.join(outDir, fname), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      console.log(`  ${fname}  (${r.frames} frames${r.duration ? `, ${r.duration.toFixed(3)} seconds, native playback speed ${(r.frames / (12 * r.duration)).toFixed(6)}` : ''})`);
      written++;
    }
    if (r.glowUrl) {
      const gname = fname.replace(/\.png$/, '_glow.png');
      preserveOld(gname);
      fs.writeFileSync(path.join(outDir, gname), Buffer.from(r.glowUrl.split(',')[1], 'base64'));
      console.log(`  ${gname}`);
      written++;
    }
  }
  await page.close();
}
const mountInfoFile = path.join(outDir, 'mounts.json');
const mountInfo = fs.existsSync(mountInfoFile) ? JSON.parse(fs.readFileSync(mountInfoFile, 'utf8')) : {};
for (const [name, cfg] of mounts) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  page error:', e.message));
  if (process.env.THREE_LOCAL_DIR) {
    await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, r => r.fulfill({
      path: path.join(process.env.THREE_LOCAL_DIR, r.request().url().replace(/^.*three@[^/]+\//, '')),
      contentType: 'text/javascript',
    }));
  }
  await page.goto(page_url);
  await page.waitForFunction(() => !!window.spriteTest);
  await page.evaluate(o => window.spriteTest.setMount(o), cfg);
  await page.setInputFiles('#pickMount', path.join(mountDir, cfg.file));
  await page.waitForFunction(() => window.spriteTest.ready(), null, { timeout: 300000 });
  for (const [k, x] of (cfg.extra || []).entries()) {   // more clips from animation-only .glb files of the same scene
    await page.setInputFiles('#pickExtra', path.join(mountDir, x.file));
    await page.waitForFunction(n => window.spriteTest.clipCount() >= n, k + 2, { timeout: 300000 });
  }
  const frame = await page.evaluate(px => window.spriteTest.autoFrame(px), cfg.pxPerUnit);
  if (cfg.fps) await page.evaluate(f => { document.getElementById('fps').value = String(f); }, cfg.fps);
  const names = await page.evaluate(() => window.spriteTest.clipNames());
  console.log(`${name} (mount): ${names.length} animation(s), ${frame.size} px cells` + (Math.abs(frame.groundShift) > 0.01 ? `, lowered ${frame.groundShift.toFixed(2)} to stand on the ground` : ''));
  if (process.env.MOUNT_MEASURE) { console.log('  lowest point per mesh:', JSON.stringify(await page.evaluate(() => window.spriteTest.meshLows()), (k, v) => typeof v === 'number' ? +v.toFixed(2) : v)); await page.close(); continue; }   // report framing only, render nothing
  for (let i = 0; i < names.length; i++) {
    const clip = safe(names[i]);
    if (onlyClips.length && !onlyClips.includes(clip)) continue;
    const r = await page.evaluate(i => window.spriteTest.render(i, false, {}), i);
    const fname = `${name}_${clip}.png`;
    const old = path.join(outDir, fname);
    if (fs.existsSync(old)) {
      const archive = path.join(root, 'assets', 'sprites_archive', `${today}_${name}`);
      fs.mkdirSync(archive, { recursive: true });
      if (!fs.existsSync(path.join(archive, fname))) fs.copyFileSync(old, path.join(archive, fname));
    }
    fs.writeFileSync(old, Buffer.from(r.dataUrl.split(',')[1], 'base64'));
    mountInfo[`${name}_${clip}`] = { size: frame.size, frames: r.frames, fps: cfg.fps || 12, cellWorld: +frame.worldPerCell.toFixed(3), feetUp: +frame.feetUp.toFixed(3) };
    console.log(`  ${fname}  (${r.frames} frames, ${r.duration.toFixed(3)} seconds)`);
    written++;
  }
  await page.close();
}
if (mounts.length) fs.writeFileSync(mountInfoFile, JSON.stringify(mountInfo, null, 2) + '\n');
} finally { await browser.close(); }
console.log(`Done: ${written} spritesheet(s) in assets/sprites`);
if (pack && exported.size) {
  const { execFileSync } = await import('child_process');
  const passOn = flags.filter(f => f.startsWith('--margin='));
  execFileSync(process.execPath, [path.join(root, 'tools', 'repack_model.mjs'), ...exported, ...passOn, ...(portrait ? ['--portrait'] : [])], { stdio: 'inherit', cwd: root });
}
