import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

// The fan is the first threat in the game that does NOT run along one of the
// four axes the dice move on. Every earlier one — a two-tile polearm, a
// four-tile bow — pointed straight down a column, so the best square for a
// threatening unit was simply its own file and the columns only got more
// entrenched. A fan reaches into the neighbouring column, which is what makes
// standing beside someone dangerous.

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

/** A swordsman with the sweep up, alone in the middle, and a victim to place. */
function sweeper() {
  const g = new Game({ apPerTurn: 6 });
  const sword = findUnit(g, 'swordsman');
  const orc = g.units.find((u) => u.faction === 'orcs');
  for (const u of g.units) if (u !== sword && u !== orc) u.alive = false;
  sword.x = 3;
  sword.z = 3;
  sword.facing = 'S';
  while (sword.topLabel !== 'Sweep') sword.orientation.roll('E');
  const put = (x, z, facing = 'E') => {
    orc.x = x;
    orc.z = z;
    orc.facing = facing;
  };
  return { g, sword, orc, put };
}

test('a sweep threatens the tile ahead and both diagonals ahead of it', () => {
  const { g, sword, orc, put } = sweeper();
  put(3, 4); // straight ahead
  assert.equal(g.findAttackTarget(sword), orc);
  put(2, 4); // diagonally ahead-left
  assert.equal(g.findAttackTarget(sword), orc, 'the neighbouring column is inside the fan');
  put(4, 4); // diagonally ahead-right
  assert.equal(g.findAttackTarget(sword), orc);
});

test('and nothing else — not the sides, not behind, not two tiles out', () => {
  const { g, sword, orc, put } = sweeper();
  put(2, 3); // directly beside
  assert.equal(g.findAttackTarget(sword), null);
  put(3, 2); // behind
  assert.equal(g.findAttackTarget(sword), null);
  put(3, 5); // two ahead
  assert.equal(g.findAttackTarget(sword), null, 'a sweep is a swing, not a reach');
  put(2, 2); // diagonally BEHIND
  assert.equal(g.findAttackTarget(sword), null);
});

test('a sweep goes round a raised Guard, because a corner is never frontal', () => {
  const { g, sword, orc, put } = sweeper();

  // Straight ahead and looking right back at the swordsman: this is the one
  // arrangement a shield is for.
  put(3, 4, 'N');
  assert.equal(orc.topLabel, 'Guard');
  assert.equal(g.previewAttack(sword).blocked, true, 'head on, the Guard holds');

  // Same die, same facing, one column across — the shield is now pointing at
  // nothing and the blow lands.
  put(2, 4, 'N');
  assert.equal(g.previewAttack(sword).blocked, false, 'a shield covers the front, not the corner');
});

test('a sweep facing east reaches the columns above and below, not the file ahead', () => {
  const { g, sword, orc, put } = sweeper();
  sword.facing = 'E';
  put(4, 3);
  assert.equal(g.findAttackTarget(sword), orc, 'straight ahead of the new facing');
  put(4, 2);
  assert.equal(g.findAttackTarget(sword), orc, 'the fan turns with the unit');
  put(4, 4);
  assert.equal(g.findAttackTarget(sword), orc);
  put(3, 4);
  assert.equal(g.findAttackTarget(sword), null, 'that is beside it, not ahead of it');
});

test('with two enemies in the fan the sweep takes the better opening', () => {
  const g = new Game({ apPerTurn: 6 });
  const sword = findUnit(g, 'swordsman');
  const [a, b] = g.units.filter((u) => u.faction === 'orcs');
  for (const u of g.units) if (u !== sword && u !== a && u !== b) u.alive = false;
  sword.x = 3;
  sword.z = 3;
  sword.facing = 'S';
  while (sword.topLabel !== 'Sweep') sword.orientation.roll('E');

  a.x = 3;
  a.z = 4;
  a.facing = 'N'; // head on, shield up — this one would only be disarmed
  b.x = 2;
  b.z = 4;
  b.facing = 'N'; // on the corner — this one takes a real wound
  assert.equal(g.findAttackTarget(sword), b, 'the blade goes where it actually hurts');
});
