import { Mesh, PlaneGeometry, MeshStandardMaterial, Group, GridHelper, BoxGeometry, MeshBasicMaterial } from 'three';
import { BOARD_SIZE, TERRAIN } from '../core/board.js';

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
  dark: {
    base: 0x1b2029, tileA: 0x232a36, tileB: 0x1e242e, gridMain: 0x3a4356, gridSub: 0x2a3140,
    wall: 0x6b6f78, wallTop: 0x878c96, mud: 0x4a3a24,
  },
  light: {
    base: 0xe4e7ed, tileA: 0xf1f2f5, tileB: 0xdadde3, gridMain: 0xb0b4bd, gridSub: 0xc7cad1,
    wall: 0x9aa0aa, wallTop: 0xc3c8d0, mud: 0x8a7048,
  },
};

/** Terrain lives in its own group so it can be rebuilt on its own — the board
 *  underneath is built once per theme, but terrain changes whenever someone
 *  edits the map. */
export function buildTerrainLayer() {
  const g = new Group();
  g.name = 'terrain';
  return g;
}

const WALL_HEIGHT = TILE * 0.55;

/** Wipe and redraw the terrain layer from the game's terrain map. */
export function syncTerrain(layer, terrain, theme = 'dark') {
  const colors = BOARD_THEMES[theme] ?? BOARD_THEMES.dark;
  for (const child of [...layer.children]) {
    child.geometry.dispose();
    child.material.dispose();
    layer.remove(child);
  }
  if (!terrain) return;

  for (const [key, type] of terrain) {
    const [x, z] = key.split(',').map(Number);
    const { x: wx, z: wz } = gridToWorld(x, z);

    if (type === TERRAIN.WALL) {
      // Deliberately tall enough to read as an obstacle from the tactical
      // camera, but below the dice so it never hides one behind it.
      const block = new Mesh(
        new BoxGeometry(TILE * 0.92, WALL_HEIGHT, TILE * 0.92),
        new MeshStandardMaterial({ color: colors.wall, roughness: 0.95, flatShading: true })
      );
      block.position.set(wx, WALL_HEIGHT / 2, wz);
      block.castShadow = true;
      block.receiveShadow = true;
      layer.add(block);

      const cap = new Mesh(
        new PlaneGeometry(TILE * 0.92, TILE * 0.92),
        new MeshStandardMaterial({ color: colors.wallTop, roughness: 0.9 })
      );
      cap.rotation.x = -Math.PI / 2;
      cap.position.set(wx, WALL_HEIGHT + 0.01, wz);
      layer.add(cap);
    }

    if (type === TERRAIN.MUD) {
      const pool = new Mesh(
        new PlaneGeometry(TILE * 0.94, TILE * 0.94),
        new MeshStandardMaterial({ color: colors.mud, roughness: 1 })
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(wx, 0.012, wz);
      pool.receiveShadow = true;
      layer.add(pool);
    }
  }
}

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
