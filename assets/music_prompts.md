# Music prompts

Suno prompts for the game's background music (Tim, 2026-10-29). Set Suno to **Instrumental** and put `vocals, singing, lyrics` in Exclude styles. Make release tracks on a paid Suno plan (free-plan tracks are not licensed for commercial use).

Files go in `assets/music/` as mp3 with plain snake_case names (no spaces or Japanese characters; keep the Japanese name as the `title`). The playlist is not scanned from the folder: menu tracks go in `INTRO_TRACKS` and gameplay-only tracks in `GAME_TRACKS` in `game/src/menu_music.js` (the in-game shuffle in `game/src/game_music.js` plays `GAME_TRACKS`, which includes the intro tracks). In-game tracks so far: the two intro tracks, `harbor_morning.mp3` (港の朝, from the Daytime streets prompt) and `lanternlit_alley.mp3`.

House style: traditional Japanese instruments (shamisen, shakuhachi, koto, taiko) over a restrained modern beat (subtle trap hi-hats, sub-bass, dub echo), rain-soaked night mood, loop-ready ending, polished cinematic mix. Vary mood, tempo and lead instrument between tracks.

## Main menu theme (used for the current tracks)

`intro_rain_city.mp3` (雨の街の静寂), `intro_rain_night.mp3`. Partial prompt as Tim saved it:

```
Instrumental Japanese crime-game main-menu theme, slow confident 75 BPM groove, dark atmospheric shamisen phrases carrying a memorable clear Japanese melodic hook, breathy shakuhachi responses, sparse koto plucks, restrained taiko accents blended with subtle trap hi-hats, warm sub-bass, dub echo, textured electronica, rain-soaked late-night street mood, lantern-lit tension and quiet swagger, Gradual entrance, spacious evolving layers, organic timbres against understated modern beat, seamless loop-ready ending, polished cinematic game soundtrack mix
```

## Daytime streets (calm, dawn/day)

```
Instrumental Japanese crime-game exploration theme, relaxed 85 BPM lo-fi groove, bright koto melody with a warm memorable hook, airy shakuhachi phrases, soft hand percussion and brushed snare, mellow Rhodes chords, light vinyl crackle, morning harbor and market bustle feel, calm but watchful, gentle swing, spacious mix, seamless loop-ready ending, polished cinematic game soundtrack
```

## Night raid (tense, building)

```
Instrumental Japanese crime-game night tension theme, 95 BPM pulsing groove, low ominous taiko and heavy sub-bass, sharp staccato shamisen riffs, rising string ostinato, dark synth drones, tight trap hi-hats and rimshots, lantern-lit alleys before a raid, creeping suspense that slowly builds, no big drop, restrained power, seamless loop-ready ending, polished cinematic game soundtrack mix
```

## Shinobi stealth (sparse, mysterious)

```
Instrumental Japanese ninja stealth theme, slow 70 BPM, sparse muted koto plucks, whispery breathy shakuhachi, soft frame drum and wood clicks, deep reverb and dub echo, low cello drone, misty forest at midnight, secretive and patient, lots of silence between phrases, minimal beat, seamless loop-ready ending, polished cinematic game soundtrack mix
```
