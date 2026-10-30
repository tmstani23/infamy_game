import { CLAN_CHOICES, DIFFICULTY_CHOICES, matchOptions } from './sim/match_options.js';
import { createMenuMusic } from './menu_music.js';

const STORAGE = 'infamy.start-options';
export function requestGameExit({ windowRef = globalThis.window, timers = globalThis, onBlocked = () => {} } = {}) {
  try { windowRef?.close?.(); } catch {}
  timers.setTimeout(() => { if (windowRef && !windowRef.closed) onBlocked(); }, 250);
}

export function savedMatchOptions(defaultDifficulty = 'easy') {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE));
    return matchOptions(saved || { difficulty: defaultDifficulty });
  } catch { return matchOptions({ difficulty: defaultDifficulty }); }
}

export function chooseMatch({ root, loading, difficulty = 'easy', startRyo = 200, cycles = 10, drawCrest }) {
  const initial = savedMatchOptions(difficulty);
  root.innerHTML = `<div class="start-art" aria-hidden="true"></div><div class="start-light" aria-hidden="true"></div>
    <div class="start-rain" aria-hidden="true"></div><div class="start-mist" aria-hidden="true"></div>
    <div class="start-content"><header><p class="start-eyebrow">A city. Three clans.</p><h1>INFAMY</h1>
    <p class="start-tagline">Build your clan. Take the city.</p></header>
    <form><fieldset><legend>Choose your clan</legend><div class="start-clans">${CLAN_CHOICES.map(c => `
      <label class="start-choice"><input type="radio" name="clan" value="${c.id}" ${initial.clan === c.id ? 'checked' : ''} required>
      <span class="start-clan-card" style="--choice-color:${c.color}"><canvas width="72" height="72" data-crest="${c.id}" aria-hidden="true"></canvas>
      <strong>${c.name}</strong><em>${c.home}</em><span>${c.about}</span></span></label>`).join('')}</div></fieldset>
    <fieldset class="start-difficulty"><legend>Difficulty</legend><div class="start-levels">${DIFFICULTY_CHOICES.map(d => `
      <label class="start-choice"><input type="radio" name="difficulty" value="${d.id}" ${initial.difficulty === d.id ? 'checked' : ''} required><span>${d.name}</span></label>`).join('')}</div>
      <p class="start-difficulty-note" aria-live="polite"></p></fieldset>
    <div class="start-footer"><div><p class="start-loadout" aria-live="polite"></p><p class="start-season">${cycles}-day season · two rival clans</p></div>
      <button class="start-play" type="submit">Start game <span aria-hidden="true">→</span></button></div>
    </form><div class="start-exit"><button type="button" class="start-exit-button">Exit Game</button><p class="start-exit-note" role="status" aria-live="polite"></p></div><div class="start-music"><button class="start-music-toggle" type="button">Play music</button>
    <span class="start-music-title"></span><label>Music volume <input class="start-music-volume" aria-label="Intro music volume" type="range" min="0" max="100" step="1"></label></div></div>`;
  const musicButton=root.querySelector('.start-music-toggle'),musicVolume=root.querySelector('.start-music-volume');
  function renderMusic(s){
    musicButton.textContent=s.unavailable?'Music unavailable':s.playing?'Pause music':'Play music';
    musicButton.disabled=s.unavailable;musicButton.setAttribute('aria-pressed',String(s.playing));
    root.querySelector('.start-music-title').textContent=s.track.title;musicVolume.value=Math.round(s.volume*100);
  }
  const music=createMenuMusic({onChange:renderMusic});renderMusic(music.status());
  root.querySelector('.start-exit-button').addEventListener('click',()=>{
    const note=root.querySelector('.start-exit-note');note.textContent='';
    requestGameExit({onBlocked:()=>{note.textContent='This browser keeps the tab open. Close this tab to exit.';}});
  });
  musicButton.addEventListener('click',()=>music.toggle());
  musicVolume.addEventListener('input',()=>music.setVolume(Number(musicVolume.value)/100));
  for (const c of CLAN_CHOICES) {
    const ctx = root.querySelector(`[data-crest="${c.id}"]`).getContext('2d');
    ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(36,36,33,0,Math.PI*2); ctx.fill();
    drawCrest(ctx,36,36,22);
  }
  const form = root.querySelector('form');
  const value = name => form.querySelector(`input[name="${name}"]:checked`).value;
  function update() {
    const clan = CLAN_CHOICES.find(c => c.id === value('clan'));
    root.querySelector('.start-loadout').textContent = `${startRyo} ryo · 1 ${clan.kind === 'ninja' ? 'ninja' : 'crew member'} · HQ only`;
    root.querySelector('.start-difficulty-note').textContent = DIFFICULTY_CHOICES.find(d => d.id === value('difficulty')).about;
  }
  update();
  root.hidden = false; loading.hidden = true;
  form.addEventListener('change', update);
  form.querySelector('input:checked').focus({ preventScroll: true });
  return new Promise(resolve => {
    form.addEventListener('submit', e => {
      e.preventDefault();
      const options = matchOptions({ clan: value('clan'), difficulty: value('difficulty') });
      form.querySelector('button').disabled = true;
      try { sessionStorage.setItem(STORAGE, JSON.stringify(options)); } catch {}
      root.hidden = true; loading.hidden = false;
      music.stop();
      resolve(options);
    }, { once: true });
  });
}
