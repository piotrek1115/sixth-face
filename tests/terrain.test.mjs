import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { TERRAIN } from '../src/core/board.js';

// Terrain exists to answer a measured failure: every tile was identical and
// every unit threatened exactly one tile ahead, so half the army never even
// changed column and widening the board from 6x6 to 7x7 changed nothing.
// Walls make routes matter; mud makes the ABILITY you carry matter.

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

/** A unit alone in the middle of an empty board, with plenty of AP. */
function loneUnit(id = 'captain') {
  const g = new Game({ apPerTurn: 6 });
  const u = findUnit(g, id);
  for (const other of g.units) if (other !== u) other.alive = false;
  u.x = 3;
  u.z = 3;
  return { g, u };
}

test('a wall cannot be walked into, rolled into, or deployed onto', () => {
  const { g, u } = loneUnit();
  g.terrain.set('3,4', TERRAIN.WALL);

  assert.equal(g.canStep(u, 'S'), false, 'you cannot walk into stone');
  assert.equal(g.canRoll(u, 'S'), false, 'nor tip into it');
  assert.equal(g.canStep(u, 'E'), true, 'the way round is still open');

  const setup = new Game({ deploy: true });
  setup.terrain.set('2,2', TERRAIN.WALL);
  assert.equal(setup.deployUnit('swordsman', 'humans', 2, 2), null);
});

test('a wall stops a blow that would otherwise land', () => {
  const g = new Game({ apPerTurn: 6 });
  const sword = findUnit(g, 'swordsman');
  const orc = findUnit(g, 'orcBoy');
  for (const other of g.units) if (other !== sword && other !== orc) other.alive = false;

  // Reach two so the wall has somewhere to stand between them.
  sword.x = 3;
  sword.z = 2;
  sword.facing = 'S';
  orc.x = 3;
  orc.z = 4;
  orc.facing = 'E';
  const pike = findUnit(g, 'pikeman'); // the reach unit does the reaching
  pike.alive = true;
  pike.x = 3;
  pike.z = 2;
  sword.alive = false;
  pike.facing = 'S';
  while (pike.topLabel !== 'Thrust') pike.orientation.roll('S');

  assert.equal(g.findAttackTarget(pike), orc, 'with the lane clear the blow reaches');
  g.terrain.set('3,3', TERRAIN.WALL);
  assert.equal(g.findAttackTarget(pike), null, 'a blow does not travel through stone');
});

test('mud is walked through freely — it is movement it does NOT restrict', () => {
  const { g, u } = loneUnit();
  g.terrain.set('3,4', TERRAIN.MUD);
  assert.equal(g.canStep(u, 'S'), true, 'you can walk into mud');
  assert.equal(g.step(u, 'S'), true);
  assert.equal(u.z, 4);
  assert.equal(g.canStep(u, 'S'), true, 'and out the far side');
});

test('mud stops the die tipping: into it, out of it, and standing in it', () => {
  const { g, u } = loneUnit();
  g.terrain.set('3,4', TERRAIN.MUD);

  assert.equal(g.canRoll(u, 'S'), false, 'no tipping INTO mud');
  assert.equal(g.canRoll(u, 'E'), true, 'other directions are unaffected');

  u.z = 4; // now standing in it
  assert.equal(g.canRoll(u, 'S'), false, 'no tipping OUT of mud');
  assert.equal(g.canRollInPlace(u), false, 'and none on the spot either');
  assert.equal(g.canStep(u, 'S'), true, 'walking still works — that is the whole point');
});

test('the ability you carry into mud is the one you carry out', () => {
  const { g, u } = loneUnit();
  g.terrain.set('3,4', TERRAIN.MUD);
  g.terrain.set('3,5', TERRAIN.MUD);
  const carried = u.topLabel;

  assert.equal(g.step(u, 'S'), true);
  assert.equal(g.step(u, 'S'), true);
  assert.equal(u.topLabel, carried, 'nothing in the mud could have changed it');
  assert.equal(g.canRollInPlace(u), false);
});

test('a 2-tile Advance step cannot vault a wall standing in the middle', () => {
  const { g, u } = loneUnit('swordsman');
  while (u.topLabel !== 'Advance') u.orientation.roll('E');
  assert.equal(g.canStep(u, 'S'), true, 'two clear tiles ahead');
  g.terrain.set('3,4', TERRAIN.WALL); // the FIRST of the two
  assert.equal(g.canStep(u, 'S'), false, 'the wall is in the way of the first stride');
});
