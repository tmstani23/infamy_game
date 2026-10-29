import assert from 'node:assert/strict';
import {bladeAxes,lightningPattern} from '../src/render/weapon_lightning_pattern.js';
// A distinct blade-only mask in each direction: ensure attachment follows the
// animation frame instead of a fixed position or a character-body outline.
const cell=32,frames=2,width=64,height=256,data=new Uint8Array(width*height*4);
for(let dir=0;dir<8;dir++)for(let f=0;f<frames;f++)for(let x=19;x<29;x++){
  const y=(f===0?10:23);data[((dir*cell+y)*width+f*cell+x)*4+3]=255;
}
const axes=bladeAxes(data,width,height,frames);
assert.equal(axes.length,16);
for(let d=0;d<8;d++){
  assert.ok(axes[d*2].tip.x>axes[d*2].base.x,'tip points away from body');
  assert.ok(axes[d*2].tip.y>axes[d*2+1].tip.y,'attachment follows changed animation pose');
}
assert.ok(bladeAxes(new Uint8Array(data.length),width,height,frames).every(a=>a===null),'empty mask never makes a free-floating bolt');
const axis={base:{x:0,y:0},tip:{x:1,y:0}},a=lightningPattern(axis,123,true),b=lightningPattern(axis,124,true);
assert.deepEqual(a,lightningPattern(axis,123,true),'same discharge seed keeps stable branches between frames');
assert.notDeepEqual(a,b,'new discharges have different natural paths');
for(const branch of a.slice(1)){
  assert.ok(a.some(other=>other!==branch&&other.points.some(p=>p.x===branch.points[0].x&&p.y===branch.points[0].y)),'fork starts on a parent channel');
  assert.ok(branch.width<a[0].width,'forks are thinner than main channel');
}
assert.ok(a.every(p=>p.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y))));
assert.deepEqual(lightningPattern({base:{x:0,y:0},tip:{x:0,y:0}},123),[],'foreshortened empty length is safe');
console.log('Weapon lightning: per-frame blade attachment, empty-mask safety, coherent varied branching and tapered forks passed');
