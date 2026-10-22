import { CLAN_CHOICES, DIFFICULTY_CHOICES, matchOptions } from './sim/match_options.js';

const STORAGE = 'infamy.start-options';
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
    </form></div>`;
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
      resolve(options);
    }, { once: true });
  });
}
