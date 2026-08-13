import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

/** Park every unit except the named ones off in the far columns, so a test
 *  lane is genuinely empty. The home rows are full now, so leaving anyone
 *  where they spawned quietly plants a body in whatever line we measure. */
function clearExcept(g, keep) {
  let slot = 0;
  for (const u of g.units) {
    if (keep.includes(u)) continue;
    u.x = 6 - Math.floor(slot / 7);
    u.z = slot % 7;
    slot++;
  }
}

test('reach is a property of the UNIT: every attack face carries two tiles', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const orcBoy = findUnit(g, 'orcBoy');
  clearExcept(g, [pikeman, orcBoy]);

  pikeman.x = 2;
  pikeman.z = 2;
  pikeman.facing = 'S';
  orcBoy.x = 2;
  orcBoy.z = 4; // two tiles ahead
  orcBoy.facing = 'E';

  while (pikeman.topLabel !== 'Thrust') pikeman.orientation.roll('S');
  assert.equal(g.attackRange(pikeman), 2);
  assert.equal(g.findAttackTarget(pikeman), orcBoy, 'the reach unit should cross the gap');
  assert.equal(g.canAttack(pikeman), true);

  // The length is carried by the shaft, not by the face — so it survives a
  // tumble onto any other side.
  while (pikeman.topLabel !== 'Guard') pikeman.orientation.roll('S');
  assert.equal(g.attackRange(pikeman), 2, 'a reach unit keeps its length on every face');
});

test('an ordinary unit reaches exactly one tile', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  clearExcept(g, [sword, orcBoy]);

  sword.x = 2;
  sword.z = 2;
  sword.facing = 'S';
  orcBoy.x = 2;
  orcBoy.z = 4; // two tiles ahead — out of a swordsman's reach
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  assert.equal(g.attackRange(sword), 1);
  assert.equal(g.findAttackTarget(sword), null, 'a one-tile weapon falls short');
});

test('a reach unit strikes OVER its own front rank; an ordinary one is blocked by it', () => {
  const g = new Game();
  const pikeman = findUnit(g, 'pikeman');
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  clearExcept(g, [pikeman, sword, orcBoy]);

  // Our own man stands between the pikeman and the enemy.
  pikeman.x = 2;
  pikeman.z = 2;
  pikeman.facing = 'S';
  sword.x = 2;
  sword.z = 3;
  sword.facing = 'S';
  orcBoy.x = 2;
  orcBoy.z = 4;
  while (pikeman.topLabel !== 'Thrust') pikeman.orientation.roll('S');

  assert.equal(g.findAttackTarget(pikeman), orcBoy, 'the shaft passes over your own front rank');
  assert.equal(g.canAttack(pikeman), true);

  // The man in front, being ordinary, is stopped by the same friendly body
  // if one stands ahead of HIM.
  const blocker = findUnit(g, 'shieldbearer');
  blocker.x = 2;
  blocker.z = 4;
  orcBoy.x = 2;
  orcBoy.z = 5;
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');
  assert.equal(g.findAttackTarget(sword), null, 'an ordinary weapon cannot pass a friendly body');
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
