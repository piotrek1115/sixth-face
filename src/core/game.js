import { BOARD_SIZE, inBounds, unitAt } from './board.js';
import { DIRECTION_VECTORS, oppositeDir } from './orientation.js';
import { Unit } from './unit.js';
import {
  ATTACK_LABELS,
  PUSH_LABELS,
  RANGE_BY_LABEL,
  DEFAULT_RANGE,
  WOUNDED_LABEL,
  RALLY_LABELS,
  labelForAxisKey,
} from './units.js';

// 2, not 3 — and the reason is the damage ladder, not taste. A flank kill
// costs two attacks; if a side's whole turn budget is 3 AP, one unit can
// close AND land both hits in a single turn, so the victim never gets to
// respond (measured: games ended on turn 5 with the leader soloed down). At
// 2 AP a kill consumes your entire turn, which is the window the opponent
// needs. Measured across the AI sim: 3 AP → turn 5, 2 of 8 dead; 2 AP →
// turn 62, 5 of 8 dead, i.e. an actual battle of attrition.
const AP_PER_TURN = 2;
const STEP_COST = 1;
const ROLL_COST = 2;
// Turns of complete quiet — nobody landing a blow on anybody — after which
// the battle is called. Chess has the fifty-move rule for the same reason:
// without one, a side that is behind can simply decline to fight forever.
const STALL_LIMIT = 12;

export class Game {
  constructor({ apPerTurn = AP_PER_TURN, rallyMode = 'command', deploy = false, stallLimit = STALL_LIMIT } = {}) {
    this.apPerTurn = apPerTurn;
    // 'deploy' — players are still placing dice; no unit may act yet.
    // 'battle' — the normal game. A standard game starts straight in battle
    // with the fixed line-up; a custom game starts empty in deploy.
    this.phase = deploy ? 'deploy' : 'battle';
    // How a leader's rally face pays off:
    //   'command'  — +1 AP, but the commander itself may not act that turn
    //   'army'     — +1 AP, free
    //   'adjacent' — allies next to it roll for 1 AP instead of 2
    //   'aura2'    — same, radius 2
    //   'inspire'  — allies next to it drive through Guard instead of disarming
    //   'none'     — the rally faces do nothing
    // Kept switchable because this was a live balance question and the
    // variants are only distinguishable by measurement. 'command' won: it is
    // the only one that both gets used (90% of turns) and leaves game length
    // near the unbuffed baseline (21 turns vs 24).
    this.rallyMode = rallyMode;
    this.units = [];
    this.turnNumber = 1;
    this.currentFaction = 'humans';
    this.ap = this.apPerTurn;
    this.gameOver = false;
    this.winner = null;
    this.endReason = null; // 'leader' | 'exhaustion'
    // Turns since anyone landed a blow. Nothing else in the rules forces a
    // battle to end: a wounded die simply runs, and a pursuer of equal speed
    // can never catch it — observed as a chase lasting eleven thousand turns.
    this.stallLimit = stallLimit;
    this.turnsSinceBlood = 0;
    this.log = [];
    this._woundedActed = new Set(); // unit ids that used their one wounded action this turn
    this._leaderIsCommanding = false;
    if (!deploy) {
      this._setupUnits();
      this._pushLog(`— Turn 1: HUMANS —`);
    } else {
      this._pushLog('— Custom setup: place your dice, then start the battle —');
    }
  }

  // A full home row a side, mirrored around the leader in the centre: the
  // wings are the cheap line units and the tougher ones close ranks next to
  // the leader, so a flank attack has to chew through the weak end first.
  _setupUnits() {
    const backRow = BOARD_SIZE - 1;
    const humans = ['swordsman', 'pikeman', 'shieldbearer', 'captain', 'shieldbearer', 'pikeman', 'swordsman'];
    const orcs = ['orcBoy', 'brute', 'mauler', 'warboss', 'mauler', 'brute', 'orcBoy'];
    const firstX = Math.floor((BOARD_SIZE - humans.length) / 2); // centre the line
    humans.forEach((id, i) => this.units.push(new Unit(id, 'humans', firstX + i, 0, 'S')));
    orcs.forEach((id, i) => this.units.push(new Unit(id, 'orcs', firstX + i, backRow, 'N')));
  }

