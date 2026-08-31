import { Mesh, PlaneGeometry, MeshStandardMaterial, Group, GridHelper, BoxGeometry, MeshBasicMaterial,
         RingGeometry, CylinderGeometry } from 'three';
import { BOARD_SIZE, TERRAIN } from '../core/board.js';

export const TILE = 1.6;
// A real cube's resting height above the ground and how far it travels per
// roll are the SAME number (its own half-edge) — that's what makes rolling
// exact. So the animation pivot math always uses TILE/2, independent of
// whatever visual margin the rendered die geometry uses (see diceMesh.js).
export const DIE_HALF = TILE / 2;
// Rozmiar planszy, którą renderer aktualnie pokazuje. Rdzeń trzyma go w
// partii (game.boardSize) i to jest jedyne miejsce prawdy; tutaj mamy kopię,
// bo widok jest z natury pojedynczy — jedna scena, jedna plansza — a
// przewlekanie rozmiaru przez każde gridToWorld() w main.js zamieniłoby
// wszystkie wywołania w szum. Ustawiane raz na rozdanie, przez setBoardSize().
let boardSize = BOARD_SIZE;
let HALF = ((boardSize - 1) * TILE) / 2;

/** Powiedz rendererowi, jak duża jest plansza tej partii. Wywoływać PRZED
 *  buildBoard()/gridToWorld(), czyli przy każdym nowym rozdaniu. */
export function setBoardSize(n) {
  boardSize = n;
  HALF = ((boardSize - 1) * TILE) / 2;
}

export function getBoardSize() {
  return boardSize;
}

/** Grid (x,z) -> world (x,z). Board center sits at world origin. */
export function gridToWorld(x, z) {
  return { x: x * TILE - HALF, z: z * TILE - HALF };
}

export const BOARD_THEMES = {
  dark: {
    base: 0x1b2029, tileA: 0x232a36, tileB: 0x1e242e, gridMain: 0x3a4356, gridSub: 0x2a3140,
    wall: 0x6b6f78, wallTop: 0x878c96, mud: 0x4a3a24,
    shrine: 0xc9a227, relic: 0x64d2c4,
  },
  light: {
    base: 0xe4e7ed, tileA: 0xf1f2f5, tileB: 0xdadde3, gridMain: 0xb0b4bd, gridSub: 0xc7cad1,
    wall: 0x9aa0aa, wallTop: 0xc3c8d0, mud: 0x8a7048,
    shrine: 0x8a6f10, relic: 0x1f8e80,
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

/** Cele: kapliczki jako złote ramki na kafelku, relikwie jako niski dysk.
 *  Rysowane w warstwie terenu, bo dzielą jej cykl życia — jedno i drugie jest
 *  własnością mapy, nie kostek. */
function drawObjectives(layer, colors, objectives = [], relics = []) {
  for (const o of objectives) {
    const { x: wx, z: wz } = gridToWorld(o.x, o.z);
    const ring = new Mesh(
      new RingGeometry(TILE * 0.34, TILE * 0.44, 4),
      new MeshBasicMaterial({ color: colors.shrine, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.rotation.z = Math.PI / 4;
    ring.position.set(wx, 0.02, wz);
    layer.add(ring);
  }
  for (const r of relics) {
    // Niesiona relikwia jedzie z kostką, więc jej znacznik siedzi wyżej,
    // żeby nie ginął pod nią.
    const { x: wx, z: wz } = gridToWorld(r.x, r.z);
    const disc = new Mesh(
      new CylinderGeometry(TILE * 0.17, TILE * 0.17, TILE * 0.08, 12),
      new MeshStandardMaterial({ color: colors.relic, roughness: 0.4, emissive: colors.relic, emissiveIntensity: 0.25 })
    );
    disc.position.set(wx, r.carrier ? TILE * 0.92 : TILE * 0.04, wz);
    layer.add(disc);
  }
}

/** Wipe and redraw the terrain layer from the game's terrain map. */
export function syncTerrain(layer, terrain, theme = 'dark', objectives = [], relics = []) {
  const colors = BOARD_THEMES[theme] ?? BOARD_THEMES.dark;
  for (const child of [...layer.children]) {
    child.geometry.dispose();
    child.material.dispose();
    layer.remove(child);
  }
  drawObjectives(layer, colors, objectives, relics);
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

  const size = boardSize * TILE;
  const base = new Mesh(
    new PlaneGeometry(size, size),
    new MeshStandardMaterial({ color: colors.base, roughness: 0.95 })
  );
  base.rotation.x = -Math.PI / 2;
  base.receiveShadow = true;
  group.add(base);

  // Checker tint so tiles/rows read clearly from the tactical camera angle.
  for (let x = 0; x < boardSize; x++) {
    for (let z = 0; z < boardSize; z++) {
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

  const grid = new GridHelper(size, boardSize, colors.gridMain, colors.gridSub);
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
