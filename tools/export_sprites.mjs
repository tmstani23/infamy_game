// Batch-exports spritesheets: each character model with its own animation set.
//
//   node tools/export_sprites.mjs              (every model)
//   node tools/export_sprites.mjs . thug brute (only these models)
//   add --glow-only to write just the weapon glow sheets and keep the colour sheets
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
// It drives look_tests/sprite_render_test.html in headless Chromium, so the
// sheets match what that page shows. Needs Node and Playwright once:
//   npm install playwright && npx playwright install chromium

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { KURODA_SPRITES, KURODA_FRAMING } from './kuroda_sprite_config.mjs';

const SETS = ['combat', 'brawler', 'gunner', 'civilian', 'ninja', 'archer'];
const MODEL_SETS = {
  ronin: ['combat'],
  swordsman: ['combat'],
  kuroda_spearman: ['combat'],
  rival_yakuza: ['combat'],
  thug: ['brawler'],
  lookout: ['brawler'],
  demolitions: ['brawler'],
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
};
// Single clips borrowed from another set (path inside assets/animations)
const EXTRA = {
  swordsman: ['brawler/Walking.fbx'],
  rival_yakuza: ['brawler/Walking.fbx'],
};
// Name for the clip baked into the with-skin model file; null skips it
const BUILT_IN = { ronin: 'walk' };

const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const flags = process.argv.slice(3).filter(s => s.startsWith('--'));
const only = process.argv.slice(3).filter(s => !s.startsWith('--')).map(s => s.toLowerCase());
const glowOnly = flags.includes('--glow-only');
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
if (only.length) models = models.filter(m => only.includes(m.name));
const animDir = path.join(root, 'assets', 'animations');
const anims = [...fbx(animDir), ...SETS.flatMap(s => fbx(path.join(animDir, s)))];
const outDir = path.join(root, 'assets', 'sprites');
fs.mkdirSync(outDir, { recursive: true });

if (!models.length) { console.log('No models in assets/models'); process.exit(1); }

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
let written = 0;
for (const { file: model, name } of models) {
  const sets = MODEL_SETS[name] || DEFAULT_SETS;
  const variant = VARIANTS[name];
  const spearConfig = KURODA_SPRITES[name];
  const allVariants = [...new Set(Object.values(VARIANTS))];
  const variantOf = a => allVariants.find(v => clipOf(a).startsWith(v + '_'));
  // Rename a clip by dropping this model's variant prefix (mutant_walk -> walk)
  const clipName = c => variant && c.startsWith(variant + '_') ? c.slice(variant.length + 1) : c;
  let mine = anims.filter(a => sets.includes(setOf(a)) && (!variantOf(a) || variantOf(a) === variant));
  const overridden = new Set(mine.filter(a => variant && variantOf(a) === variant).map(a => setOf(a) + ':' + clipName(clipOf(a))));
  mine = mine.filter(a => variantOf(a) || !overridden.has(setOf(a) + ':' + clipOf(a)));
  if (spearConfig) mine = Object.values(spearConfig.clips).map(f => path.join(animDir, f));
  for (const e of (spearConfig ? [] : EXTRA[name]) || []) {
    const f = path.join(animDir, e);
    if (fs.existsSync(f)) mine.push(f); else console.log(`  missing extra clip ${e}`);
  }
  const builtIn = BUILT_IN[name] ?? null;
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
  const it = ITEMS[name];
  let holding = false;
  if (it?.proc) {
    holding = true;
    await page.evaluate(k => window.spriteTest.setProcItem(k), it.proc);
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
    const r = await page.evaluate(([i, g]) => window.spriteTest.render(i, g), [i, holding]);
    // <model>_<clip> with set and variant prefixes dropped, e.g. brute_walking.png from brawler/Mutant Walking.fbx
    const clip = isBuiltIn ? builtIn : clipName(safe(names[i]).replace(new RegExp(`^(${SETS.join('|')})_`), '').replace(/_no_?skin$/, ''));
    const fname = `${name}_${clip}.png`;
    const preserveOld = file => {
      if (!spearConfig || !fs.existsSync(path.join(outDir, file))) return;
      const archive = path.join(root, 'assets/sprites_archive/2026-10-22_kuroda_spear');
      fs.mkdirSync(archive, { recursive: true });
      if (!fs.existsSync(path.join(archive, file))) fs.copyFileSync(path.join(outDir, file), path.join(archive, file));
    };
    if (!glowOnly) {
      preserveOld(fname);
      fs.writeFileSync(path.join(outDir, fname), Buffer.from(r.dataUrl.split(',')[1], 'base64'));
      console.log(`  ${fname}  (${r.frames} frames)`);
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
await browser.close();
console.log(`Done: ${written} spritesheet(s) in assets/sprites`);
