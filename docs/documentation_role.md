# Documentation role

How docs are kept in this folder (set up 2026-10-17 at Tim's request). One "Docs keeper" thread writes every doc change, following this file.

## Approval flow

1. A thread that wants a doc changed sends the path and a short summary of the change to the project's channel session. It does not ask Tim in its own thread.
2. The channel session asks Tim in the main project chat.
3. On Tim's OK, the channel session forwards the change to the Docs keeper thread.
4. The Docs keeper writes it following the rules below. Nothing is written without Tim's OK.

This covers anything under `docs/`, `README.md`, `START_HERE.md` and `assets/*.md`. Code, art and data JSON follow the normal plan-first rule instead.

## Which doc owns which topic

Each topic lives in one doc. Other docs link to it rather than repeating it.

| Topic | Owner |
|---|---|
| Working rules and the doc index | `START_HERE.md` |
| Project overview, status, folder layout, sprite export how-to | `README.md` |
| Usage-saving rules | `docs/usage.md` |
| This role: doc owners and how docs are written | `docs/documentation_role.md` |
| Code architecture: modules, data flow, main loop, data files | `docs/architecture.md` |
| Stack, camera, draw order, lighting, map format, build steps | `docs/tech_plan.md` |
| Every working control and planned keys | `docs/controls.md` |
| Game design: city, clans, raids, economy, weapons, infamy | `docs/gameplay_and_design.md` |
| Crew hiring, orders, crew phases | `docs/crew_recruiting_plan.md` |
| Combat rules, feel, hero abilities, action bar, VFX plan, downed and hospital | `docs/combat_spec.md` |
| Civilians walking the streets | `docs/civilians_plan.md` |
| Police, heat tiers, arrests, bribes | `docs/police_spec.md` |
| Business ownership, payouts, raids, War Lantern | `docs/business_raids_plan.md` |
| Rival bot clan, difficulties, home hideouts | `docs/rival_bot_plan.md` |
| Test URL parameters | `docs/test_params.md` |
| 3D interior rules, look rules, room data format | `docs/interiors_spec.md` |
| Room generator | `docs/room_generator_plan.md` |
| Look, art pipeline, assets layout | `docs/art_direction.md` |
| Per-character pipeline status, held items, animation sets | `docs/cast_tracker.md` |
| Building images index | `docs/buildings.md` |
| Build layers and next steps | `docs/roadmap.md` |
| Environment, item and building image prompts | `assets/image_prompts.md` |
| Character concept prompts | `assets/character_prompts.md` |

## Where new info goes

- Put it in the doc that owns the topic. If two seem to fit, pick the narrower one and link from the other.
- Images that docs link to (sketches, diagrams) go in `docs/images/`.
- Every new test URL parameter gets a row in `test_params.md` in the same batch it is built (Tim 2026-10-19).
- Make a new doc only for a new topic big enough to need its own page, and add it to the table above and to `START_HERE.md`'s doc table in the same change.

## Writing rules

- **Dates:** decisions and status lines carry the date as YYYY-MM-DD, for example "Settled (Tim, 2026-10-16)".
- **Replace, don't stack:** when a decision or status changes, rewrite the old line with the new one and its new date. Keep the old version only when Tim wants it, in a short "Superseded" note.
- **Link, don't copy:** say a fact once in its owner doc; elsewhere write a one-line link to it.
- **Short and plain:** short sentences, plain words, no filler. Tables and lists over long paragraphs.
- **Index:** keep `START_HERE.md`'s doc table current whenever a doc is added, renamed or removed.

## Sweeps

When the channel session asks for a sweep (daily while work is happening), the Docs keeper reads the docs without changing them and sends the channel session a short list of new stale or duplicated lines with proposed fixes. Fixes are written only after Tim OKs them.

To keep sweeps cheap, each one reads only docs and code changed since the last sweep. Commits are rare here, so it goes by file modification time (plus `git log` when there are new commits), then updates the line below.

Last sweep: 2026-10-19 00:35 UTC, after the 2x map, Rally and looting batch (last commit before it: 86873e1).

## Commits (Tim, 2026-10-17)

- The Docs keeper is the only thread that commits, locally, in phases after big changes or when the channel session says a feature or batch is done. Group commits sensibly (docs, game code, art).
- Never push: Tim pushes.
- Leave `to_delete/` out of commits. Files over about 50 MB, or ones that don't belong in git, are left out and flagged to Tim.
- The folder blocks deletes, so git leaves its lock and temp files behind. Run git with `-c core.createObject=rename -c gc.auto=0 -c maintenance.auto=false` and move any leftovers into `.git/stale_tmp/` (Tim can empty it).

## How the Docs keeper writes

1. Re-read the file right before writing, since other threads may have changed it.
2. Make the smallest edit that applies the approved change, and fix nearby lines it makes outdated or redundant only if Tim approved that.
3. Read the file back afterwards to check the edit landed.
