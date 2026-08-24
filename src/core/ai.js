// A heuristic AI good enough to drive a full game and to look like it has a
// plan. It only DECIDES; it never mutates game state, so the caller can
// animate each decision exactly like a human-driven action.
//
// Structure: instead of a priority cascade ("attack if you can, else turn,
// else advance"), every legal action for every unit is scored and the best
// one wins. The cascade version produced visibly silly play — it would spend
// a whole turn spinning a unit 180°, and it walked units back and forth
// because each decision was made with no memory of the last one. Scoring
// fixes both: a turn is only worth anything if it actually enables an attack
// this turn, and undoing your own last move is refused outright.
import { DIR_ORDER, nextDir, oppositeDir, DIRECTION_VECTORS } from './orientation.js';
import { ATTACK_LABELS, WOUNDED_LABEL, RALLY_LABELS } from './units.js';
import { BOARD_SIZE, inBounds, isWall } from './board.js';


/** Walking distance from every tile to the nearest enemy, as a flood fill
 *  outward from all of them at once.
 *
 *  This used to be Manhattan distance, which on a board with walls is not an
 *  approximation but a WRONG NUMBER: it reports distances that cannot be
 *  travelled. A unit would read "the enemy is three tiles away" straight
 *  through a wall, march at it and stop dead — measured as terrain making
 *  units move sideways LESS, which is the exact opposite of the point of
 *  putting terrain on the board.
 *
 *  Other units are treated as passable: they move, so routing around a body
 *  that will not be there next turn is not worth the detour. Only stone is
 *  permanent. */
function distanceField(enemies, terrain, size = BOARD_SIZE) {
  const dist = new Map();
  const queue = [];
  for (const e of enemies) {
    const key = `${e.x},${e.z}`;
    if (!dist.has(key)) {
      dist.set(key, 0);
      queue.push([e.x, e.z]);
    }
  }
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    const d = dist.get(`${x},${z}`);
    for (const [dx, dz] of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      const key = `${nx},${nz}`;
      if (!inBounds(nx, nz, size) || dist.has(key) || isWall(terrain, nx, nz)) continue;
      dist.set(key, d + 1);
      queue.push([nx, nz]);
    }
  }
  // Walled off entirely: treat as very far rather than infinite, so scores
  // stay finite and comparable.
  return (x, z) => dist.get(`${x},${z}`) ?? size * 2;
}

/** Would tipping toward `dir` leave this unit actually able to strike?
 *
 *  A tip does not change facing, so an attack face is worthless unless the
 *  target already stands in front. Scoring "an attack face came up" without
 *  that check made a unit stood beside an enemy it wasn't facing tip back and
 *  forth forever: each tip produced an attack face, outbid turning, and ate
 *  the AP that turning needed. Asking the rules whether the strike would
 *  land — rather than guessing from the label — also gets reach units right
 *  for free, since it consults their real range. */
function couldAttackAfterTip(game, unit, dir) {
  const before = unit.orientation.clone();
  try {
    const turns = unit.rollTurns(dir);
    for (let i = 0; i < turns; i++) unit.orientation.roll(dir);
    return ATTACK_LABELS.has(unit.topLabel) && !!game.findAttackTarget(unit);
  } finally {
    unit.orientation = before;
  }
}

/** Would this unit have an attack available if it were facing `facing`?
 *  Answered by briefly setting the facing and asking the Game itself, so the
 *  prediction can never drift from the real targeting rule. Restored in a
 *  finally block, so no mutation survives the call. */
function couldAttackFacing(game, unit, facing) {
  const original = unit.facing;
  try {
    unit.facing = facing;
    return ATTACK_LABELS.has(unit.topLabel) && !!game.findAttackTarget(unit);
  } finally {
    unit.facing = original;
  }
}

// Remembers each unit's last committed move so we can refuse to undo it.
// Keyed by the unit object, so it disappears with the game.
const lastMove = new WeakMap();

