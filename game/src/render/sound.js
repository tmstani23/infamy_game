// Combat sounds (Kenney packs, CC0; list in assets/sounds/CREDITS.md), played from the
// sim's per-tick hits and casts and from swings starting. Quieter with distance from the
// camera, a little random pitch so repeats don't sound the same. K mutes. Purely output.
import {normalizeAudioSettings,readAudioSettings,saveAudioSettings} from '../audio_settings.js';
const SWORDS = new Set(['ronin', 'swordsman', 'ninja_leader', 'ninja_grunt', 'ninja_tanto']);
const SPEARS = new Set(['rival_yakuza', 'kuroda_spearman']);
const CLUBS = new Set(['thug', 'brute', 'enforcer', 'demolitions', 'lookout']);
const SOFT = [0, 1, 2, 3, 4].map(i => `Audio/impactSoft_medium_00${i}`);
const FILES = ['sword_slash_1', 'sword_slash_2', 'sword_chop_1', 'katana_hit_metal_1', 'katana_hit_metal_2', 'katana_clash_1',
  'katana_draw_1', 'katana_draw_2', 'club_hit_1', 'club_hit_2', 'club_hit_3', 'crit_hit_1', 'crit_hit_2',
  'death_thud_1', 'death_thud_2', 'knockdown_thud_1', ...SOFT,
  'Audio/handleCoins', 'Audio/handleCoins2', 'Audio/doorOpen_1', 'Audio/doorOpen_2', 'punch_hit_1', 'punch_hit_2', 'punch_hit_heavy_1'];
// Punch fallback for models without a dedicated weapon route; heavy impacts use a lower pitch.
const FISTS = new Set(['thug', 'brute', 'enforcer', 'demolitions', 'lookout', 'police']), HEAVY_FISTS = new Set(['brute', 'enforcer', 'demolitions']);
// Tim's own clips (Suno), any of .ogg/.mp3/.wav in assets/sounds; until one is there its Kenney fallback plays
const CUSTOM = { punch_main: ['punch_hit_1', 'punch_hit_2'], punch_main_heavy: ['punch_hit_heavy_1'], punch_main_2: [], punch_main_3: [], rifle_shot_1: [], dynamite_1: [], dynamite_2: [], dynamite_3: [], use_1: ['Audio/doorOpen_1', 'Audio/doorOpen_2'], use_2: [], use_3: [], loot_coins_1: ['Audio/handleCoins', 'Audio/handleCoins2'] };
for (let i=1;i<=4;i++) CUSTOM[`katana_slash_${i}`]=['sword_slash_1','sword_slash_2'];
for (let i=1;i<=4;i++) {
  CUSTOM[`spear_thrust_${i}`]=['sword_slash_1','sword_slash_2'];
  CUSTOM[`club_thud_${i}`]=['club_hit_1','club_hit_2','club_hit_3'];
}
const HEAR = 24, MAX_VOICES = 14;

