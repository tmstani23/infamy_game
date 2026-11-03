// Current runtime biome map with readable region codes and authored overlays.
import fs from 'node:fs';
import sharp from 'sharp';
import {createPaint} from '../game/src/world_paint.js';
import {islandBiome} from '../game/src/sim/island_art.js';
const world=JSON.parse(fs.readFileSync('game/data/world.json'));
const cfg=JSON.parse(fs.readFileSync('game/data/world_paint.json'));
const P=createPaint(world,cfg),s=.12,left=80,top=100;
const colors={forest:'#72865b',plain:'#b6be7c',hills:'#aaa17e',marsh:'#788d7b',dry:'#cea063',snow:'#e7e9e4',bank:'#39566d',jungle:'#27765e',top_forest:'#77786b',top_snow:'#cdd4da',top_dry:'#ad7149'};
const esc=t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;');
const X=x=>left+x*s,Z=z=>top+z*s;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1840" height="1240"><rect width="100%" height="100%" fill="#eee5d0"/><style>text{font-family:Arial,sans-serif} .label{font-size:15px;font-weight:bold;paint-order:stroke;stroke:#eee5d0;stroke-width:4px;stroke-linejoin:round}</style><text x="80" y="42" font-size="27" font-weight="bold">Island biome map — current generator</text><text x="80" y="72" font-size="17">Region codes shown below • Jungle forest: 23, C6 forest terrain, C12 forest terrain • R4: dry mountains</text>`;
const counts={};
for(let j=0;j<world.terrain.rows.length;j++)for(let i=0;i<world.terrain.rows[j].length;i++){
 const x=(i+.5)*world.terrain.cell,z=(j+.5)*world.terrain.cell;
 const biome=P.biomes[P.gridAt(x,z)];counts[biome]=(counts[biome]||0)+1;
 svg+=`<rect x="${X(i*world.terrain.cell)}" y="${Z(j*world.terrain.cell)}" width="${world.terrain.cell*s+.1}" height="${world.terrain.cell*s+.1}" fill="${colors[biome]||colors.plain}"/>`;
}
for(const r of world.regions){const [a,b,c,d]=r.box;
 svg+=`<rect x="${X(a)}" y="${Z(b)}" width="${(c-a)*s}" height="${(d-b)*s}" fill="none" stroke="#333" stroke-opacity=".4" stroke-dasharray="7 6"/>`;
 let x=(a+c)/2,z=(b+d)/2;
 // Coast labels sit on the coastal land rather than at sea-box centers.
 if(r.id==='C6'){x=11000;z=7300;}if(r.id==='C12'){x=13200;z=5950;}
 const jungle=cfg.biomeAreas.some(a=>a.region===r.id&&a.biome==='jungle');
 svg+=`<text class="label" text-anchor="middle" x="${X(x)}" y="${Z(z)}">${r.id} ${esc(r.name)}</text>`;
 if(jungle)svg+=`<text class="label" text-anchor="middle" x="${X(x)}" y="${Z(z)+21}" fill="#145542">Jungle forest</text>`;
}
for(const r of world.ranges){const p=r.spine[Math.floor(r.spine.length/2)];svg+=`<text class="label" x="${X(p[0])+10}" y="${Z(p[1])-20}" fill="${r.biome==='dry'?'#7d3e1f':'#333'}">${r.id}${r.biome==='dry'?' Dry mountains':''}</text>`;}
const legend=[['plain','Plain'],['forest','Forest'],['jungle','Jungle forest'],['hills','Hills'],['marsh','Marsh'],['dry','Dry lowlands'],['snow','Snow'],['top_forest','Forest mountains'],['top_snow','Snow mountains'],['top_dry','Dry mountains'],['bank','Water / bank']];
legend.forEach(([k,label],i)=>{const x=80+(i%6)*285,y=1120+Math.floor(i/6)*40;svg+=`<rect x="${x}" y="${y}" width="22" height="22" fill="${colors[k]}"/><text x="${x+31}" y="${y+17}" font-size="17">${label}</text>`;});
svg+='</svg>';
const out='docs/images/frontier/blueprint/v2_biomes_current';fs.writeFileSync(out+'.svg',svg);await sharp(Buffer.from(svg)).png().toFile(out+'.png');
console.log('Rendered current biome map:',out+'.png',counts);
