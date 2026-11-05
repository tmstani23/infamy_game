// Classic rule set: the city game with its season and Renown. No island, no towns, no settlers.
// Imports nothing from sim/frontier (guarded by tools/test_mode_separation.mjs).
export const classic = Object.freeze({ id: 'classic', label: 'Classic', seasonEnds: true, island: false, founding: false });
