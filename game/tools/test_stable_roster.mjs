import assert from 'node:assert/strict';
import { syncChildren } from '../src/stable_list.js';
// Count structural mutations and simulate focus loss on a removed input. A
// stationary roster must survive arbitrarily many render frames without either.
let mutations=0, focus=null;
const parent={children:[],get lastChild(){return this.children.at(-1);},insertBefore(node,before){
  mutations++; const old=this.children.indexOf(node); if(old>=0)this.children.splice(old,1);
  this.children.splice(before?this.children.indexOf(before):this.children.length,0,node);
}};
const node=id=>({id,remove(){mutations++;if(focus===this)focus=null;parent.children.splice(parent.children.indexOf(this),1);}});
const a=node('crew-a'),b=node('crew-b'),c=node('crew-c');
syncChildren(parent,[a,b,c]);focus=b;mutations=0;
for(let frame=0;frame<600;frame++)syncChildren(parent,[a,b,c]);
assert.equal(mutations,0,'ordinary frames must not detach/reinsert roster controls');
assert.equal(focus,b,'an in-progress checkbox interaction keeps focus');
syncChildren(parent,[b,a,c]);assert.deepEqual(parent.children,[b,a,c]);assert.equal(focus,b);
syncChildren(parent,[b,c]);assert.deepEqual(parent.children,[b,c]);assert.equal(focus,b);
syncChildren(parent,[]);assert.equal(parent.children.length,0);
console.log('Stable roster: 600 unchanged frames perform zero structural mutations; regroup/removal preserve live controls');
