import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {loadPackedSheets, setSheetFrame} from '../src/render/packed_sheets.js';
import {createTextureCache} from '../src/render/texture_cache.js';
const base = new URL('../', import.meta.url);
const read = url => JSON.parse(fs.readFileSync(url));
const art = read(new URL('data/art.json', base)), glow = read(new URL('data/weapon_glow.json', base));
assert.deepEqual(Object.keys(art.packedCharacters).sort(), Object.keys(art.characters).sort());
let loads=0, checked=0;
const cache=createTextureCache(async url=>{
  loads++;
  const fd=fs.openSync(fileURLToPath(url),'r'), header=Buffer.alloc(24);
  try { fs.readSync(fd,header,0,24,0); } finally { fs.closeSync(fd); }
  return {image:{width:header.readUInt32BE(16),height:header.readUInt32BE(20)},dispose(){}};
});
const vector=()=>({v:[],set(...v){this.v=v;}});
const uniforms=()=>({uMap:{},uFrame:{value:vector()},uSampleBounds:{value:vector()}});
const models={};
for(const model of Object.keys(art.characters)){
  const url=new URL(art.packedCharacters[model],base).href;
  const manifest=read(new URL(url));
  const sheets=await loadPackedSheets({url,model,names:art.characters[model],requireGlow:!!glow.models[model],
    loadJson:async()=>manifest,loadTexture:u=>cache.acquire(u),releaseTexture:t=>cache.release(t)});
  models[model]=sheets;
  for(const [anim,sheet]of Object.entries(sheets)){
    const entry=art.characters[model][anim],stem=typeof entry==='string'?entry:entry.file;
    assert.equal(sheet.speed,typeof entry==='string'?1:entry.speed??1);
    for(const kind of ['color','glow']){
      const channel=manifest.sheets[stem][kind];if(!channel)continue;
      const u=uniforms();
      for(let i=0;i<channel.regions.length;i++){
        setSheetFrame(u,sheet,Math.floor(i/sheet.frames),i%sheet.frames,kind==='glow');
        const r=channel.regions[i];if(!r)continue;
        const p=channel.pages[r.page],[ox,oy,sx,sy]=u.uFrame.value.v;
        for(const [x,y]of [[0,0],[r.width-1,r.height-1]]){
          const px=(ox+(r.left+x+.5)/channel.cell*sx)*p.width;
          const py=(1-oy-(1-(r.top+y+.5)/channel.cell)*sy)*p.height;
          assert.ok(Math.abs(px-r.x-x-.5)<1e-7&&Math.abs(py-r.y-y-.5)<1e-7,`${model}/${anim}/${kind}/${i}`);
        }
        checked++;
      }
    }
  }
}
assert.equal(loads,530,'every unique page loads once across the full catalog');
assert.equal(models.brute.idle.tex,models.enforcer.idle.tex,'shared brute/enforcer assets share GPU texture');
assert.equal(models.geisha.idle.tex,models.shinobi_geisha.idle.tex,'civilian/crew variants share GPU texture');
let disposed=0,active=0,peak=0;
const bounded=createTextureCache(async()=>{peak=Math.max(peak,++active);await new Promise(r=>setTimeout(r,1));active--;return{dispose(){disposed++;}};},2);
const [a,b]=await Promise.all([bounded.acquire('same'),bounded.acquire('same')]);
assert.equal(a,b);bounded.release(a);assert.equal(disposed,0);bounded.release(b);assert.equal(disposed,1);
await Promise.all(Array.from({length:10},(_,i)=>bounded.acquire(String(i))));assert.ok(peak<=2);
console.log(`Packed catalog: ${Object.keys(models).length} models, ${loads} unique pages, ${checked} animation crop addresses, cross-model sharing, ownership and bounded loads passed`);
