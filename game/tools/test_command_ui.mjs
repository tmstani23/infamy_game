import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createUtilityMenu} from '../src/utility_menu.js';
import {createWarLanternButton} from '../src/war_lantern_button.js';
import {bindFullscreen} from '../src/fullscreen.js';
class Node {
  children=[];attrs={};dataset={};style={};handlers={};textContent='';title='';offsetWidth=120;offsetHeight=110;
  classList={add(){}};
  constructor(id){this.id=id;}
  appendChild(n){this.children.push(n);}
  setAttribute(k,v){this.attrs[k]=v;}
  getAttribute(k){return this.attrs[k];}
  addEventListener(k,f){this.handlers[k]=f;}
  blur(){}
}
{
  const root=new Node(),anchor=new Node(),buttons=['deploymentbtn','pausebtn','fullscreenbtn'].map(id=>new Node(id));
  let reads=0;anchor.style.cssText='';anchor.getBoundingClientRect=()=>{reads++;return {left:900,bottom:700};};
  buttons[0].textContent='Map & deployment (M)';buttons[1].textContent='Pause (`)';buttons[2].textContent='Fullscreen (Alt+Enter)';
  const win={innerWidth:1200,innerHeight:800},menu=createUtilityMenu({root,anchor,buttons,win});
  assert.equal(root.children.length,3);assert.match(buttons[0].getAttribute('aria-label'),/Map.*M/);
  for(let i=0;i<100;i++)menu.update();assert.equal(reads,1,'stationary icon menu does not force layout per frame');
  buttons[1].textContent='Resume (`)';buttons[1].setAttribute('aria-pressed','true');menu.update();
  assert.equal(buttons[1].dataset.icon,'▶');assert.match(buttons[1].getAttribute('aria-label'),/Resume/);
  anchor.style.cssText='left:30px';menu.update();assert.equal(reads,2,'menu tracks moved Ryo badge');
  win.innerWidth=800;menu.update();assert.equal(reads,3,'viewport resize repositions menu');
}
{
  const button=new Node(),sent=[],state={entities:{h:{owner:'p',place:'street',x:0,z:0}},clans:{p:{lanterns:0}},businesses:{m:{id:'m',kind:'moneylender',ring:[0,0]},r:{id:'r',kind:'shop',ring:[10,10]}}};
  const game={state,businesses:{canBuyLantern:()=>({ok:true,price:1200}),canRaid:()=>({ok:state.clans.p.lanterns>0,why:'Need a War Lantern'})}};
  const control=createWarLanternButton({button,game,heroId:'h',send:c=>sent.push(c)});
  button.handlers.click();assert.deepEqual(sent.pop(),{id:'h',type:'business',action:'lantern',business:'m'});
  Object.assign(state.entities.h,{x:10,z:10});control.update();assert.equal(button.disabled,true);button.handlers.click();assert.equal(sent.length,0);
  state.clans.p.lanterns=1;control.update();button.handlers.click();assert.equal(sent.pop().action,'raid');
  state.entities.h.place='room';control.update();assert.equal(button.disabled,true,'no interior teleport raid');
}
for(const mode of ['new-api','unsupported-option','ignored-option','denied']){
  const events={},docEvents={},button=new Node(),doc={fullscreenElement:null,fullscreenEnabled:true,addEventListener(k,f){docEvents[k]=f;}},win={navigator:{},addEventListener(k,f){events[k]=f;}};
  let requests=0;
  doc.documentElement={async requestFullscreen(options){requests++;if(mode==='new-api')assert.equal(options.keyboardLock,'browser');if(mode==='unsupported-option'&&'keyboardLock'in options)throw Object.assign(new Error('unsupported'),{name:'NotSupportedError'});if(mode==='denied')throw Object.assign(new Error('denied'),{name:'NotAllowedError'});doc.fullscreenElement={};docEvents.fullscreenchange();}};
  doc.exitFullscreen=async()=>{doc.fullscreenElement=null;docEvents.fullscreenchange();};
  const fullscreen=bindFullscreen(button,doc,win);await fullscreen.toggle();
  assert.equal(fullscreen.status().active,mode!=='denied');assert.equal(fullscreen.status().escapeLocked,mode==='new-api','ignored dictionaries never claim a successful lock');
  assert.equal(requests,mode==='unsupported-option'?2:1,'only unsupported options retry ordinary fullscreen');
  let prevented=false;events.keydown({code:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,mode==='new-api');
  if(mode!=='denied'){await fullscreen.toggle();assert.equal(fullscreen.status().escapeLocked,false);}
}
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const main=read('src/main.js'),html=read('index.html'),map=read('src/game_map.js');
assert.ok(!html.includes('id="mapbtn"'),'only one map/deployment button');
assert.match(main,/onClose:\(\)=>deploymentPanel.close\(\)/);assert.match(main,/gameMap.dock\(false\); gameMap.close\(\)/);
assert.match(main,/onKey\('KeyM'.*deploymentPanel.open\(\)/);
assert.match(map,/destinationPicker=null;onClose\(\)/,'map close synchronously closes its deployment pane');
assert.match(main,/crewRoot:\$\('partyframes'\)/);assert.match(main,/createCrewBar\(\{ root: \$\('partyframes'\)/);
assert.match(html,/Utility icons beside Ryo/);assert.match(html,/Rally \/ War Lantern buttons/);
assert.equal(JSON.parse(read('data/units.json')).models.rival_yakuza.abilities.E.cooldown,15);
console.log('Command UI: icon names/focus labels/anchor caching, shared lantern commands, fullscreen option/fallback/denial, combined map closure and separate party frame wiring passed');
