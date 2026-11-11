import {defaultLabel,slug,sortSaves,rowText,willOverwrite} from './save_menu.js';
import {RESOLUTIONS,FPS_CAPS} from './video_settings.js';
export function createGameSettings({button,sound,video=null,saves=null,onOpen=()=>{},onClose=()=>{},onEditLayout=()=>{}}){
 const root=document.createElement('section');root.id='gamesettings';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Game settings');
 root.innerHTML='<div class="settings-window ms"><header class="ms-head"><div><div class="ms-eyebrow">Game</div><h2>Settings</h2></div><button type="button" class="ms-btn close" title="Close (Esc)">Esc</button></header><div class="ms-main"><div class="ms-tabs"><button type="button" class="ms-tab on" data-set-tab="saves">Save and load</button><button type="button" class="ms-tab" data-set-tab="video">Video</button><button type="button" class="ms-tab" data-set-tab="audio">Audio</button></div><section data-pane="saves"><div class="ms-sec"><span>Save game</span></div><div class="save-row"><input class="save-name" type="text" maxlength="40" placeholder="Save name (optional)"> <button type="button" class="ms-btn ms-go save-game">Save game</button></div><p class="save-note" aria-live="polite"></p><div class="ms-sec"><span>Saved games</span></div><div class="save-list"></div><div class="save-pager"></div></section><section data-pane="video" hidden><div class="ms-sec"><span>Picture</span></div><label class="set-row"><span>Resolution</span><select class="v-res"></select></label><label class="set-row"><span>Frame cap</span><select class="v-cap"></select></label><label class="set-row"><span>Glow on spells and fire</span><input class="v-glow" type="checkbox"></label><label class="set-row"><span>Screen shake</span><input class="v-shake" type="checkbox"></label><label class="set-row"><span>Show FPS (P)</span><input class="v-fps" type="checkbox"></label><p class="v-note">Lower resolution runs faster; Sharp uses every pixel of your screen.</p></section><section data-pane="audio" hidden><div class="ms-sec"><span>Volume</span></div><label class="set-row range"><span>Master volume</span><output class="master-value"></output><input class="master" type="range" min="0" max="100" step="1"></label><label class="set-row range"><span>Effects volume</span><output class="effects-value"></output><input class="effects" type="range" min="0" max="100" step="1"></label><label class="set-row range"><span>Music volume</span><output class="music-value"></output><input class="music" type="range" min="0" max="100" step="1"></label><div class="ms-sec"><span>Sound</span></div><label class="set-row"><span>Background music</span><input class="music-enabled" type="checkbox"></label><label class="set-row mute-row"><span>Mute audio</span><input class="mute" type="checkbox"></label><div class="set-acts"><button type="button" class="ms-btn pause-music">Pause music</button> <button type="button" class="ms-btn test-sound">Test sound</button></div><p class="sound-status" role="status"></p></section><div class="ms-foot set-foot"><span><button type="button" class="ms-btn edit-layout" title="Move and resize the HUD pieces">Edit layout</button></span><span><button type="button" class="ms-btn quit-game">Quit to game menu</button></span></div><p class="quit-note" aria-live="polite"></p></div></div>';
 document.body.appendChild(root);const $=s=>root.querySelector(s);let open=false,previousFocus=null;
 // tabs (menu restyle, Tim 2026-11-10): Save and load, Video, Audio; one pane at a time, no scrolling
 root.addEventListener('click',e=>{const t=e.target.closest?.('[data-set-tab]');if(!t)return;for(const b of root.querySelectorAll('[data-set-tab]'))b.classList.toggle('on',b===t);for(const p of root.querySelectorAll('[data-pane]'))p.hidden=p.dataset.pane!==t.dataset.setTab;t.blur();});
 // Video (Tim 2026-11-07, src/video_settings.js)
 for(const [k,t] of RESOLUTIONS)$('.v-res').append(new Option(t,k));for(const [k,t] of FPS_CAPS)$('.v-cap').append(new Option(t,String(k)));
 if(!video)for(const el of root.querySelectorAll('.v-res,.v-glow,.v-shake,.v-cap,.v-fps'))el.disabled=true;
 function renderVideo(){if(!video)return;const v=video.get();$('.v-res').value=v.resolution;$('.v-glow').checked=v.glow;$('.v-shake').checked=v.shake;$('.v-cap').value=String(v.fpsCap);$('.v-fps').checked=v.showFps;}
 $('.v-res').addEventListener('change',()=>video?.set({resolution:$('.v-res').value}));
 $('.v-glow').addEventListener('change',()=>video?.set({glow:$('.v-glow').checked}));
 $('.v-shake').addEventListener('change',()=>video?.set({shake:$('.v-shake').checked}));
 $('.v-cap').addEventListener('change',()=>video?.set({fpsCap:Number($('.v-cap').value)}));
 $('.v-fps').addEventListener('change',()=>video?.set({showFps:$('.v-fps').checked}));
 video?.subscribe(renderVideo);
 function render(){renderVideo();const s=sound.getSettings();for(const key of ['master','effects','music']){$(`.${key}`).value=Math.round(s[key]*100);$(`.${key}-value`).textContent=`${Math.round(s[key]*100)}%`;}$('.mute').checked=s.muted;$('.music-enabled').checked=s.musicEnabled;$('.pause-music').textContent=s.musicEnabled?'Pause music':'Play music';}
 function show(value){if(open===value)return;open=value;quitArmed=false;$('.quit-game').textContent='Quit to game menu';$('.quit-note').textContent='';root.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){previousFocus=document.activeElement;onOpen();render();refreshSaves();$('.close').focus();}else{onClose();previousFocus?.focus?.();}}
 for(const key of ['master','effects','music'])$(`.${key}`).addEventListener('input',()=>sound.setSettings({[key]:Number($(`.${key}`).value)/100}));
 $('.music-enabled').addEventListener('change',()=>{sound.setSettings({musicEnabled:$('.music-enabled').checked});render();});
 // Tim 2026-11-09: a plain Pause / Play music button (same switch as Background music)
 $('.pause-music').addEventListener('click',e=>{sound.setSettings({musicEnabled:!sound.getSettings().musicEnabled});render();e.currentTarget.blur();});
 $('.mute').addEventListener('change',()=>sound.setSettings({muted:$('.mute').checked}));
 $('.test-sound').addEventListener('click',async()=>{try{$('.sound-status').textContent=await sound.preview()?'Test sound played':'Audio is muted, at zero volume or unavailable';}catch{$('.sound-status').textContent='Audio is unavailable in this browser';}});
 $('.edit-layout').addEventListener('click',()=>{show(false);onEditLayout();});
 // Quit to the start screen (Tim 2026-10-30): a second click confirms; the match is not saved. Test presets in the URL are dropped
 let quitArmed=false;
 $('.quit-game').addEventListener('click',()=>{if(quitArmed){location.href=location.pathname;return;}quitArmed=true;$('.quit-game').textContent='Click again to quit';$('.quit-note').textContent='This match is not saved and will be lost.';});
 // Save and load (frontier F1.6b): Save asks before overwriting; Load and Delete need a second click.
 let armed=null,savePage=0;const SAVES_PER=6;const note=t=>{$('.save-note').textContent=t;};
 async function refreshSaves(){
  armed=null;const box=$('.save-list'),pager=$('.save-pager');box.textContent='';pager.textContent='';if(!saves){$('.save-game').disabled=true;note('Saving needs the game server.');return;}
  let list;try{list=sortSaves(await saves.list());}catch(e){note('Could not read saves: '+e.message);return;}
  $('.save-name').placeholder=defaultLabel(saves.meta().day,saves.meta().clan);
  const pages=Math.max(1,Math.ceil(list.length/SAVES_PER));savePage=Math.max(0,Math.min(savePage,pages-1));
  if(pages>1){const info=document.createElement('span');info.className='ms-small';info.textContent=`Page ${savePage+1} of ${pages}`;const btns=document.createElement('span');for(const [label,step] of [['Prev',-1],['Next',1]]){const b=document.createElement('button');b.type='button';b.className='ms-btn';b.textContent=label;b.disabled=step<0?savePage===0:savePage>=pages-1;b.addEventListener('click',()=>{savePage+=step;refreshSaves();});btns.append(b);}pager.className='save-pager ms-foot';pager.append(info,btns);}
  for(const h of list.slice(savePage*SAVES_PER,savePage*SAVES_PER+SAVES_PER)){const row=document.createElement('div');row.className='save-item';const t=document.createElement('span');t.textContent=rowText(h);
   const load=document.createElement('button');load.type='button';load.textContent='Load';const ow=document.createElement('button');ow.type='button';ow.textContent='Overwrite';ow.title='Replace this save with the current match';const del=document.createElement('button');del.type='button';del.textContent='Delete';
   load.addEventListener('click',async()=>{if(armed!==h.name+'L'){armed=h.name+'L';load.textContent='Click again';note('Loading replaces the current match.');return;}load.disabled=true;load.textContent='Loading...';note('Loading the save, the page will reload...');try{await saves.load(h.name);}catch(e){armed=null;load.disabled=false;load.textContent='Load';note(e.message);console.error('Load failed',e);}});
   ow.addEventListener('click',async()=>{if(armed!==h.name+'O'){armed=h.name+'O';ow.textContent='Sure?';note('Overwrite replaces "'+rowText(h)+'" with the current match.');return;}ow.disabled=true;try{await saves.save(h.name,h.label||h.name);await refreshSaves();note('Overwrote '+h.name+'.');}catch(e){armed=null;ow.disabled=false;ow.textContent='Overwrite';note('Overwrite failed: '+e.message);}});
   del.addEventListener('click',async()=>{if(armed!==h.name+'D'){armed=h.name+'D';del.textContent='Sure?';note('Delete moves it to saves/_trash.');return;}try{await saves.remove(h.name);refreshSaves();}catch(e){note(e.message);}});
   for(const b of [load,ow,del])b.className='ms-btn';row.append(t,load,ow,del);box.append(row);}
  if(!list.length)note('No saves yet.');
 }
 $('.save-game').addEventListener('click',async()=>{
  if(!saves)return;const typed=$('.save-name').value.trim(),label=typed||defaultLabel(saves.meta().day,saves.meta().clan),name=slug(label);
  try{const exists=willOverwrite(await saves.list(),name);if(exists&&armed!==name+'S'){armed=name+'S';note('"'+name+'" exists. Click Save again to overwrite.');return;}
   await saves.save(name,label);$('.save-name').value='';await refreshSaves();note('Saved as '+name+'.');}catch(e){armed=null;note('Save failed: '+e.message);}
 });
 sound.subscribe(render);$('.close').addEventListener('click',()=>show(false));button.addEventListener('click',()=>show(!open));
 root.addEventListener('keydown',e=>{e.stopPropagation();if(e.code==='Escape'){e.preventDefault();show(false);}if(e.code==='Tab'){const stops=[...root.querySelectorAll('button,input,select')],first=stops[0],last=stops.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 for(const type of ['mousedown','mouseup','contextmenu','wheel'])root.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
 render();return {close:()=>show(false),isOpen:()=>open};
}
