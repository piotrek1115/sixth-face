// Domyślny rozmiar. Plansza jest jednak własnością partii, nie modułu —
// przebudowa na skirmish zmienia ją na mniejszą, a mierzyć trzeba kilka
// rozmiarów w jednym procesie.
export const BOARD_SIZE = 7;

export function inBounds(x, z, size = BOARD_SIZE) {
  return x >= 0 && x < size && z >= 0 && z < size;
}

export function unitAt(units, x, z) {
  return units.find((u) => u.alive && u.x === x && u.z === z) || null;
}

/** Terrain. Measured problem this exists to solve: every tile was identical
 *  and every unit threatened exactly one tile ahead, so position carried no
 *  information — half the army never even changed column, and widening the
 *  board from 6x6 to 7x7 changed nothing at all.
 *
 *  MUD is the type that only this game can have. It does not slow you down;
 *  it stops the die from TIPPING. Since tipping is the only way to change
 *  which ability you have, mud is terrain that restricts access to your own
 *  abilities rather than to your movement — you walk in carrying whatever
 *  face is up, and you walk out with the same one. No game whose units are
 *  figures can express that.
 */
export const TERRAIN = {
  OPEN: 'open',
  WALL: 'wall', // impassable, and blows do not travel through it
  MUD: 'mud', // enter and leave on foot; no tipping in, out of, or inside it
};

/** Terrain is a per-game Map keyed "x,z" so a custom board can carry its own,
 *  rather than a module-level grid every game would share. */
export function terrainAt(terrain, x, z) {
  return terrain?.get(`${x},${z}`) ?? TERRAIN.OPEN;
}

export function isWall(terrain, x, z) {
  return terrainAt(terrain, x, z) === TERRAIN.WALL;
}

export function isMud(terrain, x, z) {
  return terrainAt(terrain, x, z) === TERRAIN.MUD;
}
