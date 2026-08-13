import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';

// Nothing in the rules used to force a battle to end. A wounded die simply
// runs, and a pursuer of equal speed can never catch it — a real game was
// observed still going after eleven thousand turns. These cover the rule that
// closes that hole. It is deliberately dormant in healthy play (measured: the
// longest quiet stretch in a normal battle is 9 turns, the limit is 12), so
// without these tests it could rot unnoticed.

function twoSides(stallLimit, orcExtra) {
  const g = new Game({ deploy: true, stallLimit });
  g.deployUnit('captain', 'humans', 0, 0);
  g.deployUnit('warboss', 'orcs', 6, 6);
  if (orcExtra) g.deployUnit('orcBoy', 'orcs', 5, 6);
  g.startBattle();
  return g;
}

test('a battle with no blows landed is called once the quiet runs too long', () => {
  const g = twoSides(4, true);
  for (let i = 0; i < 3; i++) {
    g.endTurn();
    assert.equal(g.gameOver, false, 'must not fire early');
  }
  g.endTurn();
  assert.equal(g.gameOver, true);
  assert.equal(g.endReason, 'exhaustion');
});

test('the side with more fight left wins the called battle', () => {
  const g = twoSides(4, true); // orcs field two dice to the humans' one
  for (let i = 0; i < 4; i++) g.endTurn();
  assert.equal(g.winner, 'orcs');
});

test('an even battle is called a draw, not a win', () => {
  const g = twoSides(4, false); // one die each
  for (let i = 0; i < 4; i++) g.endTurn();
  assert.equal(g.gameOver, true);
  assert.equal(g.winner, null, 'nobody wins a battle nobody was winning');
});

test('a wounded die counts half, so running away with one loses the call', () => {
  const g = twoSides(4, false);
  const orc = g.units.find((u) => u.faction === 'orcs');
  while (!orc.isWounded) orc.orientation.roll('N');
  assert.equal(g.armyStrength('humans'), 2);
  assert.equal(g.armyStrength('orcs'), 1, 'a wounded die is worth half a healthy one');
  for (let i = 0; i < 4; i++) g.endTurn();
  assert.equal(g.winner, 'humans');
});

test('landing a blow resets the clock', () => {
  const g = new Game({ deploy: true, stallLimit: 4 });
  g.deployUnit('swordsman', 'humans', 2, 2);
  g.deployUnit('orcBoy', 'orcs', 2, 3);
  g.deployUnit('warboss', 'orcs', 6, 6);
  g.startBattle();

  const sword = g.units.find((u) => u.unitTypeId === 'swordsman');
  const orc = g.units.find((u) => u.unitTypeId === 'orcBoy');
  orc.facing = 'E'; // not frontal, so the blow actually lands
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  g.endTurn();
  g.endTurn();
  assert.equal(g.turnsSinceBlood, 2);
  assert.equal(g.attack(sword), true);
  assert.equal(g.turnsSinceBlood, 0, 'a landed blow puts the battle back on the clock');
});
