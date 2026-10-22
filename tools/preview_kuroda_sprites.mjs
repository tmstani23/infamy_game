// Tim's pre-export review: real models/clips, draft sheets ONLY. No production
// file or art catalog is changed. Chromium is an offline asset renderer here.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KURODA_SPRITES as settings, KURODA_FRAMING } from './kuroda_sprite_config.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'look_tests/kuroda_sprite_preview', process.argv[2] || 'v1');
fs.mkdirSync(output, { recursive: true });
const require = createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/preview.cjs');
const { chromium } = require('playwright'), sharp = require('sharp');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--allow-file-access-from-files'] });
try {
  for (const [name, config] of Object.entries(settings)) {
    const modelClips = config.clips;
    const page = await browser.newPage();
    page.on('pageerror', e => process.stderr.write(`${e.message}\n`));
    page.on('requestfailed', r => process.stderr.write(`Asset load failed: ${r.url()} ${r.failure()?.errorText}\n`));
    await page.goto(pathToFileURL(path.join(root, 'look_tests/sprite_render_test.html')).href);
    await page.waitForFunction(() => window.spriteTest, null, { timeout: 60000 });
    await page.setInputFiles('#pick', [path.join(root, 'assets/models', config.model + '.fbx'),
      ...Object.values(modelClips).map(f => path.join(root, 'assets/animations', f))]);
    await page.waitForFunction(() => window.spriteTest.ready(), null, { timeout: 90000 });
    await page.evaluate(o => { window.spriteTest.setProcItem('spear'); window.spriteTest.setItemOptions(o); document.getElementById('maxf').value = 6; document.getElementById('size').value = 192; document.getElementById('zoom').value = 3/3.8; }, config.item);
    const names = await page.evaluate(() => window.spriteTest.clipNames());
    const composite = [], cell = 192, columns = 6;
    let row = 0;
    for (const [label, file] of Object.entries(modelClips)) {
      const pattern = path.basename(file, '.fbx').toLowerCase();
      const index = names.findIndex(n => n.toLowerCase() === pattern);
      if (index < 0) throw new Error(`Missing ${file}: ${names}`);
      const r = await page.evaluate(i => window.spriteTest.render(i, true), index);
      const raw = Buffer.from(r.dataUrl.split(',')[1], 'base64');
      fs.writeFileSync(path.join(output, `${name}-${label}-sheet.png`), raw);
      fs.writeFileSync(path.join(output, `${name}-${label}-glow.png`), Buffer.from(r.glowUrl.split(',')[1], 'base64'));
      // Four directions per clip, six poses sampled across the whole clip.
      const header = Buffer.from(`<svg width="1152" height="32"><rect width="1152" height="32" fill="#222732"/><text x="12" y="22" fill="#e6c88b" font-family="sans-serif" font-size="16">${label.toUpperCase()} — S / W / N / E (full 8-direction sheet saved separately)</text></svg>`);
      composite.push({ input: header, left: 0, top: row }); row += 32;
      for (const dir of [0,2,4,6]) {
        for (let f = 0; f < columns; f++) {
          const frame = Math.min(r.frames-1, f);
          const buffer = await sharp(raw).extract({ left: frame*cell, top: dir*cell, width: cell, height: cell }).png().toBuffer();
          composite.push({ input: buffer, left: f*cell, top: row });
        }
        row += cell;
      }
      console.log(`${name}: ${label}, ${r.frames} frames x 8 directions (draft only)`);
    }
    await sharp({ create: { width: cell*columns, height: row, channels: 4, background: '#505966' } })
      .composite(composite).png().toFile(path.join(output, `${name}-contact-sheet.png`));
    await page.close();
  }
  fs.writeFileSync(path.join(output, 'settings.json'), JSON.stringify({ previewOnly: true, awaitingUserApproval: true, ...KURODA_FRAMING, settings }, null, 2));
  console.log(`Draft sheets: ${output}. Production sprites untouched.`);
} finally { await browser.close(); }