  /** Place a die during setup. Returns the new unit, or null if the tile is
   *  taken / off the board / we are no longer in the deploy phase. Units face
   *  their faction's advance direction, matching the standard line-up. */
  deployUnit(unitTypeId, faction, x, z) {
    if (this.phase !== 'deploy') return null;
    if (!inBounds(x, z) || unitAt(this.units, x, z)) return null;
    const unit = new Unit(unitTypeId, faction, x, z, faction === 'humans' ? 'S' : 'N');
    this.units.push(unit);
    this._pushLog(`Placed ${unit.type.name} (${faction}) at ${x},${z}`);
    return unit;
  }

  /** Take a die back off the board during setup. */
  undeployUnit(unit) {
    if (this.phase !== 'deploy') return false;
    const i = this.units.indexOf(unit);
    if (i < 0) return false;
    this.units.splice(i, 1);
    this._pushLog(`Removed ${unit.type.name}`);
    return true;
  }

  /** Both sides need at least one die, or there is nothing to play out. */
  canStartBattle() {
    return (
      this.phase === 'deploy' &&
      this.aliveUnits('humans').length > 0 &&
      this.aliveUnits('orcs').length > 0
    );
  }

  startBattle() {
    if (!this.canStartBattle()) return false;
    this.phase = 'battle';
    this.currentFaction = 'humans';
    this.ap = this.apPerTurn;
    this.turnNumber = 1;
    this._pushLog(`— Turn 1: HUMANS —`);
    return true;
  }

  aliveUnits(faction) {
    return this.units.filter((u) => u.alive && (!faction || u.faction === faction));
  }

  leaderOf(faction) {
    return this.units.find((u) => u.faction === faction && u.type.isLeader);
  }

  _pushLog(entry) {
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
  }

  canAct(unit) {
    if (this.phase !== 'battle') return false; // nothing acts while dice are being placed
    if (this.gameOver || !unit.alive || unit.faction !== this.currentFaction || this.ap <= 0) return false;
    // A commander who bought the army an extra AP this turn is busy issuing
    // orders and cannot act itself — the bonus is paid for with its tempo.
    if (this._leaderIsCommanding && unit.type.isLeader) return false;
    return true;
  }

  /** Bounds/occupancy only — independent of which action (step or roll) the
   *  player ultimately spends AP on to get there. */
  _destinationFree(unit, dir) {
    const nx = unit.x + DIRECTION_VECTORS[dir].x;
    const nz = unit.z + DIRECTION_VECTORS[dir].z;
    return inBounds(nx, nz) && !unitAt(this.units, nx, nz);
  }

  // STEP — cheap (1 AP), any direction, a pure slide: top face and facing
  // both stay exactly as they were. ROLL — expensive (2 AP), any direction,
  // a real physical tip that changes the top face. Which to spend AP on, in
  // which direction, is entirely the player's choice every time — movement
  // no longer auto-decides based on facing.
  //
  // Advance ability: a unit whose top face is Advance covers 2 tiles on a
  // step instead of 1, for the same 1 AP — "already marching."
  _stepDistance(unit) {
    return unit.topLabel === 'Advance' ? 2 : 1;
  }

  /** A wounded unit gets ONE 1-AP step per turn and nothing else. It cannot
   *  roll, turn, or attack — and note that losing its defence and offence
   *  needs no rule at all: with Wounded showing, Guard isn't up (so nothing
   *  blocks) and no attack face is up (so nothing can strike). The die
   *  itself carries the whole state. */
  hasSpentWoundedAction(unit) {
    return this._woundedActed.has(unit.id);
  }

  canStep(unit, dir) {
    if (!this.canAct(unit) || this.ap < STEP_COST) return false;
    if (unit.isWounded && this.hasSpentWoundedAction(unit)) return false;
    const d = DIRECTION_VECTORS[dir];
    for (let s = 1; s <= this._stepDistance(unit); s++) {
      const nx = unit.x + d.x * s;
      const nz = unit.z + d.z * s;
      if (!inBounds(nx, nz) || unitAt(this.units, nx, nz)) return false;
    }
    return true;
  }

