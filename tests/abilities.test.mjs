import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { Unit } from '../src/core/unit.js';
import { UNIT_TYPES } from '../src/core/units.js';

function findUnit(game, unitTypeId) {
  return game.units.find((u) => u.unitTypeId === unitTypeId);
}

/** Force a unit's top face by rolling its orientation directly. Rolling
 *  toward `dir` brings the face on the OPPOSITE side up, so `dir` has to be
 *  on the same axis as the face you want — the guard catches the case where
 *  it isn't, instead of spinning forever. Note this bypasses the wound-skip
 *  in Unit.applyMove on purpose: tests need to be able to stage a wounded
 *  unit, which real play can only reach via a hit. */
function forceTop(unit, dir, label) {
  let guard = 0;
  while (unit.topLabel !== label && guard++ < 8) unit.orientation.roll(dir);
  assert.equal(unit.topLabel, label, `could not force ${unit.unitTypeId} onto ${label} via ${dir} rolls`);
}

test('Advance: step covers 2 tiles for the same 1 AP', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 2;
  sword.z = 2; // clear of everyone, room to move
  forceTop(sword, 'E', 'Advance'); // Advance sits on the west face

  const apBefore = g.ap;
  assert.equal(g.canStep(sword, 'E'), true);
  assert.equal(g.step(sword, 'E'), true);
  assert.equal(sword.x, 4, 'Advance should move 2 tiles east in one step');
  assert.equal(g.ap, apBefore - 1, 'Advance step still only costs 1 AP');
});

test('Advance: does not skip over an occupied tile', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const pikeman = findUnit(g, 'pikeman');
  sword.x = 1;
  sword.z = 2;
  pikeman.x = 2;
  pikeman.z = 2; // blocks the second tile of a 2-step east
  forceTop(sword, 'E', 'Advance');

  assert.equal(g.canStep(sword, 'E'), false, 'a blocked second tile must refuse the whole Advance step');
});

test('Rush: roll costs 1 AP instead of 2', () => {
  const g = new Game();
  const brute = findUnit(g, 'brute');
  brute.x = 2;
  brute.z = 2;
  forceTop(brute, 'S', 'Rush'); // Rush sits on the north face

  g.currentFaction = 'orcs';
  g.ap = 3;
  const apBefore = g.ap;
  assert.equal(g.roll(brute, 'E'), true);
  assert.equal(g.ap, apBefore - 1, 'Rush roll should only cost 1 AP');
});

test('Command / Waaagh: leader showing its rally face grants +1 AP at the start of the turn', () => {
  const g = new Game();
  const captain = findUnit(g, 'captain');
  forceTop(captain, 'N', 'Command'); // Command sits on the south face

  g.currentFaction = 'orcs'; // so the next endTurn() switches TO humans and checks the captain
  g.endTurn();
  assert.equal(g.currentFaction, 'humans');
  assert.equal(g.ap, g.apPerTurn + 1, 'a rallied leader should grant the base AP plus one');
});

test('no rally bonus when the leader is not showing Command/Waaagh', () => {
  const g = new Game();
  assert.equal(findUnit(g, 'captain').topLabel, 'Guard');
  g.currentFaction = 'orcs';
  g.endTurn();
  assert.equal(g.ap, g.apPerTurn, 'no bonus AP without a rallied leader');
});

// --- the wound state -------------------------------------------------

test('a unit can never land on its own wound face — the die turns twice, but still moves one tile', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 2;
  sword.z = 4; // room to roll north twice
  g.ap = 10; // two rolls in one turn is more than a real turn's budget

  assert.equal(g.roll(sword, 'N'), true);
  assert.equal(sword.topLabel, 'Riposte');
  assert.equal(sword.z, 3, 'a normal roll covers one tile');

  // The next roll north would land on Wounded, so the die turns past it.
  assert.equal(sword.rollTurns('N'), 2, 'the extra quarter-turn must be predictable before the move');
  assert.equal(g.roll(sword, 'N'), true);
  assert.equal(sword.isWounded, false, 'a unit must never wound itself by moving');
  assert.equal(sword.topLabel, 'Strike', 'it settles on the face AFTER the wound face');
  assert.equal(sword.z, 2, 'and it still travels exactly ONE tile — the skip adds a turn, not distance');
});

test('a wound-skip roll needs only its one destination tile, not two', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const pikeman = findUnit(g, 'pikeman');
  sword.x = 2;
  sword.z = 3;
  sword.orientation.roll('N'); // one turn in, so the next north roll skips
  assert.equal(sword.rollTurns('N'), 2);

  pikeman.x = 2;
  pikeman.z = 1; // the tile BEYOND the destination — irrelevant now
  assert.equal(g.canRoll(sword, 'N'), true, 'only the tile actually landed on matters');

  g.ap = 5;
  assert.equal(g.roll(sword, 'N'), true);
  assert.equal(sword.z, 2, 'it stops on the free tile instead of vaulting into the occupied one');
});

