# W3 research: how big-map games do it

Short research note for the walkable-world phase (2026-11-02). It turns into the default design for
W3.1 in `frontier_build_steps.md`.

## 1. Pathfinding across a huge map: hierarchical pathfinding (HPA*)

The standard answer for big grid maps is to split the map into clusters (our chunks), find the
entrances ("portals") along each cluster border, and precompute the walking distance between
portals inside each cluster. That gives a small abstract graph over the whole map.

- **Long trips** (an army marching across the island, a shipment, a click on the far side of the
  map) search the small abstract graph first, which is cheap, then refine the path only inside the
  chunk the unit is actually in, one chunk at a time.
- **Edits stay local.** Placing a wall or a building only recomputes the portals of that one chunk.
- **Unloaded chunks still route.** The abstract graph can be built from the terrain data alone, so
  routes across chunks nobody is standing in don't need those chunks loaded.

Sources: [HPA* paper (Botea, Müller, Schaeffer)](https://webdocs.cs.ualberta.ca/%7emmueller/ps/hpastar.pdf),
[hierarchical_pathfinding (Rust implementation and readme)](https://github.com/mich101mich/hierarchical_pathfinding),
[GameDev.net: A* vs huge levels](https://gamedev.net/forums/topic/677646-a-a-star-vs-huge-levels/).

## 2. Simulating far away: active chunks and two levels of detail

Factorio and similar games only update "active" chunks in detail, and their known slowdowns come
from too many chunks staying active (for example, far-off chunks kept awake by pollution or enemy
expansion checks). The lesson: cost should follow the number of active chunks, and empty chunks must
go back to sleep.

The usual pattern, also used by world-map games, is two levels:
- **Strategic level:** parties, armies and shipments far from any loaded area move as records along
  the abstract graph. Cheap, and it runs the same whether watched or not.
- **Detailed level:** when a record comes near a loaded area, or two hostile records meet, the area
  loads and the units become real entities with full combat (our F6.3b battle areas).

Sources: [Factorio forum: many active chunks far outside the base](https://forums.factorio.com/viewtopic.php?p=439811),
[Factorio forum: enemy expansion chunk computation is slow](https://forums.factorio.com/viewtopic.php?p=581829),
[Factorio wiki: pollution](https://wiki.factorio.com/Pollution).

## 3. Drawing a big world in the browser

- Load chunks in a ring around the camera, prefetch in the direction of movement, and unload beyond a
  bounded cache, reusing pooled meshes and instanced props instead of creating new objects.
- Build chunk geometry off the main thread (a worker) so loading never causes a frame hitch.
- De-risk memory and streaming first in a small prototype before building content on top. A recent
  browser open-world write-up argues exactly this "risk first" order.

Sources: [Open world in the browser, part 1: risk first](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-01-risk-first),
[three.js forum: web workers in 3D apps](https://discourse.threejs.org/t/web-workers-in-3d-web-applications/5674/18).

## 4. Saving a generated world

Minecraft-style worlds regenerate untouched chunks from the seed and only save what changed. For us:
chunks are generated from `world.json` plus a seed, so saves hold only `state.world` records (cleared
camps, pins, discovery) and towns, never chunk geometry.

## 5. Number precision

The island is 14,000 units across. 32-bit floats (what the GPU uses) keep about 0.001-unit precision
at that distance, which is plenty. No origin shifting is needed at this size. Recheck if the world
ever grows tenfold.

## What changes in the plan

- W3.1's default design is now: 250-unit chunks, an HPA*-style portal graph over the whole island
  built from terrain data, local path refinement inside loaded chunks, and active-chunk counting with
  sleep for empty chunks.
- Far-off armies and shipments move on the portal graph as records (strategic level) and only become
  entities near loaded areas or when they meet (detailed level).
- Chunk graphics build in a worker with pooling and prefetch.
- Saves store only changes, never chunks.
