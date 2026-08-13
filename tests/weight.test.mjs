import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

// Light and heavy live on the one axis this game actually has: tipping the
// die is BOTH how you move and how you change what you can do. A light die
// buys that for 1 AP and so keeps reinventing itself; a heavy one pays a
// whole turn and therefore keeps the face it has.

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

test('a light die tips for 1 AP, a standard one for 2, a heavy one for 3', () => {
  const g = new Game();
  assert.equal(g._rollCost(findUnit(g, 'swordsman')), 1, 'Swordsman is light');
  assert.equal(g._rollCost(findUnit(g, 'captain')), 2, 'Captain is standard');
  assert.equal(g._rollCost(findUnit(g, 'shieldbearer')), 3, 'Shieldbearer is heavy');
  // Mirrored across the factions, or the archetype would just be a human edge.
  assert.equal(g._rollCost(findUnit(g, 'orcBoy')), 1);
  assert.equal(g._rollCost(findUnit(g, 'mauler')), 3);
});

test('on a 2 AP turn the heavy die cannot change its face at all, but still walks', () => {
  // Explicitly 2 AP: the standard turn is 3 now, but a turn can still drop to
  // 2 (a commander spending its own turn on orders does not raise everyone),
  // and the point of a heavy die is that some turns it simply cannot tip.
  const g = new Game({ apPerTurn: 2 });
  const heavy = findUnit(g, 'shieldbearer');
  assert.equal(g.ap, 2);
  assert.equal(g.canRoll(heavy, 'S'), false, 'three AP of tipping is beyond a two AP turn');
  assert.equal(g.canRollInPlace(heavy), false);
  assert.equal(g.canStep(heavy, 'S'), true, 'a heavy unit you can never move would just be left at home');
});

test('the same die can tip on a 3 AP turn — and it costs the whole turn', () => {
  const g = new Game({ apPerTurn: 3 });
  const heavy = findUnit(g, 'shieldbearer');
  assert.equal(g.canRoll(heavy, 'S'), true);
  assert.equal(g.roll(heavy, 'S'), true);
  // Spending the last AP hands the turn over on the spot, so the counter has
  // already been refilled for the other side — the handover is the evidence.
  assert.equal(g.currentFaction, 'orcs', 'turning a heavy die over is the whole turn');
});

test('a light die can tip twice in a single 2 AP turn', () => {
  const g = new Game({ apPerTurn: 2 });
  const light = findUnit(g, 'swordsman');
  assert.equal(g.roll(light, 'S'), true);
  assert.equal(g.ap, 1, 'a light tip leaves half the turn still in hand');
  assert.equal(g.roll(light, 'S'), true, 'two face changes in one turn is what light buys you');
  assert.equal(g.currentFaction, 'orcs', 'and that is the whole turn spent');
});

test('Rush discounts a unit from ITS OWN base, not to a flat 1 AP', () => {
  const g = new Game({ apPerTurn: 5 });
  const heavy = findUnit(g, 'mauler'); // heavy, and Rush is not on its die
  const brute = findUnit(g, 'brute'); // standard cost, carries Rush
  while (brute.topLabel !== 'Rush') brute.orientation.roll('N');
  assert.equal(g._rollCost(brute), 1, 'a standard die showing Rush tips for 1');

  // Force the heavy die onto Rush artificially to prove the discount is
  // relative: without this a heavy unit that happened to show Rush would be
  // the nimblest thing on the board.
  const mauler = heavy;
  const saved = mauler.type.faces.north;
  mauler.type.faces.north = 'Rush';
  try {
    while (mauler.topLabel !== 'Rush') mauler.orientation.roll('S');
    assert.equal(g._rollCost(mauler), 2, 'heavy + Rush is still slower than standard');
  } finally {
    mauler.type.faces.north = saved;
  }
});
