// The one test switch (Tim 2026-10-19: one param, nothing hidden anywhere else): ?test=<setup>
//   ?test=bot    see the whole rival clan fast: it starts with 5000 ryo (buys, hires, then a War
//                Lantern raid on you); you start with the teahouse and 3000 ryo (enough for a lantern)
//   ?test=ninja  skip the start menu and play the Shinobi clan for gameplay testing:
//                the ninja leader and one ninja crew, normal 200-ryo opening in the forest village
//                (longhouse hideout, dojo hiring); Kuroda is the rival bot as usual
//   ?test=lantern keep the normal clan/difficulty menu; only your starting ryo becomes
//                 3000, enough to buy a War Lantern. Rivals and starting property stay normal.
//   ?test=shakedown stages three Yakuza at a rival teahouse and starts a real night Shakedown.
//   ?test=assignments keeps clan selection, grants 5000 ryo and stages Yakuza Shakedown or Kuroda Sweep.
//   ?test=crew keeps clan selection; 5000 ryo to hire and test the expanded roster.
// DEV = false turns it off, along with the dev-only keys in main.js: N / the day-night button
// (any client could send that 'time' command, a cheat in multiplayer), F3 footprints, and
// window.infamy for the browser console. Not covered: server.mjs saving the HUD layout
// (PUT /game/data/ui_layout.json, Node side) and tools/rooms.html, a separate tool page.
export const DEV = true;

const test = DEV && typeof location !== 'undefined' ? new URLSearchParams(location.search).get('test') : null;

// what main.js reads; everything not set by a ?test setup is the normal game
export const TEST = {
  setup: test,
  botRyo: test === 'bot' ? 5000 : undefined,
  playerRyo: ['assignments','crew'].includes(test) ? 5000 : ['bot', 'lantern'].includes(test) ? 3000 : undefined,
  playerOwns: test === 'bot' ? 'teahouse' : null,
  ninja: test === 'ninja',
};
