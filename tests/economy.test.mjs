import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

// The 'freestep' economy exists to answer one question: can a numerous
// faction exist at all? Under the shared pool it cannot — eight dice sharing
// three AP are five statues a turn, so "cheap and many" buys nothing. Here
// every die gets one free Step-or-Turn and AP buys nothing but tipping and
// attacking, which states the game's thesis literally: walking is free,
// re-arming is the whole economy.

const find = (g, id) => g.units.find((u) => u.unitTypeId === id);
const freeGame = (opts = {}) => new Game({ economy: 'freestep', ...opts });

test('a die still walks with an empty AP pool', () => {
  const g = freeGame();
  const u = find(g, 'swordsman');
  g.ap = 0;
  assert.equal(g.canStep(u, 'N'), true, 'the free step does not come out of the pool');
  assert.equal(g.step(u, 'N'), true);
  assert.equal(g.ap, 0, 'and it costs nothing');
});

test('the free action is one per die per turn — Step or Turn, not both', () => {
  const g = freeGame();
  const a = find(g, 'swordsman');
  g.step(a, 'N');
  assert.equal(g.canStep(a, 'N'), false, 'no second step');
  assert.equal(g.canTurn(a), false, 'and no turn either — it was one action, not two');

  const b = find(g, 'archer');
  g.turn(b, true);
  assert.equal(g.canStep(b, 'N'), false, 'spending it on a turn spends it just the same');
});

test('every die on the side gets its own free action', () => {
  const g = freeGame();
  // Each die takes the first direction open to it — the ranks stand shoulder
  // to shoulder, so they cannot all walk the same way.
  const moved = g.aliveUnits('humans').filter((u) => ['N', 'S', 'E', 'W'].some((d) => g.step(u, d)));
  assert.equal(moved.length, g.aliveUnits('humans').length, 'the whole warband moves in one turn');
  assert.equal(g.ap, 3, 'and the pool is untouched by all of it');
});

test('AP still buys tipping, and only tipping and attacking', () => {
  const g = freeGame();
  const light = find(g, 'swordsman'); // tips for 1
  assert.equal(g.ap, 3);
  assert.equal(g.rollInPlace(light, 'W'), true);
  assert.equal(g.ap, 2, 'the tip came out of the pool');
});

test('an empty pool no longer ends the turn while dice can still walk', () => {
  const g = freeGame();
  const turnAtStart = g.turnNumber;
  const heavy = find(g, 'shieldbearer'); // tips for 3 — drains the pool in one action
  assert.equal(g.rollInPlace(heavy, 'W'), true);
  assert.equal(g.ap, 0);
  assert.equal(g.turnNumber, turnAtStart, 'turn is not over: nobody else has stepped yet');
  assert.equal(g.currentFaction, 'humans');
});

test('the turn does end once the pool is empty and every die has walked', () => {
  const g = freeGame();
  g.ap = 0;
  const mine = g.aliveUnits('humans');
  for (const u of mine) {
    if (g.canTurn(u)) g.turn(u, true);
  }
  assert.equal(g.currentFaction, 'orcs', 'nothing legal left, so the side hands over');
});

test("the pool economy is untouched — a step still costs 1 AP", () => {
  const g = new Game(); // default: 'pool'
  const u = find(g, 'swordsman');
  assert.equal(g.hasFreeAction(u), false, 'nothing is free under the pool');
  g.step(u, 'N');
  assert.equal(g.ap, 2);
});
