// CubeOrientation — THE single source of truth for a unit's physical die orientation.
//
// A unit's die never has "visualRotation" and "activeFace" tracked separately.
// Everything (top/bottom/front/back/left/right, renderer pose, debug panel) is
// derived live from ONE THREE.Quaternion. Two things mutate it:
//   - roll(dir)  : the die physically tips 90° over an edge, moving to the next tile.
//   - spin(cw)   : the die physically spins 90° about the vertical (world Y) axis,
//                  in place — used both by TURN and internally by hit().
//
// LOCAL_AXES are fixed directions in the die's own body frame — literally which
// physical corner of the printed cube each face label lives on. They never change.
// At spawn (identity quaternion) local axes coincide with world axes, so whatever
// label is assigned to LOCAL_AXES.top is what's visually on top at game start.
import { Quaternion, Vector3 } from 'three';

export const LOCAL_AXES = {
  top: new Vector3(0, 1, 0),
  bottom: new Vector3(0, -1, 0),
  north: new Vector3(0, 0, -1),
  south: new Vector3(0, 0, 1),
  east: new Vector3(1, 0, 0),
  west: new Vector3(-1, 0, 0),
};

export const WORLD_UP = new Vector3(0, 1, 0);

export const DIRECTION_VECTORS = {
  N: new Vector3(0, 0, -1),
  E: new Vector3(1, 0, 0),
  S: new Vector3(0, 0, 1),
  W: new Vector3(-1, 0, 0),
};

// Clockwise-from-above compass cycle, shared by TURN and facing bookkeeping.
export const DIR_ORDER = ['N', 'E', 'S', 'W'];

export function oppositeDir(dir) {
  return DIR_ORDER[(DIR_ORDER.indexOf(dir) + 2) % 4];
}

export function nextDir(dir, clockwise = true) {
  const i = DIR_ORDER.indexOf(dir);
  return DIR_ORDER[(i + (clockwise ? 1 : 3)) % 4];
}

// Which world-direction key an axis-key (as returned by localAxisPointingTo) maps to,
// used when reading FRONT/BACK/LEFT/RIGHT relative to a unit's `facing`.
const DIR_TO_AXIS_KEY = { N: 'north', E: 'east', S: 'south', W: 'west' };

export class CubeOrientation {
  constructor() {
    this.q = new Quaternion();
  }

  clone() {
    const c = new CubeOrientation();
    c.q.copy(this.q);
    return c;
  }

  /** Physically tip the die over the edge toward world direction `dir` ('N'|'E'|'S'|'W'). */
  roll(dir) {
    this._tip(DIRECTION_VECTORS[dir]);
  }

  /** Physically spin the die 90° about the world vertical axis, in place. */
  spin(clockwise = true) {
    const angle = clockwise ? -Math.PI / 2 : Math.PI / 2;
    const delta = new Quaternion().setFromAxisAngle(WORLD_UP, angle);
    this.q.premultiply(delta);
    this.q.normalize();
  }

  /** A HIT rotates the target exactly like a roll, in the direction away from the
   *  attacker — but the caller decides separately whether the tile position moves
   *  (only true for a push/Bash). */
  hit(awayFromAttackerDir) {
    this.roll(awayFromAttackerDir);
  }

  _tip(d) {
    // Rolling toward world direction d tips the cube about the horizontal axis
    // perpendicular to both "up" and d. Sign verified against a rolling-wheel
    // reference: axis = up × d gives a positive (right-hand) quarter turn that
    // carries the current top face to become the new leading face in direction d.
    const axis = new Vector3().crossVectors(WORLD_UP, d).normalize();
    const delta = new Quaternion().setFromAxisAngle(axis, Math.PI / 2);
    this.q.premultiply(delta);
    this.q.normalize();
  }

  /** Which LOCAL axis key currently points toward the given WORLD unit vector. */
  localAxisPointingTo(worldDir) {
    let best = null;
    let bestDot = -Infinity;
    for (const key of Object.keys(LOCAL_AXES)) {
      const worldPos = LOCAL_AXES[key].clone().applyQuaternion(this.q);
      const dot = worldPos.dot(worldDir);
      if (dot > bestDot) {
        bestDot = dot;
        best = key;
      }
    }
    return best;
  }

  /** Full map of which local-axis-key currently occupies each of the 6 world roles. */
  snapshot() {
    return snapshotFromQuaternion(this.q);
  }

  /** Local-axis-key currently on the world-compass side `dir` ('N'|'E'|'S'|'W').
   *  NOTE: this resolves through the live snapshot, not a static spawn-time
   *  mapping — after any roll, a different local axis can be sitting on a
   *  given compass side than the one that started there. */
  axisKeyForCompass(dir) {
    return this.snapshot()[DIR_TO_AXIS_KEY[dir]];
  }
}

/** Pure function version of CubeOrientation.snapshot(), taking any quaternion.
 *  Used so the renderer's live mesh transform and the debug panel can derive
 *  labels from the EXACT SAME source — including mid-animation — instead of a
 *  second, potentially-out-of-sync copy of the orientation. */
export function snapshotFromQuaternion(q) {
  const find = (worldDir) => {
    let best = null;
    let bestDot = -Infinity;
    for (const key of Object.keys(LOCAL_AXES)) {
      const worldPos = LOCAL_AXES[key].clone().applyQuaternion(q);
      const dot = worldPos.dot(worldDir);
      if (dot > bestDot) {
        bestDot = dot;
        best = key;
      }
    }
    return best;
  };
  return {
    top: find(WORLD_UP),
    bottom: find(new Vector3(0, -1, 0)),
    north: find(DIRECTION_VECTORS.N),
    south: find(DIRECTION_VECTORS.S),
    east: find(DIRECTION_VECTORS.E),
    west: find(DIRECTION_VECTORS.W),
  };
}
