import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

// Thrust is the only face with reach, and until now nothing checked it.
test('Thrust strikes two tiles away; every other attack face reaches only one', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const orcBoy = findUnit(g, 'orcBoy');

  pikeman.x = 2;
  pikeman.z = 2;
  pikeman.facing = 'S';
  orcBoy.x = 2;
  orcBoy.z = 4; // two tiles ahead
  orcBoy.facing = 'E';
  // clear the lane
  findUnit(g, 'swordsman').x = 0;
  findUnit(g, 'swordsman').z = 0;
  findUnit(g, 'captain').x = 5;
  findUnit(g, 'captain').z = 0;
  findUnit(g, 'shieldbearer').x = 0;
  findUnit(g, 'shieldbearer').z = 5;

  while (pikeman.topLabel !== 'Thrust') pikeman.orientation.roll('S');
  assert.equal(g.attackRange(pikeman), 2);
  assert.equal(g.findAttackTarget(pikeman), orcBoy, 'Thrust should reach across the gap');
  assert.equal(g.canAttack(pikeman), true);

  // A range-1 face on the same unit cannot.
  while (pikeman.topLabel !== 'Guard') pikeman.orientation.roll('S');
  assert.equal(g.attackRange(pikeman), 1);
  assert.equal(g.findAttackTarget(pikeman), null, 'a one-tile weapon falls short');
});

test('a body in the way blocks the attack line, even a friendly one', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');

  pikeman.x = 2;
  pikeman.z = 2;
  pikeman.facing = 'S';
  sword.x = 2;
  sword.z = 3; // our own man, standing in the lane
  orcBoy.x = 2;
  orcBoy.z = 4;
  while (pikeman.topLabel !== 'Thrust') pikeman.orientation.roll('S');

  assert.equal(g.findAttackTarget(pikeman), null, 'you cannot thrust through your own front rank');
  assert.equal(g.canAttack(pikeman), false);

  sword.x = 0; // step him aside
  assert.equal(g.findAttackTarget(pikeman), orcBoy, 'with the lane clear the reach works again');
});

test('an enemy standing closer is hit first, not the one further down the line', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const orcBoy = findUnit(g, 'orcBoy');
  const brute = findUnit(g, 'brute');

  pikeman.x = 2;
  pikeman.z = 2;
  pikeman.facing = 'S';
  orcBoy.x = 2;
  orcBoy.z = 3;
  brute.x = 2;
  brute.z = 4;
  while (pikeman.topLabel !== 'Thrust') pikeman.orientation.roll('S');

  assert.equal(g.findAttackTarget(pikeman), orcBoy, 'the near enemy takes the blow');
});
