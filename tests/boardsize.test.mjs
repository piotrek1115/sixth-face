import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

// Plansza jest własnością partii, nie modułu — przebudowa na skirmish gra na
// mniejszej, a mierzyć trzeba kilka rozmiarów w jednym procesie.

test('a smaller board really is smaller — its edge rejects what 7x7 allowed', () => {
  const small = new Game({ deploy: true, boardSize: 6 });
  assert.equal(small.boardSize, 6);
  assert.ok(small.deployUnit('swordsman', 'humans', 5, 5), 'the far corner of a 6x6');
  assert.equal(small.deployUnit('pikeman', 'humans', 6, 5), null, 'one tile past it is off the board');

  const big = new Game({ deploy: true });
  assert.equal(big.boardSize, 7);
  assert.ok(big.deployUnit('pikeman', 'humans', 6, 5), 'the same tile is legal on 7x7');
});

test('walking off the small board is refused, walking on it is not', () => {
  const g = new Game({ deploy: true, boardSize: 6, economy: 'freestep' });
  const u = g.deployUnit('swordsman', 'humans', 5, 3);
  g.deployUnit('orcBoy', 'orcs', 0, 3);
  g.startBattle();
  assert.equal(g.canStep(u, 'E'), false, 'E would leave the board');
  assert.equal(g.canStep(u, 'W'), true);
});

test('the standard line-up centres itself on whatever board it is given', () => {
  for (const boardSize of [6, 7, 8]) {
    const g = new Game({ boardSize });
    const xs = g.aliveUnits('humans').map((u) => u.x);
    assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) < boardSize, `fits on ${boardSize}x${boardSize}`);
    const orcs = g.aliveUnits('orcs').map((u) => u.z);
    assert.ok(Math.max(...orcs) === boardSize - 1, `orcs sit on the far edge of ${boardSize}`);
  }
});