const SCORE = {
  kill: 1000,
  wound: 600,
  disarm: 250,
  turnIntoAttack: 400,
  rollIntoAttack: 300,
  // Arming without surrendering the square you fought for beats arming by
  // backing off, so the in-place version outbids the travelling one.
  holdContact: 120,
  rally: 260,
  // Only meaningful in 'adjacent' rally mode: the commander is worth more
  // standing beside the troops it buffs. This is deliberately in tension
  // with LEADER_KEEP_AWAY — the whole question is which pull wins.
  leaderNearAlly: 140,
  closePerTile: 30,
  rollClosePerTile: 20,
  retreatPerTile: 50,
  guardWhileEngaged: 80,
  exposedWhileEngaged: -70,
};

// Losing the leader loses the game outright, and a leader dies to the same
// two flank hits as anyone else — so it has no business leading the charge.
// Without this the AI marched its own Captain into contact and handed the
// game away on turn 10.
const LEADER_KEEP_AWAY = 3;

/** How much a unit wants to end up `there` tiles from the nearest enemy,
 *  given it is `here` tiles away now. `leaderMayHide` is false once the
 *  leader has no healthy troops left to fight on its behalf — without that
 *  condition both leaders simply run from each other forever and the game
 *  can never be won (observed: 2971 turns of empty passes with only the two
 *  leaders left standing). */
function positionalScore(unit, here, there, perTile, leaderMayHide) {
  if (unit.isWounded) return (there - here) * SCORE.retreatPerTile;
  if (unit.type.isLeader && leaderMayHide) {
    // Back off while inside the danger band; drift forward only from safety,
    // and even then reluctantly.
    if (there < LEADER_KEEP_AWAY) return (there - here) * SCORE.retreatPerTile;
    return (here - there) * perTile * 0.2;
  }
  return (here - there) * perTile;
}

function engagementBonus(topLabel, adjacentToEnemy) {
  if (!adjacentToEnemy) return 0;
  if (topLabel === 'Guard') return SCORE.guardWhileEngaged;
  if (ATTACK_LABELS.has(topLabel)) return 0; // fine — you're about to swing
  if (topLabel === WOUNDED_LABEL) return 0; // already handled by retreat logic
  return SCORE.exposedWhileEngaged;
}

/** Undoing your own last move is forbidden outright, not merely discouraged.
 *
 *  As a score it never stood a chance: a roll that brings up an attack face
 *  is worth +300, so a -25 nudge let a unit shuttle between two tiles for
 *  thousands of turns — arm, fail to reach the enemy standing to its SIDE,
 *  roll back, repeat. Raising the penalty instead was tried and it vetoed
 *  real progress. A hard ban kills two-tile cycles and leaves every other
 *  decision untouched. */
function isImmediateReversal(unit, type, dir) {
  const prev = lastMove.get(unit);
  if (!prev || !dir) return false;
  const wasMove = prev.type === 'step' || prev.type === 'roll';
  const isMove = type === 'step' || type === 'roll';
  return wasMove && isMove && prev.dir === oppositeDir(dir);
}

