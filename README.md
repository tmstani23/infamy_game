# Infamy

Infamy is a browser strategy game set in 1870s Japan, in development. You lead a clan in a port town: hire and command a crew, own businesses, fight rival clans and deal with the police. In the campaign you can also take settlers out to an island to found and build towns.

![Infamy's clan and difficulty selection screen](screenshots/start-screen.png)

## Features

- **Three clans:** Yakuza (ronin hero, thugs and brutes), Kuroda (spear-and-shield leader, spearmen) and Shinobi (stealth and contracts).
- **Hero and crew:** you control your clan's leader directly and command a crew across the city's districts.
- **Businesses and raids:** owned businesses pay out; at night clans can raid each other's businesses.
- **The city:** townsfolk, police, clinics and building interiors.
- **The island (campaign):** explore, scout sites, deal with bandit camps, found towns and build them with workers, roads, farms and markets.
- **Bot clans:** rivals use the same commands as the player, in the city and on the island.

## Screenshots

| City combat | City map and deployment |
|---|---|
| ![Crew fighting in the port town at night](screenshots/city-combat.png) | ![City sectors and crew deployment](screenshots/city-deployment.png) |
| **Island atlas** | **Founding on the frontier** |
| ![Illustrated world atlas with named regions and crossings](screenshots/island-atlas.png) | ![An expedition with settlers at a frontier founding site](screenshots/frontier-founding.png) |

**Inside the inn hideout**

![A crew and settlers inside the inn hideout](screenshots/inn-interior.png)

*Screenshots from a development build.*

## Play it

1. Install [Node.js](https://nodejs.org/). The game needs an internet connection.
2. On Windows, double-click `start_game.bat`. It opens the game in your browser; leave its window open while you play. (Or run `node game/server.mjs --open` from this folder.)
3. Pick a clan, a difficulty and a mode (Classic city match or Campaign), and start.

Controls are listed in [docs/controls.md](docs/controls.md).

## Status

Early development. The city game is playable against bot clans. The campaign (founding towns, building and exploring the island) is being built now. Single-player with bots today; multiplayer is planned.

---

For developers: [START_HERE.md](START_HERE.md) and the [developer guide](docs/developer_guide.md).
