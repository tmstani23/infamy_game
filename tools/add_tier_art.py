"""Cut the town hall and stockade tier art (Tim 2026-11-20) into game/art/buildings.

    python tools/add_tier_art.py [--preview out.png]

Sources in assets/environment:
  upgrade_buildings_cut.png: the 3 x 2 sheet upgrade_buildings.png with its painted background taken out (done
    outside the game folder; the original is kept). Top row settlement hall, village hall, magistrate compound;
    bottom row stockade tiers 1 to 3. Used: the magistrate compound (town hall tier 1) and the three stockades.
  townhouses1.png (transparent, 2 x 1): the left hall is town hall tier 2; the right one faces the wrong way, unused.
  townhall3.png (transparent, one building): town hall tier 3.
frontier.json townArt._byTier picks them by town hall tier; the manor stays the capital's building.
Cutting and catalog entries as in tools/add_zone_variants_art.py. Then run tools/build_art_blockers.py.
"""
import add_zone_variants_art as z

SHEETS = {
    # town_hall_1 and the stockades now come from single large paintings: tools/add_tier_singles.py (2026-11-22)
    'upgrade_buildings_cut.png': (3, 2, [(None, 0, {}), (None, 0, {}), (None, 0, {}),
                                         (None, 0, {}), (None, 0, {}), (None, 0, {})]),
    'townhouses1.png': (2, 1, [('town_hall_2', 500, {'glows': True}), (None, 0, {})]),
    'townhall3.png': (1, 1, [('town_hall_3', 500, {'glows': True})]),
}
z.ROWS_OF.update({2: 1, 1: 1})

if __name__ == '__main__':
    z.main(SHEETS)
