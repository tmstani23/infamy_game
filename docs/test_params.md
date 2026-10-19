# Test URL parameters

Every URL parameter the game reads, for testing (2026-10-19). Add them to the game address, for example `index.html?night=1&fog=0`. Rule: every new test param gets a row here in the same batch it is built (see `documentation_role.md`). Before any public release, close these or put them behind a dev-only switch or sign-in (roadmap).

All are read in `game/src/main.js` unless noted.

| Param | What it does |
|---|---|
| `district=waterfront` | Loads that district file instead of the default `port_town` (the old smaller map). |
| `room=<type>&seed=N` | Swaps in a generated room of that type (seed 1 by default) and starts the hero inside it. |
| `x=N&z=N&dir=N` | Hero start position and facing. |
| `enemies=N` | Puts N stand-in rival thugs at the gambling den (none by default). |
| `rival=den\|teahouse\|warehouse` | Gives a stand-in rival clan (Kuroda) that business with its guards, to try War Lantern raids. |
| `raidme=den\|teahouse\|warehouse` | Makes that business yours and gives you 3 crew (thugs following you); at night a stand-in Kuroda boss (rival_yakuza) and 3 thugs plant a War Lantern at it, to try defending. |
| `civilians=0` | No townsfolk. |
| `night=1` | Starts at night. |
| `fog=0` | Turns the fog of war off. |
| `zoom=N` | Starting camera zoom. |
| `debug=1` | Shows building footprint lines (`render/view.js`). |
| `type=<room>` | Room preview page only (`game/tools/rooms.html`): which room type to show. |
