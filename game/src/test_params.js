// The one test switch (Tim 2026-10-19: one param, nothing hidden anywhere else): ?test=<setup>
//   ?test=bot    see the whole rival clan fast: it starts with 5000 ryo (buys, hires, then a War
//                Lantern raid on you); you start with the teahouse and 3000 ryo (enough for a lantern)
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
  playerRyo: test === 'bot' ? 3000 : undefined,
  playerOwns: test === 'bot' ? 'teahouse' : null,
};