  step(unit, dir) {
    if (!this.canStep(unit, dir)) return false;
    if (unit.isWounded) this._woundedActed.add(unit.id);
    const distance = this._stepDistance(unit);
    for (let s = 0; s < distance; s++) unit.applyStep(dir);
    this.ap -= STEP_COST;
    this._pushLog(
      `${unit.type.name} steps ${dir}${distance > 1 ? ` x${distance} (Advance)` : ''} → top unchanged: ${unit.topLabel}`
    );
    this._maybeEndTurn();
    return true;
  }

  /** This side's leader, if it is alive and currently showing a rally face. */
  rallyingLeader(faction) {
    const leader = this.leaderOf(faction);
    return leader && leader.alive && RALLY_LABELS.has(leader.topLabel) ? leader : null;
  }

  /** Is `unit` standing next to its own rallying leader? In 'adjacent' mode
   *  this is what the rally actually buys: the commander's presence, not a
   *  bonus paid into an army-wide pool. */
  isRallied(unit) {
    const radius =
      this.rallyMode === 'adjacent' ? 1 : this.rallyMode === 'aura2' ? 2 : this.rallyMode === 'inspire' ? 1 : 0;
    if (!radius) return false;
    const leader = this.rallyingLeader(unit.faction);
    if (!leader || leader === unit) return false;
    return Math.abs(leader.x - unit.x) + Math.abs(leader.z - unit.z) <= radius;
  }

  // What it costs this unit to tip its die, travelling or in place.
  //
  // The base is a property of the UNIT, which is where light and heavy live:
  // in this game the only way to change what you can do is to tip the die,
  // and tipping is how you move — so mobility and versatility are one axis.
  // A light die changes what it is for 1 AP; a heavy one spends a whole turn
  // on it and therefore mostly keeps the face it has.
  //
  // Rush and the rally discounts then cut whatever that unit's own base is,
  // rather than resetting everyone to the same 1 AP — otherwise a heavy die
  // showing Rush would suddenly be the nimblest thing on the board.
  _rollCost(unit) {
    const base = unit.type.rollCost ?? ROLL_COST;
    const discounted = Math.max(1, base - 1);
    if (unit.topLabel === 'Rush') return discounted;
    // 'inspire' buys harder blows, not cheaper rolls — see attack().
    const rallyDiscounts = this.rallyMode === 'adjacent' || this.rallyMode === 'aura2';
    return rallyDiscounts && this.isRallied(unit) ? discounted : base;
  }

  canRoll(unit, dir) {
    if (!this.canAct(unit) || this.ap < this._rollCost(unit)) return false;
    // A wounded unit is reeling — it can only drag itself one tile (see
    // canStep), never gather itself for a full tumble.
    if (unit.isWounded) return false;
    // Only the single destination tile has to be clear. A roll always covers
    // exactly one tile — the wound-skip adds a quarter-turn to the die, not a
    // tile to the journey.
    return this._destinationFree(unit, dir);
  }

  roll(unit, dir) {
    if (!this.canRoll(unit, dir)) return false;
    const cost = this._rollCost(unit);
    const turns = unit.applyMove(dir);
    this.ap -= cost;
    this._pushLog(
      `${unit.type.name} rolls ${dir}${turns > 1 ? ' (turns twice past the wound)' : ''}` +
        `${cost < ROLL_COST ? ' (Rush)' : ''} → top: ${unit.topLabel}`
    );
    this._maybeEndTurn();
    return true;
  }

  // Turning the die on the spot: same cost and same face change as a roll,
  // but the unit keeps its tile. Deliberately has NO bounds or occupancy
  // check — that is the whole point. A travelling roll always surrenders the
  // square you are standing on, so a unit pressed up against the enemy it
  // wants to hit could not arm itself without first backing off, and one
  // hemmed in on all sides was frozen on whatever face it happened to show.
  canRollInPlace(unit) {
    return this.canAct(unit) && this.ap >= this._rollCost(unit) && !unit.isWounded;
  }

