import { CubeOrientation, DIRECTION_VECTORS, DIR_ORDER, WORLD_UP, nextDir, oppositeDir } from './orientation.js';
import { UNIT_TYPES, labelForAxisKey, WOUNDED_LABEL } from './units.js';

let nextId = 1;

export class Unit {
  constructor(unitTypeId, faction, x, z, facing) {
    const type = UNIT_TYPES[unitTypeId];
    this.id = nextId++;
    this.unitTypeId = unitTypeId;
    this.type = type;
    this.faction = faction;
    this.x = x;
    this.z = z;
    // `facing` is deliberately independent state (compass enum), changed only
    // by TURN. It is NOT derived from the roll quaternion — see orientation.js
    // header and the design notes in docs/orientation-notes.md.
    this.facing = facing;
    this.orientation = new CubeOrientation();
    this.alive = true;
    this.eliminatedBy = null; // 'hit' | null
    this.lastHitRolls = []; // directions the most recent hit tumbled the die
  }

  /** True while this unit's wound face is the one showing. Deliberately
   *  derived live from the die rather than stored: the wound IS the face,
   *  which is what keeps the brief's "no HP, no counters" rule intact. */
  get isWounded() {
    return this.topLabel === WOUNDED_LABEL;
  }

  get topLabel() {
    const axisKey = this.orientation.localAxisPointingTo(WORLD_UP);
    return labelForAxisKey(this.unitTypeId, axisKey);
  }

  labelOnCompass(dir) {
    const axisKey = this.orientation.axisKeyForCompass(dir);
    return labelForAxisKey(this.unitTypeId, axisKey);
  }

  get frontLabel() { return this.labelOnCompass(this.facing); }
  get backLabel() { return this.labelOnCompass(oppositeDir(this.facing)); }
  get rightDir() {
    // right = forward × up (right-hand rule), snapped to the nearest compass key.
    const f = DIRECTION_VECTORS[this.facing];
    // up = (0,1,0); cross(f, up) = (f.y*0 - f.z*1, f.z*0 - f.x*0, f.x*1 - f.y*0) = (-f.z, 0, f.x)
    const rx = -f.z, rz = f.x;
    for (const [dir, v] of Object.entries(DIRECTION_VECTORS)) {
      if (Math.round(v.x) === Math.round(rx) && Math.round(v.z) === Math.round(rz)) return dir;
    }
    throw new Error('rightDir: no compass match');
  }
  get leftDir() { return oppositeDir(this.rightDir); }
  get rightLabel() { return this.labelOnCompass(this.rightDir); }
  get leftLabel() { return this.labelOnCompass(this.leftDir); }

  snapshotLabels() {
    const s = this.orientation.snapshot();
    const out = {};
    for (const [role, axisKey] of Object.entries(s)) out[role] = labelForAxisKey(this.unitTypeId, axisKey);
    return out;
  }

  /** How many quarter-turns a roll in `dir` performs. Normally 1 — but a unit
   *  can never come to rest on its own wound face, so if the first turn would
   *  land there the die keeps turning and takes 2. This is what lets Wounded
   *  live opposite Guard (on the axis combat happens along) without marching
   *  ever wounding you — see the note at the top of units.js.
   *
   *  Note this counts TURNS, not tiles: a roll always travels exactly one
   *  tile (see applyMove). */
  rollTurns(dir) {
    const probe = this.orientation.clone();
    probe.roll(dir);
    const wouldLandWounded = labelForAxisKey(this.unitTypeId, probe.snapshot().top) === WOUNDED_LABEL;
    return wouldLandWounded ? 2 : 1;
  }

  /** Own move (roll). Never wounds and never kills — it turns past the wound
   *  face rather than resting on it.
   *
   *  A roll ALWAYS covers exactly one tile, even when the skip makes the die
   *  turn twice. Distance and rotation are deliberately decoupled here: a
   *  roll that sometimes carried you two tiles made movement unpredictable
   *  and could fling a unit past the enemy it was walking up to. The die
   *  giving an extra quarter-turn as it settles is the price of dodging the
   *  wound face; the tile you end on is not.
   *
   *  Returns the number of quarter-turns taken, so the renderer can play the
   *  extra one — the drawn cube must never disagree with the logical one. */
  applyMove(dir) {
    const turns = this.rollTurns(dir);
    for (let i = 0; i < turns; i++) this.orientation.roll(dir);
    this.x += DIRECTION_VECTORS[dir].x;
    this.z += DIRECTION_VECTORS[dir].z;
    return turns;
  }

