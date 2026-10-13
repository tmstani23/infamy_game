# Prestige and Infamy (working title)

A browser game about building a crime empire in 1870s Japan. You play one hero, recruit a crew, and grow a clan until it controls the city through wealth, power and force.

Hobby project, built with AI in the evenings. The plan is a tiny playable version first, then grow it if it is fun.

## Status

Design and look-testing. No game code yet.

## Repo layout

| Path | What it is |
|---|---|
| `docs/gameplay_and_design.md` | Setting, goal, clans, hero and crew, the city, map and territories, factions, inventory, open questions |
| `docs/art_direction.md` | The look we are going for, what the look tests proved, open art questions |
| `docs/roadmap.md` | Tiny version scope and next steps |
| `look_tests/` | Standalone HTML experiments. Open any file in a browser. |

## Look tests

- `look_tests/lantern_street.html`: rainy lantern-lit street with wet reflections, mist, a see-through cutaway and a Realistic to Anime style slider.
- `look_tests/voxel_character.html`: one ronin built from about 108,000 one-centimetre cubes, with idle and walk animations. Kept as an example of the voxel option, not a decision.

Both load three.js from a CDN, so they need an internet connection.

## Tech

Browser game built on three.js. Multiplayer planned with Colyseus. The look tests show the rendering techniques (wet reflections, lit rain, bloom, anime shading, see-through cutaway).

## Name

Working title is **Prestige and Infamy**. **Infamy** is the other candidate. Not decided yet.
