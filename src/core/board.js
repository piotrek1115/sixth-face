export const BOARD_SIZE = 6;

export function inBounds(x, z) {
  return x >= 0 && x < BOARD_SIZE && z >= 0 && z < BOARD_SIZE;
}

export function unitAt(units, x, z) {
  return units.find((u) => u.alive && u.x === x && u.z === z) || null;
}
