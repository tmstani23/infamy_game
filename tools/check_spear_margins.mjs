// Offline asset check, not a browser test. Spot opaque pixels clipped at cell
// edges before putting a spear sheet into the game.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/preview.cjs');
const sharp=require('sharp'), dir=path.resolve(process.argv[2]);
let clipped=0;
let files=fs.readdirSync(dir).filter(f=>/sheet\.png$/.test(f)&&!/contact/.test(f));
if(process.argv.includes('--production')) {
  const art=JSON.parse(fs.readFileSync(path.resolve('game/data/art.json')));
  files=[...new Set(['rival_yakuza','kuroda_spearman'].flatMap(model=>Object.values(art.characters[model]).map(v=>(typeof v==='string'?v:v.file)+'.png')))];
}
for(const name of files) {
  const {data,info}=await sharp(path.join(dir,name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const cell=info.height/8, frames=info.width/cell;let cuts=0;
  for(let d=0;d<8;d++)for(let f=0;f<frames;f++) {
    let cut=false;
    for(let i=0;i<cell;i++)for(const [x,y] of [[f*cell,d*cell+i],[(f+1)*cell-1,d*cell+i],[f*cell+i,d*cell],[f*cell+i,(d+1)*cell-1]])
      if(data[(y*info.width+x)*4+3]>32)cut=true;
    if(cut)cuts++;
  }
  if(cuts) {console.log(`${name}: ${cuts}/${frames*8} poses touch a cell edge`);clipped+=cuts;}
}
console.log(`${clipped} poses touch an opaque edge`);
