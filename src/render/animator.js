import { Vector3, Quaternion } from 'three';
import { WORLD_UP, DIRECTION_VECTORS } from '../core/orientation.js';
import { DIE_HALF } from './board.js';
import { TOP_Y } from './diceMesh.js';

function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** A real physical tip-over: the die's pivot is the bottom edge shared by the
 *  origin and destination tiles, so the mesh arcs up and over exactly like a
 *  rolling die would, and lands with the same quaternion CubeOrientation.roll()
 *  computes logically — no separate "visual rotation" ever exists.
 *
 *  The on-die guard/attack indicator is hidden for the whole tumble (which
 *  face ends up on top is genuinely ambiguous mid-roll) and revealed by the
 *  caller via view.syncFacing(toWorld) once the animation finishes. */
export class RollAnimation {
  constructor(view, worldFrom, worldTo, dir, fromQuat, duration = 0.32) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.dir = dir;
    this.toWorld = worldTo;
    this.fromQuat = fromQuat.clone();
    this.axis = new Vector3().crossVectors(WORLD_UP, DIRECTION_VECTORS[dir]).normalize();
    this.pivot = new Vector3(
      worldFrom.x + DIRECTION_VECTORS[dir].x * DIE_HALF,
      0,
      worldFrom.z + DIRECTION_VECTORS[dir].z * DIE_HALF
    );
    const startPos = new Vector3(worldFrom.x, DIE_HALF, worldFrom.z);
    this.relPos = startPos.clone().sub(this.pivot);
    this.fromArrow = new Vector3(worldFrom.x, 0.03, worldFrom.z);

    view.guardBar.visible = false;
    view.attackArrow.visible = false;
  }

  /** Returns true once finished. */
  update(dt) {
    const toWorld = this.toWorld;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutQuad(t);
    const angle = eased * (Math.PI / 2);
    const deltaQ = new Quaternion().setFromAxisAngle(this.axis, angle);

    const pos = this.relPos.clone().applyQuaternion(deltaQ).add(this.pivot);
    this.view.dieMesh.position.copy(pos);
    this.view.dieMesh.quaternion.copy(this.fromQuat).premultiply(deltaQ);

    // Facing doesn't rotate on a roll — the ground tick just glides to the
    // new tile (the on-die indicators stay hidden until the caller reveals
    // them via syncFacing once this animation is done).
    const facingDir = DIRECTION_VECTORS[this.view.unit.facing];
    this.view.facingArrow.position.lerpVectors(
      new Vector3(this.fromArrow.x + facingDir.x * 0.62, 0.03, this.fromArrow.z + facingDir.z * 0.62),
      new Vector3(toWorld.x + facingDir.x * 0.62, 0.03, toWorld.z + facingDir.z * 0.62),
      eased
    );
    this.view.syncRing(
      this.fromArrow.x + (toWorld.x - this.fromArrow.x) * eased,
      this.fromArrow.z + (toWorld.z - this.fromArrow.z) * eased
    );

    return t >= 1;
  }
}

/** A sideways STEP: a pure slide with a small hop for tactile feedback — no
 *  tumble, because orientation genuinely doesn't change (see unit.applyStep).
 *  Every facing-linked marker rides along via syncFacing each frame, so the
 *  guard/attack indicator (which doesn't change during a step) never needs
 *  to be hidden. */
export class StepAnimation {
  constructor(view, worldFrom, worldTo, duration = 0.22) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.from = new Vector3(worldFrom.x, DIE_HALF, worldFrom.z);
    this.to = new Vector3(worldTo.x, DIE_HALF, worldTo.z);
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutQuad(t);
    const pos = this.from.clone().lerp(this.to, eased);
    pos.y += Math.sin(eased * Math.PI) * 0.16; // a little shuffle-hop, not a tumble
    this.view.dieMesh.position.copy(pos);
    this.view.syncFacing(pos.x, pos.z);
    this.view.syncRing(pos.x, pos.z);
    return t >= 1;
  }
}

/** An in-place spin about the vertical axis: TURN never moves the die to a
 *  new tile and (provably, see orientation.js) never changes the top face —
 *  so the on-die indicator (if any) stays visible throughout, just rotating
 *  in sync with the ground tick. */
export class TurnAnimation {
  constructor(view, tileWorld, fromQuat, clockwise, fromFacing, duration = 0.22) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.tileWorld = tileWorld;
    this.fromQuat = fromQuat.clone();
    this.clockwise = clockwise;
    this.fromFacingAngle = compassAngle(fromFacing);
    this.toFacingAngle = this.fromFacingAngle + (clockwise ? Math.PI / 2 : -Math.PI / 2);
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutQuad(t);
    const angle = eased * (this.clockwise ? -Math.PI / 2 : Math.PI / 2);
    const deltaQ = new Quaternion().setFromAxisAngle(WORLD_UP, angle);

    this.view.dieMesh.position.set(this.tileWorld.x, DIE_HALF, this.tileWorld.z);
    this.view.dieMesh.quaternion.copy(this.fromQuat).premultiply(deltaQ);

    const a = this.fromFacingAngle + (this.toFacingAngle - this.fromFacingAngle) * eased;
    this.view.facingArrow.position.set(this.tileWorld.x + Math.sin(a) * 0.62, 0.03, this.tileWorld.z + Math.cos(a) * 0.62);
    this.view.facingArrow.rotation.y = a;

    this.view.attackArrow.position.set(this.tileWorld.x + Math.sin(a) * 0.5, TOP_Y, this.tileWorld.z + Math.cos(a) * 0.5);
    this.view.attackArrow.rotation.y = a;
    this.view.guardBar.position.set(this.tileWorld.x + Math.sin(a) * 0.5, TOP_Y, this.tileWorld.z + Math.cos(a) * 0.5);
    // Same angle as the arrow — see diceMesh.js syncFacing() for why no
    // extra quarter turn is needed (the bar's local +X is already the
    // perpendicular-to-facing axis).
    this.view.guardBar.rotation.y = a;

