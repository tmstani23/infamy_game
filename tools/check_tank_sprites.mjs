// Validate exported tank atlas dimensions, paired masks, catalog references and cell margins.
import {createRequire} from 'node:module';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/tmsta/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/check.cjs');
const sharp=require('sharp'),art=JSON.parse(readFileSync('game/data/art.json')),glow=JSON.parse(readFileSync('game/data/weapon_glow.json'));
let count=0;
for(const name of ['koruda_enforcer','shinobi_enforcer']){
 assert.ok(glow.models[name]);assert.equal(art.characterFraming[name].cellWorld,4.8);
 for(const descriptor of Object.values(art.characters[name])){
  const file=typeof descriptor==='string'?descriptor:descriptor.file,png=`assets/sprites/${file}.png`,mask=`assets/sprites/${file}_glow.png`;
  assert.ok(existsSync(png),png);assert.ok(existsSync(mask),mask);
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true}),m=await sharp(mask).metadata();
  assert.equal(info.height,2048);assert.equal(info.width%256,0);assert.equal(m.width,info.width/2);assert.equal(m.height,info.height/2);
  let touching=0;
  for(let row=0;row<8;row++)for(let frame=0;frame<info.width/256;frame++){
   let edge=false;
   for(let i=0;i<256;i++)for(const [x,y]of [[frame*256+i,row*256],[frame*256+i,(row+1)*256-1],[frame*256,row*256+i],[(frame+1)*256-1,row*256+i]])if(data[(y*info.width+x)*4+3]>16)edge=true;
   if(edge)touching++;
  }
  assert.equal(touching,0,`${file}: edge-touching poses`);count++;
 }
}
console.log(`Tank sprites: ${count} colour/glow pairs, eight directions, catalog links and no edge-touching colour poses passed`);