export function createSound({ base = '../assets/sounds/',storage } = {}) {
  let ctx = null, master = null, effects=null, voices = 0, settings=readAudioSettings(storage),ready=null;
  const lastVariants=new Map();
  const listeners=new Set();
  function apply(){if(master)master.gain.value=settings.muted?0:settings.master;if(effects)effects.gain.value=settings.effects*1.5;}
  function setSettings(patch){settings=normalizeAudioSettings({...settings,...patch});apply();saveAudioSettings(settings,storage);for(const fn of listeners)fn({...settings});return {...settings};}
  const buffers = {};
  // browsers only allow audio after a key press or click
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new AudioContext();
    master = ctx.createGain();
    effects=ctx.createGain();effects.connect(master);
    const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-6;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.003;limiter.release.value=.15;
    master.connect(limiter).connect(ctx.destination);apply();
    const load=(f,ext)=>fetch(`${base}${f}.${ext}`).then(r=>{if(!r.ok)throw Error('Sound unavailable');return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)).then(b=>{buffers[f]=b;});
    // the rifleman's shot (Tim 2026-10-29: made with Suno, dropped in as assets/sounds/rifle_shot_1 .ogg, .mp3 or .wav; missing = silent)
    const custom=Object.keys(CUSTOM).map(f=>load(f,'ogg').catch(()=>load(f,'mp3')).catch(()=>load(f,'wav')).catch(()=>{}));
    ready=Promise.all([...custom,...FILES.map(f=>load(f,'ogg').catch(()=>{}))]);
  }
  addEventListener('keydown', unlock);
  addEventListener('mousedown', unlock);

  // Tim's clips (name plus numbered variants, e.g. use_1/use_2/use_3 or punch_main/punch_main_2), else the fallback list
  const pickCustom = name => {
    const base = name.replace(/_\d+$/, ''), mine = Object.keys(CUSTOM).filter(k => buffers[k] && new RegExp(`^${base}(_\\d+)?$`).test(k));
    return mine.length ? mine : CUSTOM[name];
  };
  function variant(family, volume, pitch=1) {
    if (!ctx || settings.muted || voices >= MAX_VOICES || volume <= 0.01) return;
    const pool=pickCustom(family),choices=pool.length>1?pool.filter(name=>name!==lastVariants.get(family)):pool;
    const name=choices[Math.floor(Math.random()*choices.length)];
    lastVariants.set(family,name);play(name,volume,pitch);
  }
  const swordSlash=volume=>variant('katana_slash_1',volume);
  function play(names, volume, pitch = 1) {
    if (!ctx || settings.muted || voices >= MAX_VOICES || volume <= 0.01) return;
    const name = [].concat(names)[Math.floor(Math.random() * [].concat(names).length)], buf = buffers[name];
    if (!buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = pitch * (0.92 + Math.random() * 0.16);
    g.gain.value = volume;
    src.connect(g).connect(effects);
    voices++;
    src.onended = () => voices--;
    src.start();
  }
  // loudness for something at (x, z) heard at the camera (nothing from other places)
  const near = (me, x, z, place) => !me || place !== me.place ? 0 : Math.max(0, 1 - Math.hypot(x - me.x, z - me.z) / HEAR);

  // a temple bell, made on the spot (no file): a few soft partials that ring out (raid alarm)
  function bell() {
    if (!ctx || settings.muted) return;
    const t0 = ctx.currentTime;
    for (const [f, v, len] of [[392, 0.35, 2.6], [784, 0.16, 1.8], [1046, 0.09, 1.2], [1568, 0.05, 0.8]]) {
      for (const at of [0, 0.55]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(v, t0 + at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(g).connect(effects);
        o.start(t0 + at); o.stop(t0 + at + len);
      }
    }
  }

  return {
    bell,
    // a UI cue for the hero's own actions (Space use): Tim's clip or its fallback
    cue(name, volume = 0.5) { play(pickCustom(name), volume); },
    toggleMute() { return setSettings({muted:!settings.muted}).muted; },
    setSettings,getSettings:()=>({...settings}),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    async preview(){unlock();await ready;if(!buffers.katana_clash_1||settings.muted||!settings.master||!settings.effects)return false;play('katana_clash_1',.55);return true;},
    // after each tick: new swings, hits and casts
    update(state, focus) {
      const me = focus;
      for (const e of Object.values(state.entities)) {
        if (!e.swing || e.swing.start !== state.tick - 1) continue;
        const v = near(me, e.x, e.z, e.place);
        if (SWORDS.has(e.model)) swordSlash(0.35*v);
        else if (SPEARS.has(e.model)) {
          // These clips contain the complete thrust. Special attacks have their
          // own cast events below, so their animation must not play it twice.
          if (!e.spearCombo && !e.spearSweep) variant('spear_thrust_1',.45*v);
        }
        else play(['sword_slash_1', 'sword_slash_2'], 0.2 * v, 0.7);   // heavier whoosh for clubs
      }
      for (const h of state.hits) {
        const t = state.entities[h.t], v = near(me, h.x, h.z, t?.place);
        if(h.kind==='dynamite'||h.kind==='fire'){if(h.kill)play('knockdown_thud_1',.4*v);continue;}
        if (SPEARS.has(h.weapon)) { /* Complete spear clip already includes impact. Keep crit/KO layers below. */ }
        else if (SWORDS.has(h.weapon)) play(h.kind === 'dash' ? ['katana_hit_metal_1', 'katana_hit_metal_2'] : 'sword_chop_1', 0.55 * v);
        else if (CLUBS.has(h.weapon)) variant('club_thud_1',.6*v,HEAVY_FISTS.has(h.weapon)?.9:1);
        else if (FISTS.has(h.weapon)) play(pickCustom(HEAVY_FISTS.has(h.weapon) && (buffers.punch_main_heavy || !buffers.punch_main) ? 'punch_main_heavy' : 'punch_main'), 0.6 * v, HEAVY_FISTS.has(h.weapon) ? 0.9 : 1);
        else play(['club_hit_1', 'club_hit_2', 'club_hit_3'], 0.55 * v);
        if (h.crit) play(['crit_hit_1', 'crit_hit_2'], 0.6 * v);
        if (h.kill) play(t?.type === 'hero' ? 'knockdown_thud_1' : ['death_thud_1', 'death_thud_2'], 0.6 * v);
      }
      for (const c of state.casts) {
        const a = state.entities[c.a], v = near(me, c.x, c.z, c.place||a?.place);
        if(c.kind==='dynamiteBlast')play(pickCustom('dynamite_1'),.85*v);
        if(c.kind==='shakedownSuccess')play(pickCustom('loot_coins_1'),.65*v);
        if (c.kind === 'dash' || c.kind === 'lantern') play(['katana_draw_1', 'katana_draw_2'], 0.6 * v, c.kind === 'lantern' ? 0.8 : 1);
        if (SWORDS.has(a?.model) && (c.kind==='dash'||c.kind==='assassinate'||(c.kind==='shadowstep'&&c.crit))) swordSlash(.4*v);
        if (c.kind === 'intimidate') play(SOFT, 0.7 * v, 0.6);
        if (c.kind === 'rifleshot') play('rifle_shot_1', v > 0 ? 0.8 * Math.max(v, 0.3) : 0, 1);   // gunfire carries: still heard at the edge of hearing range
        if (c.kind === 'taunt') play(SOFT, 0.6 * v, 0.5);
        if (c.kind === 'loot') play(pickCustom('loot_coins_1'), 0.6 * v);
        if (c.kind === 'rally') play('katana_clash_1', 0.5 * v);
        if (c.kind === 'sweep' || c.kind === 'thrust') {
          if (SPEARS.has(a?.model) && c.landed!==false) variant('spear_thrust_1',.45*v);
          else play('sword_slash_1',.4*v);
        }
        if (c.kind === 'counter') play('katana_clash_1', .6*v, .85);
        if (c.kind === 'formation') play('katana_draw_2', .45*v, .65);
        if (c.kind === 'execute') { play(['crit_hit_1', 'crit_hit_2'], 0.7 * v, 0.8); play(['death_thud_1', 'death_thud_2'], 0.6 * v); }
      }
    },
  };
}
