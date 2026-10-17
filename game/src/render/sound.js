// Combat sounds (Kenney packs, CC0; list in assets/sounds/CREDITS.md), played from the
// sim's per-tick hits and casts and from swings starting. Quieter with distance from the
// hero, a little random pitch so repeats don't sound the same. M mutes. Purely output.
const BLADES = new Set(['ronin', 'swordsman', 'rival_yakuza', 'ninja_leader', 'ninja_grunt']);
const FILES = ['sword_slash_1', 'sword_slash_2', 'sword_chop_1', 'katana_hit_metal_1', 'katana_hit_metal_2', 'katana_clash_1',
  'katana_draw_1', 'katana_draw_2', 'club_hit_1', 'club_hit_2', 'club_hit_3', 'punch_hit_heavy_1', 'crit_hit_1', 'crit_hit_2',
  'death_thud_1', 'death_thud_2', 'knockdown_thud_1'];
const HEAR = 18, MAX_VOICES = 14;

export function createSound({ base = '../assets/sounds/' } = {}) {
  let ctx = null, master = null, muted = false, voices = 0;
  const buffers = {};
  // browsers only allow audio after a key press or click
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    for (const f of FILES) fetch(`${base}${f}.ogg`).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(b => { buffers[f] = b; }).catch(() => {});
  }
  addEventListener('keydown', unlock);
  addEventListener('mousedown', unlock);

  function play(names, volume, pitch = 1) {
    if (!ctx || muted || voices >= MAX_VOICES || volume <= 0.01) return;
    const name = [].concat(names)[Math.floor(Math.random() * [].concat(names).length)], buf = buffers[name];
    if (!buf) return;
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = pitch * (0.92 + Math.random() * 0.16);
    g.gain.value = volume;
    src.connect(g).connect(master);
    voices++;
    src.onended = () => voices--;
    src.start();
  }
  // loudness for something at (x, z) heard by the hero (nothing from other places)
  const near = (me, x, z, place) => !me || place !== me.place ? 0 : Math.max(0, 1 - Math.hypot(x - me.x, z - me.z) / HEAR);

  return {
    toggleMute() { muted = !muted; return muted; },
    // after each tick: new swings, hits and casts
    update(state, followId) {
      const me = state.entities[followId];
      for (const e of Object.values(state.entities)) {
        if (!e.swing || e.swing.start !== state.tick - 1) continue;
        const v = near(me, e.x, e.z, e.place);
        if (BLADES.has(e.model)) play(['sword_slash_1', 'sword_slash_2'], 0.35 * v);
        else play(['sword_slash_1', 'sword_slash_2'], 0.2 * v, 0.7);   // heavier whoosh for clubs
      }
      for (const h of state.hits) {
        const t = state.entities[h.t], v = near(me, h.x, h.z, t?.place);
        if (BLADES.has(h.weapon)) play(h.kind === 'dash' ? ['katana_hit_metal_1', 'katana_hit_metal_2'] : 'sword_chop_1', 0.55 * v);
        else play(h.weapon === 'brute' ? ['club_hit_1', 'punch_hit_heavy_1'] : ['club_hit_1', 'club_hit_2', 'club_hit_3'], 0.55 * v);
        if (h.crit) play(['crit_hit_1', 'crit_hit_2'], 0.6 * v);
        if (h.kill) play(t?.type === 'hero' ? 'knockdown_thud_1' : ['death_thud_1', 'death_thud_2'], 0.6 * v);
      }
      for (const c of state.casts) {
        const a = state.entities[c.a], v = near(me, c.x, c.z, a?.place);
        if (c.kind === 'dash' || c.kind === 'lantern') play(['katana_draw_1', 'katana_draw_2'], 0.6 * v, c.kind === 'lantern' ? 0.8 : 1);
        if (c.kind === 'intimidate') play('punch_hit_heavy_1', 0.6 * v, 0.6);
        if (c.kind === 'rally') play('katana_clash_1', 0.5 * v);
        if (c.kind === 'execute') { play(['crit_hit_1', 'crit_hit_2'], 0.7 * v, 0.8); play(['death_thud_1', 'death_thud_2'], 0.6 * v); }
      }
    },
  };
}
