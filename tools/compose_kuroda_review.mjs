// Readable contact sheets composed exclusively from actual draft renders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'look_tests/kuroda_sprite_preview',process.argv[2]||'v3');
const require=createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/preview.cjs');
const sharp=require('sharp');
for(const model of ['rival_yakuza','kuroda_spearman']) {
  const layers=[], cell=192, width=1152;let top=0;
  for(const action of ['idle','walk','run','attack','sweep']) {
    const label=`${model==='rival_yakuza'?'KURODA HERO + SHIELD':'KURODA SPEARMAN'} — ${action.toUpperCase()} — WEST VIEW`;
    const header=Buffer.from(`<svg width="${width}" height="32"><rect width="${width}" height="32" fill="#242a34"/><text x="14" y="22" fill="#f0d49a" font-family="sans-serif" font-size="17">${label}</text></svg>`);
    layers.push({input:header,left:0,top});top+=32;
    const input=fs.readFileSync(path.join(dir,`${model}-${action}-sheet.png`));
    const row=await sharp(input).extract({left:0,top:2*cell,width,height:cell}).png().toBuffer();
    layers.push({input:row,left:0,top});top+=cell;
  }
  await sharp({create:{width,height:top,channels:4,background:'#626b78'}}).composite(layers).png().toFile(path.join(dir,`${model}-review.png`));
}
console.log(`Review boards: ${dir}`);
