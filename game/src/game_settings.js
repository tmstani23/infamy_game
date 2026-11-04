import {defaultLabel,slug,sortSaves,rowText,willOverwrite} from './save_menu.js';
export function createGameSettings({button,sound,saves=null,onOpen=()=>{},onClose=()=>{},onEditLayout=()=>{}}){
 const root=document.createElement('section');root.id='gamesettings';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','Game settings');
 root.innerHTML='<div class="settings-window"><header><h2>Settings</h2><button type="button" class="close">Close</button></header><button type="button" class="edit-layout">Edit layout</button> <button type="button" class="quit-game">Quit to game menu</button><p class="quit-note" aria-live="polite"></p><h3>Save and load</h3><div class="save-row"><input class="save-name" type="text" maxlength="40" placeholder="Save name (optional)"> <button type="button" class="save-game">Save game</button></div><p class="save-note" aria-live="polite"></p><div class="save-list"></div><h3>Audio</h3><label>Master volume <output class="master-value"></output><input class="master" type="range" min="0" max="100" step="1"></label><label>Effects volume <output class="effects-value"></output><input class="effects" type="range" min="0" max="100" step="1"></label><label>Music volume <output class="music-value"></output><input class="music" type="range" min="0" max="100" step="1"></label><label><input class="music-enabled" type="checkbox"> Background music</label><label class="mute-row"><input class="mute" type="checkbox"> Mute audio</label><button type="button" class="test-sound">Test sound</button><p class="sound-status" role="status"></p></div>';
 document.body.appendChild(root);const $=s=>root.querySelector(s);let open=false,previousFocus=null;
 function render(){const s=sound.getSettings();for(const key of ['master','effects','music']){$(`.${key}`).value=Math.round(s[key]*100);$(`.${key}-value`).textContent=`${Math.round(s[key]*100)}%`;}$('.mute').checked=s.muted;$('.music-enabled').checked=s.musicEnabled;}
 function show(value){if(open===value)return;open=value;quitArmed=false;$('.quit-game').textContent='Quit to game menu';$('.quit-note').textContent='';root.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open){previousFocus=document.activeElement;onOpen();render();refreshSaves();$('.close').focus();}else{onClose();previousFocus?.focus?.();}}
 for(const key of ['master','effects','music'])$(`.${key}`).addEventListener('input',()=>sound.setSettings({[key]:Number($(`.${key}`).value)/100}));
 $('.music-enabled').addEventListener('change',()=>sound.setSettings({musicEnabled:$('.music-enabled').checked}));
 $('.mute').addEventListener('change',()=>sound.setSettings({muted:$('.mute').checked}));
 $('.test-sound').addEventListener('click',async()=>{try{$('.sound-status').textContent=await sound.preview()?'Test sound played':'Audio is muted, at zero volume or unavailable';}catch{$('.sound-status').textContent='Audio is unavailable in this browser';}});
 $('.edit-layout').addEventListener('click',()=>{show(false);onEditLayout();});
 // Quit to the start screen (Tim 2026-10-30): a second click confirms; the match is not saved. Test presets in the URL are dropped
 let quitArmed=false;
 $('.quit-game').addEventListener('click',()=>{if(quitArmed){location.href=location.pathname;return;}quitArmed=true;$('.quit-game').textContent='Click again to quit';$('.quit-note').textContent='This match is not saved and will be lost.';});
 // Save and load (frontier F1.6b): Save asks before overwriting; Load and Delete need a second click.
 let armed=null;const note=t=>{$('.save-note').textContent=t;};
 async function refreshSaves(){
  armed=null;const box=$('.save-list');box.textContent='';if(!saves){$('.save-game').disabled=true;note('Saving needs the game server.');return;}
  let list;try{list=sortSaves(await saves.list());}catch(e){note('Could not read saves: '+e.message);return;}
  $('.save-name').placeholder=defaultLabel(saves.meta().day,saves.meta().clan);
  for(const h of list){const row=document.createElement('div');row.className='save-item';const t=document.createElement('span');t.textContent=rowText(h);
   const load=document.createElement('button');load.type='button';load.textContent='Load';const ow=document.createElement('button');ow.type='button';ow.textContent='Overwrite';ow.title='Replace this save with the current match';const del=document.createElement('button');del.type='button';del.textContent='Delete';
   load.addEventListener('click',async()=>{if(armed!==h.name+'L'){armed=h.name+'L';load.textContent='Click again';note('Loading replaces the current match.');return;}load.disabled=true;load.textContent='Loading…';note('Loading the save, the page will reload…');try{await saves.load(h.name);}catch(e){armed=null;load.disabled=false;load.textContent='Load';note(e.message);console.error('Load failed',e);}});
   ow.addEventListener('click',async()=>{if(armed!==h.name+'O'){armed=h.name+'O';ow.textContent='Sure?';note('Overwrite replaces "'+rowText(h)+'" with the current match.');return;}ow.disabled=true;try{await saves.save(h.name,h.label||h.name);await refreshSaves();note('Overwrote '+h.name+'.');}catch(e){armed=null;ow.disabled=false;ow.textContent='Overwrite';note('Overwrite failed: '+e.message);}});
   del.addEventListener('click',async()=>{if(armed!==h.name+'D'){armed=h.name+'D';del.textContent='Sure?';note('Delete moves it to saves/_trash.');return;}try{await saves.remove(h.name);refreshSaves();}catch(e){note(e.message);}});
   row.append(t,load,ow,del);box.append(row);}
  if(!list.length)note('No saves yet.');
 }
 $('.save-game').addEventListener('click',async()=>{
  if(!saves)return;const typed=$('.save-name').value.trim(),label=typed||defaultLabel(saves.meta().day,saves.meta().clan),name=slug(label);
  try{const exists=willOverwrite(await saves.list(),name);if(exists&&armed!==name+'S'){armed=name+'S';note('"'+name+'" exists. Click Save again to overwrite.');return;}
   await saves.save(name,label);$('.save-name').value='';await refreshSaves();note('Saved as '+name+'.');}catch(e){armed=null;note('Save failed: '+e.message);}
 });
 sound.subscribe(render);$('.close').addEventListener('click',()=>show(false));button.addEventListener('click',()=>show(!open));
 root.addEventListener('keydown',e=>{e.stopPropagation();if(e.code==='Escape'){e.preventDefault();show(false);}if(e.code==='Tab'){const stops=[...root.querySelectorAll('button,input')],first=stops[0],last=stops.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 for(const type of ['mousedown','mouseup','contextmenu','wheel'])root.addEventListener(type,e=>{e.stopPropagation();if(type==='contextmenu')e.preventDefault();});
 render();return {close:()=>show(false),isOpen:()=>open};
}
