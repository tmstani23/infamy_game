// Actual FBX/sprite-export renders, kept outside production until Tim reviews.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { KURODA_SPRITES, KURODA_FRAMING } from './kuroda_sprite_config.mjs';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'look_tests/kuroda_sprite_preview/hero_blade_2026-10-28');
fs.mkdirSync(out, { recursive: true });
const require = createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/preview.cjs');
const { chromium } = require('playwright'), sharp = require('sharp');
const config = KURODA_SPRITES.rival_yakuza;
const previous = { ...config.item, proc: 'spear', length: 1.85, grip: .4 };
const draft = { ...config.item, proc: 'spear_hero', length: 2.05, grip: .36 };
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error(e.message));
  if (process.env.THREE_LOCAL_DIR) await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, r => r.fulfill({
    path: path.join(process.env.THREE_LOCAL_DIR, r.request().url().replace(/^.*three@[^/]+\//, '')), contentType: 'text/javascript',
  }));
  await page.goto(pathToFileURL(path.join(root, 'look_tests/sprite_render_test.html')).href);
  await page.waitForFunction(() => window.spriteTest, null, { timeout: 60000 });
  await page.setInputFiles('#pick', [path.join(root, 'assets/models/rival_yakuza.fbx'), ...['idle', 'attack'].map(a => path.join(root, 'assets/animations', config.clips[a]))]);
  await page.waitForFunction(() => window.spriteTest.ready(), null, { timeout: 90000 });
  await page.evaluate(f => { window.spriteTest.setFraming(f); document.getElementById('maxf').value = 6; }, KURODA_FRAMING);
  const names = await page.evaluate(() => window.spriteTest.clipNames());
  const renders = {};
  for (const [label, item] of [['Current', previous], ['Long blade draft', draft]]) {
    await page.evaluate(o => { window.spriteTest.setProcItem(o.proc); window.spriteTest.setItemOptions(o); }, item);
    renders[label] = {};
    for (const action of ['idle', 'attack']) {
      const i = names.findIndex(n => n.toLowerCase() === path.basename(config.clips[action], '.fbx').toLowerCase());
      const r = await page.evaluate(i => window.spriteTest.render(i, true), i);
      const raw = Buffer.from(r.dataUrl.split(',')[1], 'base64');
      const stem = `${label === 'Current' ? 'current' : 'draft'}-${action}`;
      fs.writeFileSync(path.join(out, `${stem}-sheet.png`), raw);
      fs.writeFileSync(path.join(out, `${stem}-glow.png`), Buffer.from(r.glowUrl.split(',')[1], 'base64'));
      renders[label][action] = raw;
    }
  }
  const cell = 256, width = 1024, layers = [];
  let top = 0;
  for (const [label, actions] of Object.entries(renders)) {
    const title = `${label} — actual sprite render: idle W / idle E / thrust W / thrust E`;
    layers.push({ input: Buffer.from(`<svg width="1024" height="36"><rect width="1024" height="36" fill="#171c26"/><text x="14" y="24" fill="#efcf91" font-family="sans-serif" font-size="18">${title}</text></svg>`), left: 0, top });
    top += 36;
    for (const [col, [action, dir, frame]] of [['idle',2,0],['idle',6,0],['attack',2,3],['attack',6,3]].entries()) {
      layers.push({ input: await sharp(actions[action]).extract({left:frame*cell,top:dir*cell,width:cell,height:cell}).png().toBuffer(), left:col*cell, top });
    }
    top += cell;
  }
  await sharp({create:{width,height:top,channels:4,background:'#414957'}}).composite(layers).png().toFile(path.join(out,'comparison.png'));
  // Actual thrust frames in motion; no generated or repainted artwork.
  const frames = [];
  for (let f=0;f<6;f++) {
    const parts=[];
    for (const [col, label] of ['Current','Long blade draft'].entries()) parts.push({input:await sharp(renders[label].attack).extract({left:f*cell,top:2*cell,width:cell,height:cell}).png().toBuffer(),left:col*cell,top:0});
    frames.push(await sharp({create:{width:512,height:256,channels:4,background:'#414957'}}).composite(parts).png().toBuffer());
  }
  await sharp(frames,{join:{animated:true}}).gif({delay:160,loop:0}).toFile(path.join(out,'thrust.gif'));
  fs.writeFileSync(path.join(out,'settings.json'), JSON.stringify({previewOnly:true,framing:KURODA_FRAMING,current:previous,draft},null,2));
  console.log(out);
} finally { await browser.close(); }