function scoreCandidates(game, myUnits, enemies) {
  const out = [];
  // One flood fill per decision, shared by every candidate move.
  const distanceTo = distanceField(enemies, game.terrain, game.boardSize);
  // A leader may only play it safe while someone else can still do the
  // fighting; once the healthy rank and file are gone it has to commit.
  const leaderMayHide = myUnits.some((u) => !u.type.isLeader && !u.isWounded);
  const add = (score, action) => {
    if (score > 0) out.push({ score, action });
  };

  for (const unit of myUnits) {
    const here = distanceTo(unit.x, unit.z);


    // --- attack -------------------------------------------------------
    if (game.canAttack(unit)) {
      const p = game.previewAttack(unit);
      if (p) {
        const s = p.lethal ? SCORE.kill : p.wounds ? SCORE.wound : SCORE.disarm;
        add(s, { type: 'attack', unit });
      }
    }

    // --- turn ---------------------------------------------------------
    // Only ever worth it if it lines up an attack we can still pay for this
    // turn. Without that condition the AI burns whole turns rotating for no
    // reason — which is exactly what it used to do.
    // Cost of the turn itself plus the 1 AP for the blow it sets up. Under
    // the 'freestep' economy the turn is free, so lining up an attack needs
    // only the attack's own AP.
    const turnCost = game.economy === 'freestep' ? 0 : 1;
    if (game.canTurn(unit) && game.ap >= turnCost + 1) {
      for (const cw of [true, false]) {
        const facing = nextDir(unit.facing, cw);
        if (couldAttackFacing(game, unit, facing)) {
          add(SCORE.turnIntoAttack, { type: 'turn', unit, cw });
        }
      }
    }

    // --- step ---------------------------------------------------------
    for (const dir of DIR_ORDER) {
      if (!game.canStep(unit, dir)) continue;
      if (isImmediateReversal(unit, 'step', dir)) continue;
      const d = DIRECTION_VECTORS[dir];
      const nx = unit.x + d.x;
      const nz = unit.z + d.z;
      const there = distanceTo(nx, nz);
      let score =
        positionalScore(unit, here, there, SCORE.closePerTile, leaderMayHide) +
        engagementBonus(unit.topLabel, there === 1);
      // A rallying commander wants to be within reach of its own troops,
      // because that is the only way the aura pays anything at all.
      if (unit.type.isLeader && game.rallyMode !== 'none' && game.rallyMode !== 'army') {
        const buffed = myUnits.some(
          (a) => a !== unit && !a.isWounded && Math.abs(a.x - nx) + Math.abs(a.z - nz) <= (game.rallyMode === 'aura2' ? 2 : 1)
        );
        if (buffed) score += SCORE.leaderNearAlly;
      }
      add(score, { type: 'step', unit, dir });
    }

    // --- roll in place --------------------------------------------------
    // The way to arm yourself without giving up contact. Only worth AP when
    // it actually produces an attack face and there is someone next to you
    // to use it on; otherwise a travelling roll is the better buy because it
    // also covers ground.
    if (game.canRollInPlace(unit)) {
      for (const dir of DIR_ORDER) {
        const newTop = unit.topAfterTurning(dir);
        if (couldAttackAfterTip(game, unit, dir)) {
          add(SCORE.rollIntoAttack + SCORE.holdContact, { type: 'rollInPlace', unit, dir });
        }
        // A leader parked out of reach should be rallying: one turn of the
        // die buys the whole army +1 AP every turn it keeps that face up,
        // and turning in place means it never has to leave its safe square.
        // Without this the rally faces were dead weight — measured at 0 uses
        // across a whole game.
        if (unit.type.isLeader && here > LEADER_KEEP_AWAY && RALLY_LABELS.has(newTop)) {
          add(SCORE.rally, { type: 'rollInPlace', unit, dir });
        }
      }
    }

    // --- roll ---------------------------------------------------------
    for (const dir of DIR_ORDER) {
      if (!game.canRoll(unit, dir)) continue;
      if (isImmediateReversal(unit, 'roll', dir)) continue;
      const d = DIRECTION_VECTORS[dir];
      const nx = unit.x + d.x; // a roll always covers exactly one tile
      const nz = unit.z + d.z;
      const there = distanceTo(nx, nz);
      const newTop = unit.topAfterTurning(dir);
      let score = positionalScore(unit, here, there, SCORE.rollClosePerTile, leaderMayHide);
      // Arming yourself is the main reason to spend 2 AP on a roll — and it
      // has to outweigh the step back it costs. Changing your face REQUIRES
      // moving, so a unit standing next to an enemy can only arm itself by
      // giving up the contact for a turn. Without this the whole army froze
      // in place around an enemy with Guard up: every roll looked like a
      // retreat, so nobody ever drew a weapon.
      if (ATTACK_LABELS.has(newTop) && there <= 2) score += SCORE.rollIntoAttack;
      score += engagementBonus(newTop, there === 1);
      add(score, { type: 'roll', unit, dir });
    }
  }
  return out;
}

/** Decide ONE action for the current player, or null when nothing is worth
 *  doing (the caller should then end the turn). */
export function decideAiAction(game) {
  const enemyFaction = game.currentFaction === 'humans' ? 'orcs' : 'humans';
  const myUnits = game.aliveUnits(game.currentFaction);
  const enemies = game.aliveUnits(enemyFaction);
  if (!enemies.length || !myUnits.length) return null;

  const candidates = scoreCandidates(game, myUnits, enemies);
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const { action } = candidates[0];
  if (action.type === 'step' || action.type === 'roll') {
    lastMove.set(action.unit, { type: action.type, dir: action.dir });
  }
  return action;
}
