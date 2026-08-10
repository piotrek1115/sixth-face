import { Mesh, PlaneGeometry, MeshStandardMaterial, Group, GridHelper, BoxGeometry, MeshBasicMaterial } from 'three';
import { BOARD_SIZE } from '../core/board.js';

export const TILE = 1.6;
// A real cube's resting height above the ground and how far it travels per
// roll are the SAME number (its own half-edge) — that's what makes rolling
// exact. So the animation pivot math always uses TILE/2, independent of
// whatever visual margin the rendered die geometry uses (see diceMesh.js).
export const DIE_HALF = TILE / 2;
const HALF = ((BOARD_SIZE - 1) * TILE) / 2;

/** Grid (x,z) -> world (x,z). Board center sits at world origin. */
export function gridToWorld(x, z) {
  return { x: x * TILE - HALF, z: z * TILE - HALF };
}

export const BOARD_THEMES = {
  dark: { base: 0x1b2029, tileA: 0x232a36, tileB: 0x1e242e, gridMain: 0x3a4356, gridSub: 0x2a3140 },
  light: { base: 0xe4e7ed, tileA: 0xf1f2f5, tileB: 0xdadde3, gridMain: 0xb0b4bd, gridSub: 0xc7cad1 },
};

/** Builds the board group for the given theme ('dark' | 'light'). Rebuild
 *  (don't mutate) when the theme changes — GridHelper bakes its two colors
 *  into vertex data, so swapping them cleanly means making a new one. */
export function buildBoard(theme = 'dark') {
  const colors = BOARD_THEMES[theme] ?? BOARD_THEMES.dark;
  const group = new Group();

  const size = BOARD_SIZE * TILE;
  const base = new Mesh(
    new PlaneGeometry(size, size),
    new MeshStandardMaterial({ color: colors.base, roughness: 0.95 })
  );
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  group.add(base);

  // Checker tint so tiles/rows read clearly from the tactical camera angle.
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let z = 0; z < BOARD_SIZE; z++) {
      const { x: wx, z: wz } = gridToWorld(x, z);
      const tint = (x + z) % 2 === 0 ? colors.tileA : colors.tileB;
      const tile = new Mesh(
        new PlaneGeometry(TILE * 0.96, TILE * 0.96),
        new MeshStandardMaterial({ color: tint, roughness: 0.9 })
      );
      tile.rotation.x = -Math.PI / 2;
      tile.position.set(wx, 0.005, wz);
      tile.receiveShadow = true;
      tile.userData.tileX = x;
      tile.userData.tileZ = z;
      tile.name = `tile-${x}-${z}`;
      group.add(tile);
    }
  }

  const grid = new GridHelper(size, BOARD_SIZE, colors.gridMain, colors.gridSub);
  grid.position.y = 0.01;
  group.add(grid);

  return group;
}

/** A thin glowing highlight quad dropped on a tile to mark legal moves/targets. */
export function makeHighlight(color) {
  const mesh = new Mesh(
    new PlaneGeometry(TILE * 0.86, TILE * 0.86),
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.visible = false;
  return mesh;
}