  /** The same tumble, but the die is turned on the spot instead of travelling.
   *  This is what lets a unit change its active face while in contact: an
   *  ordinary roll always gives up the tile it is standing on, so a unit
   *  boxed in by the enemy it wants to hit could never arm itself.
   *
   *  It skips the wound face exactly like a travelling roll does, so the
   *  "you can never put yourself on Wounded" invariant holds either way.
   *  Returns the number of quarter-turns taken, for the animation. */
  applyRollInPlace(dir) {
    const turns = this.rollTurns(dir);
    for (let i = 0; i < turns; i++) this.orientation.roll(dir);
    return turns;
  }

  /** A sideways STEP: pure slide, no physical tip. Orientation and facing are
   *  both left completely untouched — only the tile position changes. */
  applyStep(dir) {
    this.x += DIRECTION_VECTORS[dir].x;
    this.z += DIRECTION_VECTORS[dir].z;
  }

  /** Own turn — spins facing + orientation together (top face is provably unaffected). */
  applyTurn(clockwise = true) {
    this.orientation.spin(clockwise);
    this.facing = nextDir(this.facing, clockwise);
  }

  /** A roll direction that would bring the wound face to the top, preferring
   *  `preferred` (the physically natural "away from the attacker" one) when
   *  that already works. Returns null if the wound face can't be reached in
   *  one 90° turn — which is exactly the case while Guard is showing, since
   *  the wound face is then on the bottom. */
  directionThatWounds(preferred) {
    const candidates = preferred ? [preferred, ...DIR_ORDER] : DIR_ORDER;
    for (const dir of candidates) {
      const probe = this.orientation.clone();
      probe.roll(dir);
      if (labelForAxisKey(this.unitTypeId, probe.snapshot().top) === WOUNDED_LABEL) return dir;
    }
    return null;
  }

  /** Resolve a hit along the damage ladder:
   *
   *    Guard  --(frontal hit)-->  disarmed  --(hit)-->  Wounded  --(hit)-->  dead
   *    Guard  --(flank hit)------------------------->  Wounded  --(hit)-->  dead
   *
   *  Every rung is still a genuine 90° tumble of the cube — but the AXIS is
   *  chosen to land the ladder's next rung rather than always being "away
   *  from the attacker". That's a deliberate trade: damage becomes fully
   *  predictable (3 hits frontally, 2 from a flank) instead of depending on
   *  whether successive hits happened to come from the same side.
   *
   *  "Disarmed" needs no face of its own — it simply means an ability face is
   *  showing instead of Guard. Being ready to strike IS being exposed.
   *
   *  Returns true on elimination. */
  applyHit(awayFromAttackerDir, { push = false, disarmOnly = false } = {}) {
    // Every direction the die actually tumbled, in order. The renderer replays
    // exactly these so the drawn cube can never drift from the logical one —
    // it previously guessed the rotation from the attack direction, which is
    // wrong now that the ladder picks the axis.
    this.lastHitRolls = [];

    if (this.isWounded) {
      // Cosmetic tumble as it goes down. The unit leaves the board either
      // way, so its final orientation carries no rules.
      this.orientation.roll(awayFromAttackerDir);
      this.lastHitRolls.push(awayFromAttackerDir);
      this.alive = false;
      this.eliminatedBy = 'hit';
      return true;
    }

    // A disarming hit deliberately keeps the physical direction — it reads as
    // the shield being knocked aside, and it provably cannot wound (from
    // Guard on top the wound face is on the bottom, out of reach of a single
    // quarter turn).
    if (disarmOnly) {
      this.orientation.roll(awayFromAttackerDir);
      this.lastHitRolls.push(awayFromAttackerDir);
      return false;
    }

    const dir = this.directionThatWounds(awayFromAttackerDir);
    if (dir) {
      this.orientation.roll(dir);
      this.lastHitRolls.push(dir);
    } else {
      // No single turn reaches the wound face, which happens exactly when
      // Guard is still up — i.e. a flank hit that skips the disarm rung. The
      // die is knocked clean over instead: two tumbles in the attack
      // direction, which lands the bottom (the wound face) on top. Getting
      // caught with your shield facing the wrong way costs you the whole
      // disarm step.
      this.orientation.roll(awayFromAttackerDir);
      this.orientation.roll(awayFromAttackerDir);
      this.lastHitRolls.push(awayFromAttackerDir, awayFromAttackerDir);
    }

    if (push) {
      this.x += DIRECTION_VECTORS[awayFromAttackerDir].x;
      this.z += DIRECTION_VECTORS[awayFromAttackerDir].z;
    }
    return false;
  }
}
