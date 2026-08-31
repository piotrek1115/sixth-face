import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { UNIT_TYPES } from '../src/core/units.js';

test('a custom game starts empty and refuses to begin until both sides have a die', () => {
  const g = new Game({ deploy: true });
  assert.equal(g.units.length, 0);
  assert.equal(g.phase, 'deploy');
  assert.equal(g.canStartBattle(), false);

  g.deployUnit('swordsman', 'humans', 1, 1);
  assert.equal(g.canStartBattle(), false, 'one side alone is not a battle');
  g.deployUnit('orcBoy', 'orcs', 4, 4);
  assert.equal(g.canStartBattle(), true);
  assert.equal(g.startBattle(), true);
  assert.equal(g.phase, 'battle');
});

test('nothing may act while dice are still being placed', () => {
  const g = new Game({ deploy: true });
  const u = g.deployUnit('swordsman', 'humans', 2, 2);
  assert.equal(g.canAct(u), false);
  assert.equal(g.canStep(u, 'N'), false);
  assert.equal(g.canRoll(u, 'N'), false);
  assert.equal(g.canRollInPlace(u), false);
  assert.equal(g.canTurn(u), false);
  assert.equal(g.canAttack(u), false);
});

test('deploy refuses occupied tiles and tiles off the board', () => {
  const g = new Game({ deploy: true });
  assert.ok(g.deployUnit('swordsman', 'humans', 2, 2));
  assert.equal(g.deployUnit('pikeman', 'humans', 2, 2), null, 'tile already taken');
  assert.equal(g.deployUnit('pikeman', 'humans', -1, 2), null, 'off the board');
  assert.equal(g.deployUnit('pikeman', 'humans', 99, 2), null, 'off the board');
  assert.equal(g.units.length, 1);
});

test('any number of any unit type may be deployed anywhere', () => {
  const g = new Game({ deploy: true });
  for (let i = 0; i < 5; i++) g.deployUnit('swordsman', 'humans', i, 0);
  g.deployUnit('warboss', 'orcs', 0, 5);
  g.deployUnit('warboss', 'orcs', 1, 5); // even two leaders, if the player wants
  assert.equal(g.aliveUnits('humans').length, 5);
  assert.equal(g.aliveUnits('orcs').length, 2);
});

test('units can be taken back off the board, but only during setup', () => {
  const g = new Game({ deploy: true });
  const a = g.deployUnit('swordsman', 'humans', 1, 1);
  g.deployUnit('orcBoy', 'orcs', 4, 4);
  assert.equal(g.undeployUnit(a), true);
  assert.equal(g.units.length, 1);

  const b = g.deployUnit('swordsman', 'humans', 1, 1);
  g.startBattle();
  assert.equal(g.undeployUnit(b), false, 'no take-backs once the battle is on');
  assert.equal(g.deployUnit('pikeman', 'humans', 2, 2), null, 'and no reinforcements either');
});

// The point of the mode is that everything else behaves exactly as normal.
test('every action works normally in a custom game', () => {
  const g = new Game({ deploy: true });
  const sword = g.deployUnit('swordsman', 'humans', 2, 2);
  const orc = g.deployUnit('orcBoy', 'orcs', 2, 3);
  g.startBattle();
  g.ap = 40;

  assert.equal(g.step(sword, 'W'), true, 'step');
  assert.equal(g.rollInPlace(sword, 'S'), true, 'tip in place');
  assert.equal(g.roll(sword, 'E'), true, 'roll');
  assert.equal(g.turn(sword, true), true, 'face turn');

  // Line it up and confirm the whole damage ladder resolves as usual.
  sword.x = 2; sword.z = 2; sword.facing = 'S';
  orc.x = 2; orc.z = 3; orc.facing = 'E'; // side-on, so no Guard block
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');
  assert.equal(g.canAttack(sword), true, 'attack');
  assert.equal(g.attack(sword), true);
  assert.equal(orc.isWounded, true, 'flank hit wounds');
  g.ap = 40;
  g.attack(sword);
  assert.equal(orc.alive, false, 'second hit finishes it');
  // Kiedys ta linijka brzmiala „brak dowodcow, wiec nie ma jeszcze warunku
  // zwyciestwa" — i opisywala realna luke: dalo sie wybic przeciwnika do zera,
  // a partia trwala dalej. Wybicie warbandy konczy gre.
  assert.equal(g.gameOver, true, 'the last enemy die is gone — that is a wipeout');
  assert.equal(g.endReason, 'wipeout');
  assert.equal(g.winner, 'humans');
});

test('a custom game still ends when a deployed leader falls', () => {
  const g = new Game({ deploy: true });
  const sword = g.deployUnit('swordsman', 'humans', 2, 2);
  const boss = g.deployUnit('warboss', 'orcs', 2, 3);
  g.startBattle();
  g.ap = 40;
  sword.facing = 'S';
  boss.facing = 'E';
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');
  g.attack(sword);
  g.ap = 40;
  g.attack(sword);
  assert.equal(boss.alive, false);
  assert.equal(g.gameOver, true);
  assert.equal(g.winner, 'humans');
});

test('the AI can play a hand-placed army too', async () => {
  const { decideAiAction } = await import('../src/core/ai.js');
  const g = new Game({ deploy: true });
  g.deployUnit('swordsman', 'humans', 1, 1);
  g.deployUnit('captain', 'humans', 0, 0);
  g.deployUnit('brute', 'orcs', 4, 4);
  g.deployUnit('warboss', 'orcs', 5, 5);
  g.startBattle();

  let t = 0;
  while (!g.gameOver && t < 2000) {
    const d = decideAiAction(g);
    if (!d) { if (g.ap > 0) g.endTurn(); else break; t++; continue; }
    if (d.type === 'attack') g.attack(d.unit);
    else if (d.type === 'roll') g.roll(d.unit, d.dir);
    else if (d.type === 'rollInPlace') g.rollInPlace(d.unit, d.dir);
    else if (d.type === 'step') g.step(d.unit, d.dir);
    else g.turn(d.unit, d.cw);
    t++;
  }
  assert.equal(g.gameOver, true, 'a custom line-up must still play to a conclusion');
});
