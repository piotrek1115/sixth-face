import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { ATTACK_LABELS } from '../src/core/units.js';

// Cele istnieją, bo dopóki jedynym warunkiem zwycięstwa był dowódca, obie
// armie musiały się zejść w jednym punkcie, a niedobitek uciekał za darmo.

const battle = (scenario, boardSize = 6) => {
  const g = new Game({ deploy: true, scenario, boardSize, economy: 'freestep' });
  return g;
};

test('shrines sit symmetrically — neither side starts closer to more of them', () => {
  const g = new Game({ scenario: 'shrines', boardSize: 6 });
  assert.equal(g.objectives.length, 4);
  const key = (o) => `${o.x},${o.z}`;
  const set = new Set(g.objectives.map(key));
  for (const o of g.objectives) {
    // obrót o 180° musi przeprowadzać zbiór celów w siebie
    assert.ok(set.has(`${5 - o.x},${5 - o.z}`), `${key(o)} has no mirror`);
  }
});

test('a shrine pays only when you are NOT showing an attack face', () => {
  const g = battle('shrines');
  const o = g.objectives[0];
  const u = g.deployUnit('swordsman', 'humans', o.x, o.z);
  g.deployUnit('orcBoy', 'orcs', 5, 5);
  g.startBattle();

  while (ATTACK_LABELS.has(u.topLabel)) u.orientation.roll('S');
  g.endTurn();
  assert.equal(g.score.humans, 1, 'holding it with a non-attack face scores');

  const before = g.score.humans;
  g.currentFaction = 'humans';
  while (!ATTACK_LABELS.has(u.topLabel)) u.orientation.roll('S');
  g.endTurn();
  assert.equal(g.score.humans, before, 'you cannot hold it and threaten from it at once');
});

test('reaching the score target wins the battle', () => {
  const g = battle('shrines');
  const u = g.deployUnit('swordsman', 'humans', g.objectives[0].x, g.objectives[0].z);
  g.deployUnit('orcBoy', 'orcs', 5, 5);
  g.startBattle();
  while (ATTACK_LABELS.has(u.topLabel)) u.orientation.roll('S');

  for (let i = 0; i < 40 && !g.gameOver; i++) {
    g.currentFaction = 'humans';
    g.endTurn();
  }
  assert.equal(g.gameOver, true);
  assert.equal(g.endReason, 'score');
  assert.equal(g.winner, 'humans');
  assert.ok(g.score.humans >= g.scoreTarget);
});

test('picking up the relic fills your hands — the die stops tipping', () => {
  const g = battle('relic');
  const r = g.relics[0];
  const u = g.deployUnit('swordsman', 'humans', r.x, r.z + 1);
  g.deployUnit('orcBoy', 'orcs', 5, 5);
  g.startBattle();
  g.ap = 20;

  assert.equal(g.canRollInPlace(u), true, 'tips freely before the pick-up');
  assert.equal(g.step(u, 'N'), true, 'step onto the relic');
  assert.equal(g.isCarrying(u), true);
  assert.equal(g.canRollInPlace(u), false, 'hands full: no tip in place');
  assert.equal(g.canRoll(u, 'N'), false, 'and no rolling move either');
  g._freeUsed.clear(); // krok na relikwię zużył darmową akcję tej kostki
  assert.equal(g.canStep(u, 'N') || g.canStep(u, 'W'), true, 'but it still walks');
});

test('a held relic pays every turn, and a wounded carrier drops it', () => {
  const g = battle('relic');
  const [r, r2] = g.relics;
  const u = g.deployUnit('swordsman', 'humans', r.x, r.z);
  const v = g.deployUnit('pikeman', 'humans', r2.x, r2.z);
  g.deployUnit('orcBoy', 'orcs', 5, 5);
  g.startBattle();
  g.ap = 40;
  g._syncRelics(u);
  assert.equal(g.isCarrying(u), true);

  // Relikwia nie jest wyścigiem tylko łupem: punktuje co turę, dopóki ją
  // trzymasz. Dostawy do własnego rzędu nie ma — patrz komentarz przy
  // scenariuszu, cztery zmierzone tryby awarii.
  g._syncRelics(v);
  g.endTurn();
  assert.equal(g.score.humans, 2, 'dwie trzymane relikwie = dwa punkty na turę');

  while (!v.isWounded) v.applyHit('N');
  g._syncRelics(v);
  assert.equal(g.isCarrying(v), false, 'a wounded die is dragging itself, not the prize');
  assert.equal(g.relics.find((x) => x.x === v.x && x.z === v.z) !== undefined, true, 'relic stays where it fell');

  g.currentFaction = 'humans';
  g.endTurn();
  assert.equal(g.score.humans, 3, 'tylko jedna wciąż niesiona');
});

test('the duel scenario is untouched — the leader still ends it', () => {
  const g = new Game({ boardSize: 6 });
  assert.equal(g.scenario, 'leader');
  assert.equal(g.scoreTarget, null);
  assert.equal(g.objectives.length, 0);
  const boss = g.leaderOf('orcs');
  while (boss.alive) boss.applyHit('N');
  g._onUnitKilled(boss, 'humans');
  assert.equal(g.endReason, 'leader');
  assert.equal(g.winner, 'humans');
});