test('the damage ladder is deterministic: disarm, then wound, then death', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');

  // Rung 1 — a frontal hit into Guard only disarms.
  assert.equal(sword.applyHit('N', { disarmOnly: true }), false);
  assert.notEqual(sword.topLabel, 'Guard', 'the Guard should be knocked aside');
  assert.equal(sword.isWounded, false, 'a disarm can never wound');

  // Rung 2 — the next hit always wounds, whatever direction it comes from.
  assert.equal(sword.applyHit('E'), false);
  assert.equal(sword.isWounded, true, 'any hit on a disarmed unit wounds it');
  assert.equal(sword.alive, true);

  // Rung 3 — a hit on a wounded unit finishes it.
  assert.equal(sword.applyHit('S'), true, 'a hit taken while wounded is fatal');
  assert.equal(sword.alive, false);
  assert.equal(sword.eliminatedBy, 'hit');
});

test('every unit dies in exactly 3 frontal hits or 2 flank hits, from any mix of directions', () => {
  const DIRS = ['N', 'E', 'S', 'W'];
  for (const id of Object.keys(UNIT_TYPES)) {
    // Frontal: the first hit is spent on the disarm rung.
    const frontal = new Unit(id, UNIT_TYPES[id].faction, 0, 0, 'S');
    frontal.applyHit('N', { disarmOnly: true });
    let n = 1;
    let dead = false;
    while (!dead && n < 8) dead = frontal.applyHit(DIRS[n++ % 4]);
    assert.equal(n, 3, `${id}: frontal should take exactly 3 hits`);

    // Flank: no disarm rung, so the first hit knocks it straight to wounded.
    const flank = new Unit(id, UNIT_TYPES[id].faction, 0, 0, 'S');
    let m = 0;
    dead = false;
    while (!dead && m < 8) dead = flank.applyHit(DIRS[m++ % 4]);
    assert.equal(m, 2, `${id}: a flank hit skips the disarm rung, so 2 hits`);
  }
});

test('a wounded unit cannot roll, turn or attack, and gets only one step per turn', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 2;
  sword.z = 2;
  forceTop(sword, 'N', 'Wounded');
  assert.equal(sword.isWounded, true);

  assert.equal(g.canRoll(sword, 'E'), false, 'a wounded unit cannot roll');
  assert.equal(g.canTurn(sword), false, 'a wounded unit cannot turn');
  assert.equal(g.canAttack(sword), false, 'Wounded is not an attack face');

  assert.equal(g.canStep(sword, 'E'), true, 'it can still drag itself one tile');
  assert.equal(g.step(sword, 'E'), true);
  assert.equal(g.canStep(sword, 'E'), false, 'but only once per turn, even with AP to spare');
  assert.ok(g.ap > 0, 'the cap is per-unit, not because the side ran out of AP');
});

test('a wounded unit cannot block, because Guard is no longer the face showing', () => {
  const g = new Game();
  const captain = findUnit(g, 'captain');
  const warboss = findUnit(g, 'warboss');

  captain.x = 2;
  captain.z = 2;
  captain.facing = 'S';
  forceTop(captain, 'N', 'Wounded');

  warboss.x = 2;
  warboss.z = 3;
  warboss.facing = 'N'; // dead frontal, which would normally meet Guard
  forceTop(warboss, 'N', 'Chop');

  g.currentFaction = 'orcs';
  g.ap = 3;
  assert.equal(g.previewAttack(warboss).blocked, false, 'a wounded defender has no Guard to block with');
  g.attack(warboss);
  assert.equal(captain.alive, false, 'and the hit finishes it');
  assert.equal(g.gameOver, true);
});

// --- the other face abilities ---------------------------------------

test('Roar: an adjacent enemy showing Roar stops Guard from blocking', () => {
  const g = new Game();
  const captain = findUnit(g, 'captain');
  const warboss = findUnit(g, 'warboss');
  const orcBoy = findUnit(g, 'orcBoy');

  captain.x = 2;
  captain.z = 2;
  captain.facing = 'S';
  assert.equal(captain.topLabel, 'Guard');

  warboss.x = 2;
  warboss.z = 3;
  warboss.facing = 'N'; // frontal on captain
  forceTop(warboss, 'N', 'Chop');

  orcBoy.x = 3;
  orcBoy.z = 2; // orthogonally adjacent to the captain
  forceTop(orcBoy, 'S', 'Roar'); // Roar sits on the north face

  assert.equal(g.previewAttack(warboss).blocked, false, 'Roar should strip the block');
  const snapBefore = captain.snapshotLabels();
  g.currentFaction = 'orcs';
  g.ap = 3;
  g.attack(warboss);
  assert.notDeepEqual(captain.snapshotLabels(), snapBefore, 'the hit should have landed');
});

