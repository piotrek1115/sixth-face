import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

/** Wall a unit in on all four sides with other units, so no travelling move
 *  of any kind is legal. */
function boxIn(game, unit) {
  const spare = game.units.filter((u) => u !== unit);
  const around = [
    { x: unit.x, z: unit.z - 1 },
    { x: unit.x, z: unit.z + 1 },
    { x: unit.x - 1, z: unit.z },
    { x: unit.x + 1, z: unit.z },
  ];
  around.forEach((pos, i) => {
    spare[i].x = pos.x;
    spare[i].z = pos.z;
  });
}

test('rolling in place changes the top face and keeps the tile', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 3;
  sword.z = 3;
  const topBefore = sword.topLabel;
  const facingBefore = sword.facing;

  assert.equal(g.rollInPlace(sword, 'S'), true);
  assert.notEqual(sword.topLabel, topBefore, 'the face must change, exactly like a travelling roll');
  assert.equal(sword.x, 3, 'and the unit must not move');
  assert.equal(sword.z, 3);
  assert.equal(sword.facing, facingBefore, 'facing is untouched — that is what TURN is for');
});

test('it costs the same 2 AP as a travelling roll', () => {
  const g = new Game();
  const sword = findUnit(g, 'captain'); // standard-cost unit; the swordsman is LIGHT
  g.ap = 5; // headroom so spending AP does not end the turn and reset it
  const apBefore = g.ap;
  assert.equal(g.rollInPlace(sword, 'S'), true);
  assert.equal(g.ap, apBefore - 2);
});

test('it is refused with only 1 AP', () => {
  const g = new Game();
  const sword = findUnit(g, 'captain'); // standard-cost unit; the swordsman is LIGHT
  g.ap = 1;
  assert.equal(g.canRollInPlace(sword), false);
  assert.equal(g.rollInPlace(sword, 'S'), false);
});

test('Rush discounts it to 1 AP, same as a travelling roll', () => {
  const g = new Game();
  const brute = findUnit(g, 'brute');
  g.currentFaction = 'orcs';
  g.ap = 5;
  while (brute.topLabel !== 'Rush') brute.orientation.roll('S');
  const apBefore = g.ap;
  assert.equal(g.rollInPlace(brute, 'E'), true);
  assert.equal(g.ap, apBefore - 1);
});

// The reason this action exists.
test('it works when the unit is walled in on all four sides and no roll or step is legal', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 3;
  sword.z = 3;
  boxIn(g, sword);
  g.ap = 5;

  for (const dir of ['N', 'E', 'S', 'W']) {
    assert.equal(g.canStep(sword, dir), false, `${dir}: boxed in, no step should be legal`);
    assert.equal(g.canRoll(sword, dir), false, `${dir}: boxed in, no travelling roll should be legal`);
  }

  const topBefore = sword.topLabel;
  assert.equal(g.canRollInPlace(sword), true, 'turning on the spot must still be available');
  assert.equal(g.rollInPlace(sword, 'S'), true);
  assert.notEqual(sword.topLabel, topBefore, 'so a pinned unit can still change its active face');
});

test('a pinned unit can reach an attack face and strike without ever moving', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  sword.x = 3;
  sword.z = 3;
  sword.facing = 'S';
  // Walled in on all four sides, with the ENEMY on the tile it faces — an
  // ally there would make the attack illegal for an unrelated reason and the
  // test would prove nothing.
  orcBoy.x = 3;
  orcBoy.z = 4;
  orcBoy.facing = 'E'; // side-on, so Guard never enters into it
  findUnit(g, 'captain').x = 3;
  findUnit(g, 'captain').z = 2;
  findUnit(g, 'pikeman').x = 2;
  findUnit(g, 'pikeman').z = 3;
  findUnit(g, 'shieldbearer').x = 4;
  findUnit(g, 'shieldbearer').z = 3;
  g.ap = 20;

  for (const dir of ['N', 'E', 'S', 'W']) {
    assert.equal(g.canRoll(sword, dir), false, `${dir}: it really is pinned`);
  }

  assert.equal(sword.topLabel, 'Guard');
  assert.equal(g.canAttack(sword), false, 'Guard cannot attack');

  let guard = 0;
  while (!g.canAttack(sword) && guard++ < 6) g.rollInPlace(sword, 'S');
  assert.ok(g.canAttack(sword), 'turning on the spot should bring an attack face up');
  assert.equal(sword.x, 3, 'and it should have happened without moving');
  assert.equal(sword.z, 3);
  assert.equal(g.attack(sword), true);
});

test('it can never put a unit on its own wound face, just like a travelling roll', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  sword.x = 3;
  sword.z = 3;
  boxIn(g, sword);
  g.ap = 200;
  for (let i = 0; i < 12; i++) {
    g.rollInPlace(sword, 'S');
    assert.equal(sword.isWounded, false, 'a unit must never turn itself onto Wounded');
    assert.equal(sword.alive, true);
  }
});

test('a wounded unit cannot turn its die on the spot either', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  while (sword.topLabel !== 'Wounded') sword.orientation.roll('N');
  assert.equal(sword.isWounded, true);
  assert.equal(g.canRollInPlace(sword), false, 'being wounded still leaves only the one dragging step');
  assert.equal(g.rollInPlace(sword, 'S'), false);
});