  rollInPlace(unit, dir) {
    if (!this.canRollInPlace(unit)) return false;
    const cost = this._rollCost(unit);
    const turns = unit.applyRollInPlace(dir);
    this.ap -= cost;
    this._pushLog(
      `${unit.type.name} turns the die ${dir} in place${turns > 1 ? ' x2 (past the wound)' : ''}` +
        `${cost < ROLL_COST ? ' (Rush)' : ''} → top: ${unit.topLabel}`
    );
    this._maybeEndTurn();
    return true;
  }

  canTurn(unit) {
    // A wounded unit has exactly one option left: drag itself one tile.
    return this.canAct(unit) && !unit.isWounded;
  }

  turn(unit, clockwise = true) {
    if (!this.canTurn(unit)) return false;
    unit.applyTurn(clockwise);
    this.ap -= 1;
    this._pushLog(`${unit.type.name} turns ${clockwise ? 'CW' : 'CCW'} → facing: ${unit.facing}`);
    this._maybeEndTurn();
    return true;
  }

  /** How far this unit's current face reaches. A reach unit carries its
   *  length on EVERY attack face — that is what makes it an archetype rather
   *  than one lucky side of the die. */
  attackRange(unit) {
    const fromFace = RANGE_BY_LABEL[unit.topLabel] ?? DEFAULT_RANGE;
    return Math.max(fromFace, unit.type.reach ?? DEFAULT_RANGE);
  }

  canAttack(unit) {
    if (!this.canAct(unit)) return false;
    return ATTACK_LABELS.has(unit.topLabel) && !!this.findAttackTarget(unit);
  }

  /** First enemy found scanning outward along `unit`'s facing, up to its top face's range.
   *  Stops (and returns null) at the first occupied tile even if it's an ally — a body
   *  in the way blocks the line, exactly like a real spear/blade would. */
  findAttackTarget(unit) {
    const range = this.attackRange(unit);
    // A reach weapon is held over the shoulder of the rank in front, so a
    // FRIENDLY body does not stop it — which is the whole point of the
    // archetype: it makes standing two deep in one column worth doing, and
    // that is the only reason anyone would break a flat line. An enemy still
    // stops it; you hit whoever you reach first.
    const overOwn = (unit.type.reach ?? DEFAULT_RANGE) > DEFAULT_RANGE;
    const d = DIRECTION_VECTORS[unit.facing];
    for (let step = 1; step <= range; step++) {
      const x = unit.x + d.x * step;
      const z = unit.z + d.z * step;
      if (!inBounds(x, z)) return null;
      const occupant = unitAt(this.units, x, z);
      if (!occupant) continue;
      if (occupant.faction !== unit.faction) return occupant;
      if (!overOwn) return null;
    }
    return null;
  }

  /** Predict what `unit`'s attack would do, WITHOUT mutating anything —
   *  the UI needs this to tell the player whether a given attack is merely
   *  disruptive or actually lethal. Lethality is deeply non-obvious here
   *  (which face a hit brings up depends on the target's whole orientation
   *  history), so it has to be computed, not eyeballed. */
  previewAttack(unit) {
    const target = this.findAttackTarget(unit);
    if (!target || !ATTACK_LABELS.has(unit.topLabel)) return null;

    const attackDir = unit.facing;
    const isFrontal = attackDir === oppositeDir(target.facing);
    const disarms =
      !target.isWounded && isFrontal && target.topLabel === 'Guard' && !this._hasAdjacentRoaringEnemy(target);

    // Replay whichever rotation applyHit() would actually pick.
    const dir = disarms ? attackDir : target.directionThatWounds(attackDir) ?? attackDir;
    const probe = target.orientation.clone();
    probe.roll(dir);
    const resultingTop = labelForAxisKey(target.unitTypeId, probe.snapshot().top);

    return {
      target,
      isFrontal,
      // The three rungs, in order of severity.
      lethal: target.isWounded,
      disarms,
      wounds: !target.isWounded && !disarms,
      resultingTop,
      // Kept for the UI's older wording; a disarm is the "absorbed" case.
      blocked: disarms,
    };
  }