test('Stagger: even a non-push attack shoves a Staggered target back a tile', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const warboss = findUnit(g, 'warboss'); // Chop is not a push label

  // The empty middle: rows 0-1 and 5-6 hold the two deployment ranks, so a
  // knock-back nearer the edge would have nowhere to go.
  sword.x = 2;
  sword.z = 3;
  sword.facing = 'W'; // not frontal, so Guard never enters into it
  forceTop(sword, 'W', 'Stagger'); // Stagger sits on the east face

  warboss.x = 2;
  warboss.z = 4;
  warboss.facing = 'N';
  forceTop(warboss, 'N', 'Chop');

  const zBefore = sword.z;
  g.currentFaction = 'orcs';
  g.ap = 3;
  g.attack(warboss);
  assert.equal(sword.z, zBefore - 1, 'Chop does not normally push, but Stagger gets knocked back anyway');
});

test('Riposte: surviving a hit while showing Riposte automatically counter-hits the attacker', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const warboss = findUnit(g, 'warboss');

  sword.x = 2;
  sword.z = 2;
  sword.facing = 'W'; // not frontal, isolating Riposte from Guard-blocking
  forceTop(sword, 'N', 'Riposte'); // Riposte sits on the south face

  warboss.x = 2;
  warboss.z = 3;
  warboss.facing = 'N';
  forceTop(warboss, 'N', 'Chop');

  const attackerTopBefore = warboss.topLabel;
  g.currentFaction = 'orcs';
  g.ap = 3;
  g.attack(warboss);
  assert.notEqual(warboss.topLabel, attackerTopBefore, 'the attacker should have been rotated by the riposte');
});

test('Brace: an enemy pushed onto a Brace unit\'s front gets hit again', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const orcBoy = findUnit(g, 'orcBoy');

  pikeman.x = 2;
  pikeman.z = 3;
  pikeman.facing = 'N'; // its front is (2,2)
  forceTop(pikeman, 'N', 'Brace'); // Brace sits on the south face

  orcBoy.x = 2;
  orcBoy.z = 2; // lands exactly on Pikeman's front
  const topBefore = orcBoy.topLabel;

  g._triggerBraceReactions(orcBoy);
  assert.notEqual(orcBoy.topLabel, topBefore, 'Brace should hit the enemy that landed on its front');
});

// --- attack preview ---------------------------------------------------

test('previewAttack names the exact rung the hit will land on, and never mutates', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');

  orcBoy.x = 2;
  orcBoy.z = 2;
  orcBoy.facing = 'N'; // looking north, back at the attacker => frontal
  sword.x = 2;
  sword.z = 1;
  sword.facing = 'S';
  forceTop(sword, 'S', 'Strike');

  const before = orcBoy.orientation.q.clone();
  const first = g.previewAttack(sword);
  assert.equal(first.disarms, true, 'a frontal hit into Guard should predict a disarm');
  assert.equal(first.wounds, false);
  assert.equal(first.lethal, false);
  assert.ok(orcBoy.orientation.q.equals(before), 'previewAttack must not mutate the target');

  g.ap = 3;
  g.attack(sword);
  assert.equal(orcBoy.isWounded, false, 'a disarm does not wound');
  assert.notEqual(orcBoy.topLabel, 'Guard');

  g.ap = 3;
  const second = g.previewAttack(sword);
  assert.equal(second.wounds, true, 'the follow-up should predict a wound');
  g.attack(sword);
  assert.equal(orcBoy.isWounded, true, 'the prediction must match reality');

  g.ap = 3;
  assert.equal(g.previewAttack(sword).lethal, true, 'a hit on a wounded unit should be predicted lethal');
  g.attack(sword);
  assert.equal(orcBoy.alive, false);
});

test('rally (command mode): the leader buys +1 AP by giving up its own turn', () => {
  const g = new Game(); // default rallyMode: 'command'
  const captain = findUnit(g, 'captain');
  forceTop(captain, 'N', 'Command');

  g.currentFaction = 'orcs';
  g.endTurn(); // switches to humans and checks the captain
  assert.equal(g.ap, g.apPerTurn + 1, 'the army gets the extra AP');
  assert.equal(g.canAct(captain), false, 'but the commander is busy commanding');
  assert.equal(g.canAct(findUnit(g, 'swordsman')), true, 'the troops are free to use it');
});

test('rally is not granted when the leader has no troops left to command', () => {
  // Otherwise a lone commander bars itself from acting every turn forever and
  // the game can never be resolved.
  const g = new Game();
  const captain = findUnit(g, 'captain');
  forceTop(captain, 'N', 'Command');
  for (const u of g.units) if (u.faction === 'humans' && !u.type.isLeader) u.alive = false;

  g.currentFaction = 'orcs';
  g.endTurn();
  assert.equal(g.ap, g.apPerTurn, 'no bonus with nobody to command');
  assert.equal(g.canAct(captain), true, 'and the commander is free to fight for itself');
});
