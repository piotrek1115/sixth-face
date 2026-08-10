import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

function findUnit(game, unitTypeId) {
  return game.units.find((u) => u.unitTypeId === unitTypeId);
}

test('STEP: 1 AP, any direction, orientation and facing both untouched', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman'); // spawns at x=1,z=0, facing S

  const topBefore = sword.topLabel;
  const facingBefore = sword.facing;
  const quatBefore = sword.orientation.q.clone();
  const apBefore = g.ap;

  const ok = g.step(sword, 'W'); // west is open at spawn
  assert.equal(ok, true);
  assert.equal(g.ap, apBefore - 1, 'a step must cost exactly 1 AP');
  assert.equal(sword.topLabel, topBefore, 'a step must not change the top face');
  assert.equal(sword.facing, facingBefore, 'a step must not change facing');
  assert.ok(sword.orientation.q.equals(quatBefore), 'a step must not touch the orientation quaternion at all');
  assert.equal(sword.x, 0, 'the unit should still have physically moved one tile west');
});

test('ROLL: 2 AP, any direction, physically tips and changes the top face', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');

  g.ap = 5; // headroom, so spending the AP doesn't end the turn and reset it
  const apBefore = g.ap;
  const topBefore = sword.topLabel;
  const ok = g.roll(sword, 'S'); // south is open at spawn
  assert.equal(ok, true);
  assert.equal(g.ap, apBefore - 2, 'a roll must cost exactly 2 AP');
  assert.notEqual(sword.topLabel, topBefore, 'a roll must change the top face');
  assert.equal(sword.z, 1, 'the unit should have physically moved one tile south');
});

test('roll requires 2 AP: refused with only 1 AP left, step still works', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  g.ap = 1;
  assert.equal(g.canRoll(sword, 'S'), false, 'a roll must be unaffordable with only 1 AP');
  assert.equal(g.roll(sword, 'S'), false);
  assert.equal(g.canStep(sword, 'S'), true, 'a step should still be affordable with 1 AP');
  assert.equal(g.step(sword, 'S'), true);
});

test('AT-4/5: a hit physically rotates the target 90° (top face changes exactly once)', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman'); // humans, faces S
  const orcBoy = findUnit(g, 'orcBoy'); // orcs, faces N, directly opposite across the board

  // Place the swordsman directly north of the orc boy so it can strike —
  // pure setup, not exercising the AP-metered step/roll actions here.
  sword.x = orcBoy.x;
  sword.z = orcBoy.z - 1;

  // Turn Guard away so the hit actually lands (orcBoy starts facing N i.e. facing the
  // swordsman => frontal; rotate it so its facing no longer opposes the attack, to
  // isolate the "hit rotates 90°" check from the Guard-block rule).
  orcBoy.facing = 'E';

  // Force its top face to an attack-capable label so the attack actually
  // resolves. 'Strike' lives on the north/south-cycling axis for Swordsman.
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  const snapBefore = orcBoy.snapshotLabels();
  const ok = g.attack(sword);
  assert.equal(ok, true, 'attack should resolve');
  const snapAfter = orcBoy.snapshotLabels();
  assert.notEqual(snapAfter.top, snapBefore.top, 'a real hit must change the top face (90° physical rotation)');
});

test('Guard absorbs a frontal hit but is knocked aside, so the next hit lands', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  sword.x = orcBoy.x;
  sword.z = orcBoy.z - 1;
  sword.facing = 'S';
  orcBoy.facing = 'N'; // looking straight at the swordsman => frontal
  // The attacker needs a real attack face up, or attack() is a no-op and the
  // test asserts nothing.
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  assert.equal(orcBoy.topLabel, 'Guard');
  assert.equal(g.previewAttack(sword).blocked, true);

  g.ap = 3;
  assert.equal(g.attack(sword), true);
  assert.notEqual(orcBoy.topLabel, 'Guard', 'the block must still knock the Guard aside');
  assert.equal(orcBoy.isWounded, false, 'but a hit through Guard can never wound');
  assert.equal(orcBoy.alive, true);

  // Now that Guard is gone, the follow-up is a real hit.
  g.ap = 3;
  assert.equal(g.previewAttack(sword).blocked, false, 'Guard is worth exactly one hit');
});

test('a flank hit is never blocked, even with Guard showing', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  orcBoy.x = 2;
  orcBoy.z = 2;
  orcBoy.facing = 'N'; // looking north, so a hit from the west is a flank
  sword.x = 1;
  sword.z = 2;
  sword.facing = 'E';
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  assert.equal(orcBoy.topLabel, 'Guard');
  assert.equal(g.previewAttack(sword).blocked, false, 'Guard only ever protects the front');
});

test('AT-8: defeating the enemy leader ends the game immediately', () => {
  const g = new Game();
  const captain = findUnit(g, 'captain');
  const warboss = findUnit(g, 'warboss');
  // Manually place the warboss adjacent so we can test the win condition directly,
  // bypassing full movement choreography. Captain's Defeated face lives on
  // WEST (see units.js), which only cycles to the top via repeated hits along
  // the east/west axis — so attack from the west, pushing east.
  warboss.x = captain.x - 1;
  warboss.z = captain.z;
  warboss.facing = 'E';
  captain.facing = 'S'; // not facing the attacker (west), so Guard never gets a chance to
  // block — this test is about the win condition, Guard-blocking is covered separately.
  // Chop lives on Warboss's SOUTH face (post-redesign: Orcs' 1-roll-forward
  // face is south, not north — see units.js). North/south rolls are the axis
  // that actually cycles it to the top; east/west rolls never would.
  while (warboss.topLabel !== 'Chop') warboss.orientation.roll('N');

  // Force captain onto its death face 'Defeated' via repeated hits, driving through
  // the game's public attack() API each time.
  let turns = 0;
  while (captain.alive && turns < 8) {
    if (g.currentFaction !== 'orcs') g.endTurn();
    g.attack(warboss);
    turns += 1;
  }
  assert.equal(captain.alive, false, 'captain should have been eliminated');
  assert.equal(g.gameOver, true, 'game must end when a leader is defeated');
  assert.equal(g.winner, 'orcs');
});

test('Bash pushes the target back one tile when the tile behind it is free', () => {
  const g = new Game();
  const orcBoy = findUnit(g, 'orcBoy'); // has Bash on its south face
  const target = findUnit(g, 'swordsman');
  // Place both away from the board edge so there's room behind the target to push into.
  target.x = 2;
  target.z = 2;
  orcBoy.x = 2;
  orcBoy.z = 3;
  orcBoy.facing = 'N';
  target.facing = 'W'; // not facing the orc, so Guard (if up) would not block — isolate push behaviour
  target.orientation.roll('E'); // knock target off Guard so we know exactly what's on top

  // Force orcBoy's top face to Bash by rolling until it shows.
  while (orcBoy.topLabel !== 'Bash') orcBoy.orientation.roll('N');

  const zBefore = target.z;
  g.currentFaction = 'orcs';
  g.ap = 3;
  g.attack(orcBoy);
  assert.equal(target.z, zBefore - 1, 'Bash should push the target one tile further from the attacker');
});