  _isAdjacent(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z) === 1;
  }

  /** Compass direction from `from` to `to`, valid only when they're
   *  orthogonally adjacent (exactly what Brace needs to check facing). */
  _compassDirTo(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    if (dx === 1) return 'E';
    if (dx === -1) return 'W';
    if (dz === 1) return 'S';
    if (dz === -1) return 'N';
    return null;
  }

  // Roar ability: while any enemy of `target` stands adjacent to it showing
  // Roar, target's Guard is too rattled to block — a fear aura.
  _hasAdjacentRoaringEnemy(target) {
    return this.units.some(
      (u) => u.alive && u.faction !== target.faction && u.topLabel === 'Roar' && this._isAdjacent(u, target)
    );
  }

  // Brace ability: after ANY push lands a unit on a tile directly in front
  // of an enemy showing Brace, that unit gets a free, automatic counter-hit
  // — exactly the Shieldbearer-into-Pikeman combo the brief describes.
  _triggerBraceReactions(pushedUnit) {
    for (const u of this.units) {
      if (!pushedUnit.alive) break;
      if (!u.alive || u.faction === pushedUnit.faction) continue;
      if (u.topLabel !== 'Brace') continue;
      if (!this._isAdjacent(u, pushedUnit)) continue;
      if (this._compassDirTo(u, pushedUnit) !== u.facing) continue;

      const died = pushedUnit.applyHit(u.facing);
      this._pushLog(`${u.type.name} braces and strikes ${pushedUnit.type.name} → top: ${pushedUnit.topLabel}`);
      if (died) {
        this._pushLog(`${pushedUnit.type.name} is eliminated!`);
        if (pushedUnit.type.isLeader) {
          this.gameOver = true;
          this.endReason = 'leader';
          this.winner = u.faction;
          this._pushLog(`${this.winner.toUpperCase()} WIN — enemy leader defeated!`);
        }
      }
    }
  }

  attack(unit) {
    if (!this.canAttack(unit)) return false;
    const target = this.findAttackTarget(unit);
    // Every blow in the game — including the Brace and Riposte reactions this
    // call goes on to trigger — happens below, so one reset here covers them
    // all. It must NOT live in previewAttack: that only inspects a blow, and
    // the AI runs it constantly, which would keep the clock pinned at zero.
    this.turnsSinceBlood = 0;
    const label = unit.topLabel;
    const attackDir = unit.facing; // direction the hit travels: attacker → target

    // Read the target's PRE-hit state — applyHit is about to rotate it away.
    const wasStagger = target.topLabel === 'Stagger';
    const wasRiposte = target.topLabel === 'Riposte';
    const wantsPush = PUSH_LABELS.has(label) || wasStagger; // Stagger: any solid hit knocks you back too

    // Frontal iff the attacker sits exactly where the defender is looking.
    // A wounded target has no Guard showing at all, so it can never block.
    const isFrontal = attackDir === oppositeDir(target.facing);
    // 'inspire': fighting beside your commander, your blow drives through
    // the Guard instead of merely knocking it aside.
    const inspired = this.rallyMode === 'inspire' && this.isRallied(unit);
    const disarms = isFrontal && target.topLabel === 'Guard' && !this._hasAdjacentRoaringEnemy(target) && !inspired;

    this.ap -= 1;

    if (disarms) {
      // First rung of the damage ladder. Guard eats the wound but is knocked
      // aside — the die still turns, so the NEXT hit wounds for real. A hit
      // from a flank (or through a Roar) skips this rung entirely, which is
      // what keeps flanking worth the manoeuvring: 2 hits instead of 3.
      target.applyHit(attackDir, { disarmOnly: true });
      this._pushLog(
        `${unit.type.name}'s ${label} is turned by ${target.type.name}'s Guard — but knocks it aside (now ${target.topLabel})`
      );
      this._maybeEndTurn();
      return true;
    }

    let push = false;
    if (wantsPush) {
      const bx = target.x + DIRECTION_VECTORS[attackDir].x;
      const bz = target.z + DIRECTION_VECTORS[attackDir].z;
      push = inBounds(bx, bz) && !unitAt(this.units, bx, bz);
    }

    const vacatedX = target.x;
    const vacatedZ = target.z;
    const died = target.applyHit(attackDir, { push });

    // Follow up the shove. Without this, a push ends the engagement: the two
    // separate, the attacker can't land a second hit, and since wounding
    // takes two hits nothing ever accumulates. (Measured on the AI sim: 88%
    // of all attacks pushed, and wounds essentially never happened.) Stepping
    // into the tile the target just left keeps the pressure on and costs
    // nothing — you're driving them back, not letting them disengage.
    if (push && this._isAdjacent(unit, { x: vacatedX, z: vacatedZ })) {
      unit.x = vacatedX;
      unit.z = vacatedZ;
    }

    const outcome = died ? 'finished off' : target.isWounded ? 'WOUNDED' : `top: ${target.topLabel}`;
    this._pushLog(
      `${unit.type.name} hits ${target.type.name} with ${label}${push ? ' + push' : ''} → ${outcome}`
    );

    if (died) {
      this._pushLog(`${target.type.name} is eliminated!`);
      if (target.type.isLeader) {
        this.gameOver = true;
        this.endReason = 'leader';
        this.winner = unit.faction;
        this._pushLog(`${this.winner.toUpperCase()} WIN — enemy leader defeated!`);
      }
    } else {
      // Riposte: the defender survived while showing Riposte — free counter.
      if (wasRiposte) {
        const counterDied = unit.applyHit(oppositeDir(attackDir));
        this._pushLog(`${target.type.name} riposts! ${unit.type.name} top: ${unit.topLabel}`);
        if (counterDied) {
          this._pushLog(`${unit.type.name} is eliminated!`);
          if (unit.type.isLeader) {
            this.gameOver = true;
            this.endReason = 'leader';
            this.winner = target.faction;
            this._pushLog(`${this.winner.toUpperCase()} WIN — enemy leader defeated!`);
          }
        }
      }
      // Brace: anyone actually pushed onto a Brace unit's front gets hit again.
      if (push && !this.gameOver) this._triggerBraceReactions(target);
    }

    this._maybeEndTurn();
    return true;
  }

  endTurn() {
    if (this.gameOver) return;
    this._woundedActed.clear();
    this.currentFaction = this.currentFaction === 'humans' ? 'orcs' : 'humans';
    // Command / Waaagh ability: if the incoming faction's leader is already
    // showing its rally face, the turn opens with a bonus AP.
    // 'command' is 'army' with a price: the extra AP is the commander's own
    // turn, spent giving orders instead of fighting.
    const grants = this.rallyMode === 'army' || this.rallyMode === 'command';
    // Only worth issuing orders if somebody is left to receive them. Without
    // this a lone commander would command itself into paralysis: barred from
    // acting every turn, forever, and the game could never end.
    const hasTroops = this.aliveUnits(this.currentFaction).some((u) => !u.type.isLeader);
    const rallied = grants && hasTroops && !!this.rallyingLeader(this.currentFaction);
    this._leaderIsCommanding = rallied && this.rallyMode === 'command';
    this.ap = this.apPerTurn + (rallied ? 1 : 0);
    this.turnNumber += 1;
    this.turnsSinceBlood += 1;
    this._pushLog(`— Turn ${this.turnNumber}: ${this.currentFaction.toUpperCase()}${rallied ? ' (rallied +1 AP)' : ''} —`);
    if (this.turnsSinceBlood >= this.stallLimit) this._endByExhaustion();
  }

  /** How much fight a side has left. A wounded die is one blow from gone, so
   *  it counts half — which is what makes running away with a wounded unit a
   *  losing plan rather than a winning one. */
  armyStrength(faction) {
    const alive = this.aliveUnits(faction);
    return alive.length * 2 - alive.filter((u) => u.isWounded).length;
  }

  /** Nobody has landed a blow for `stallLimit` turns: the battle is called on
   *  the state of the two armies. */
  _endByExhaustion() {
    const h = this.armyStrength('humans');
    const o = this.armyStrength('orcs');
    this.gameOver = true;
    this.endReason = 'exhaustion';
    this.winner = h === o ? null : h > o ? 'humans' : 'orcs';
    this._pushLog(
      `— No blow landed for ${this.stallLimit} turns — battle called (humans ${h} : ${o} orcs) —`
    );
    this._pushLog(this.winner ? `${this.winner.toUpperCase()} WIN on strength` : 'DRAW — both armies spent');
  }

  _maybeEndTurn() {
    if (this.ap <= 0 && !this.gameOver) this.endTurn();
  }
}