    return t >= 1;
  }
}

function compassAngle(dir) {
  // matches DIRECTION_VECTORS: N=(0,0,-1), E=(1,0,0), S=(0,0,1), W=(-1,0,0)
  return { N: Math.PI, E: Math.PI / 2, S: 0, W: -Math.PI / 2 }[dir];
}

/** A hit landing on a die: it reels in place through exactly the rotations
 *  the rules performed (Unit.lastHitRolls), rather than a rotation guessed
 *  from the attack direction. That guess used to be wrong — the damage
 *  ladder picks its own axis, and a flank hit tumbles twice — and the code
 *  that was meant to detect "nothing changed" compared the MESH quaternion
 *  before and after, which game logic never touches, so it silently matched
 *  every time and skipped the animation entirely. The drawn die then stayed
 *  frozen while the logical one turned.
 *
 *  Unlike a roll this does NOT travel a tile unless the hit actually pushed
 *  the target, so the die spins on the spot with a recoil kick. */
export class HitAnimation {
  constructor(view, worldFrom, worldTo, dirs, fromQuat, impactDir, duration = 0.42) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.dirs = dirs.slice();
    this.fromQuat = fromQuat.clone();
    this.from = new Vector3(worldFrom.x, DIE_HALF, worldFrom.z);
    this.to = new Vector3(worldTo.x, DIE_HALF, worldTo.z);
    this.impact = DIRECTION_VECTORS[impactDir] ?? DIRECTION_VECTORS.N;
    view.guardBar.visible = false;
    view.attackArrow.visible = false;
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutQuad(t);

    // Walk the rotation chain: whole quarter-turns for the steps already
    // passed, plus a partial turn through the one in progress.
    const total = this.dirs.length;
    const progressed = eased * total;
    const done = Math.min(total, Math.floor(progressed));
    const partial = progressed - done;

    const q = this.fromQuat.clone();
    for (let i = 0; i < done; i++) q.premultiply(this._delta(this.dirs[i], Math.PI / 2));
    if (done < total) q.premultiply(this._delta(this.dirs[done], partial * (Math.PI / 2)));
    this.view.dieMesh.quaternion.copy(q);

    // Reel back along the blow, then settle — plus a shallow hop so the
    // impact reads even when the die isn't pushed anywhere.
    const kick = Math.sin(eased * Math.PI) * 0.18;
    const pos = this.from.clone().lerp(this.to, eased);
    pos.x += this.impact.x * kick;
    pos.z += this.impact.z * kick;
    pos.y += Math.sin(eased * Math.PI) * 0.1;
    this.view.dieMesh.position.copy(pos);
    this.view.syncRing(pos.x, pos.z);

    return t >= 1;
  }

  _delta(dir, angle) {
    const axis = new Vector3().crossVectors(WORLD_UP, DIRECTION_VECTORS[dir]).normalize();
    return new Quaternion().setFromAxisAngle(axis, angle);
  }
}

/** The attacker's jab: a short lunge toward the target and back. Purely
 *  cosmetic — it never changes the die's orientation or its tile — but
 *  without it a hit has no visible cause, only an effect. */
export class LungeAnimation {
  constructor(view, tileWorld, towardDir, duration = 0.3) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.base = new Vector3(tileWorld.x, DIE_HALF, tileWorld.z);
    this.dir = DIRECTION_VECTORS[towardDir] ?? DIRECTION_VECTORS.N;
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    // Out fast, back slower — a strike, not a sway.
    const reach = t < 0.4 ? easeInOutQuad(t / 0.4) : 1 - easeInOutQuad((t - 0.4) / 0.6);
    const pos = this.base.clone();
    pos.x += this.dir.x * reach * 0.42;
    pos.z += this.dir.z * reach * 0.42;
    pos.y += reach * 0.14;
    this.view.dieMesh.position.copy(pos);
    return t >= 1;
  }
}

/** Turning the die on its own square: the same quarter-turns as a roll, but
 *  pivoting about the die's centre instead of an edge, so it ends where it
 *  started. It lifts slightly and leans into the turn, which is what stops it
 *  reading as a glitch — a cube that changes face without going anywhere has
 *  no real-world motion to imitate, so the lift is doing the explaining. */
export class RollInPlaceAnimation {
  constructor(view, tileWorld, dir, turns, fromQuat, duration = 0.36) {
    this.view = view;
    this.duration = duration;
    this.elapsed = 0;
    this.turns = Math.max(1, turns);
    this.dir = dir;
    this.fromQuat = fromQuat.clone();
    this.base = new Vector3(tileWorld.x, DIE_HALF, tileWorld.z);
    this.axis = new Vector3().crossVectors(WORLD_UP, DIRECTION_VECTORS[dir]).normalize();
    view.guardBar.visible = false;
    view.attackArrow.visible = false;
  }

  update(dt) {
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);
    const eased = easeInOutQuad(t);

    const angle = eased * this.turns * (Math.PI / 2);
    const q = this.fromQuat.clone().premultiply(new Quaternion().setFromAxisAngle(this.axis, angle));
    this.view.dieMesh.quaternion.copy(q);

    const lift = Math.sin(eased * Math.PI);
    const pos = this.base.clone();
    pos.y += lift * 0.22;
    pos.x += DIRECTION_VECTORS[this.dir].x * lift * 0.1;
    pos.z += DIRECTION_VECTORS[this.dir].z * lift * 0.1;
    this.view.dieMesh.position.copy(pos);

    return t >= 1;
  }
}
