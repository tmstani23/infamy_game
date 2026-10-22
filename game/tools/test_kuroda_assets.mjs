import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const data=f=>JSON.parse(readFileSync(new URL(`../${f}`,import.meta.url)));
const art=data('data/art.json'), glow=data('data/weapon_glow.json');
const sprite=f=>new URL(`../../assets/sprites/${f}.png`,import.meta.url);
const dimensions=file=>{const b=readFileSync(file);assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');return[b.readUInt32BE(16),b.readUInt32BE(20)];};
let count=0;
for(const model of ['rival_yakuza','kuroda_spearman']) {
  for(const action of ['idle','walk','run','attack','death'])assert.ok(art.characters[model][action]);
  assert.ok(glow.weapons[glow.models[model]], 'model has a valid weapon glow preset');
  assert.equal(art.characterFraming[model].cellWorld,4.8);
  for(const entry of Object.values(art.characters[model])) {
    const name=typeof entry==='string'?entry:entry.file;
    assert.ok(existsSync(sprite(name)),`${name}: missing colour sheet`);
    assert.ok(existsSync(sprite(name+'_glow')),`${name}: missing blade glow mask`);
    const [w,h]=dimensions(sprite(name)),[gw,gh]=dimensions(sprite(name+'_glow'));
    assert.equal(h,256*8);assert.equal(w%256,0);assert.ok(w<=8192);
    assert.equal(gw,w/2);assert.equal(gh,h/2);count++;
  }
}
assert.equal(art.characters.rival_yakuza.attack,'rival_yakuza_upward_thrust');
assert.equal(art.characters.kuroda_spearman.attack,'kuroda_spearman_bayonet_stab');
assert.equal(art.characters.rival_yakuza.sweep,'rival_yakuza_great_sword_slash');
assert.equal(art.characters.ronin.attack,'ronin_great_sword_slash','Ronin retains his own sword attack');
assert.notEqual(glow.models.rival_yakuza,glow.models.kuroda_spearman,'hero and recruit have distinct glow presets');
console.log(`Kuroda assets: ${count} action references, all 8-direction sheets/masks, padded framing, native thrust clips and distinct Ronin mapping passed`);
