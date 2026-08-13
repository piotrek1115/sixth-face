import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { TERRAIN } from '../src/core/board.js';

// A missile is a FACE, not a unit trait: you are a shooter only while the bow
// is up. Loosing then tips the die off it, so a shooter runs on a rhythm of
// load, loose, load — which is the whole reason it costs tempo instead of
// being a free tap of damage at 1 AP a turn.

function findUnit(game, id) {
  return game.units.find((u) => u.unitTypeId === id);
}

/** An archer alone in its column, loaded, with an orc somewhere ahead. */
function shootingRange() {
  const g = new Game({ apPerTurn: 6 });
  const archer = findUnit(g, 'archer');
  for (const u of g.units) if (u !== archer && u.x === archer.x) u.alive = false;
  const orc = g.units.find((u) => u.faction === 'orcs' && u.alive);
  while (archer.topLabel !== 'Loose') archer.applyRollInPlace('S');
  const place = (dz) => {
    orc.x = archer.x;
    orc.z = archer.z + dz;
    orc.facing = 'E'; // side-on, so Guard never confuses the question
  };
  return { g, archer, orc, place };
}

test('a bow reaches four tiles but cannot be loosed at someone on top of you', () => {
  const { g, archer, place } = shootingRange();
  assert.equal(g.attackRange(archer), 4);
  assert.equal(g.attackMinRange(archer), 2);

  place(1);
  assert.equal(g.findAttackTarget(archer), null, 'an enemy in contact fouls the shot');
  place(2);
  assert.ok(g.findAttackTarget(archer), 'two tiles is the closest it works');
  place(4);
  assert.ok(g.findAttackTarget(archer), 'four is the limit');
  place(5);
  assert.equal(g.findAttackTarget(archer), null, 'and five is beyond it');
});

test('an arrow arcs over your own front rank but not through a wall', () => {
  const g = new Game({ apPerTurn: 6 });
  const archer = findUnit(g, 'archer');
  const orc = g.units.find((u) => u.faction === 'orcs');
  while (archer.topLabel !== 'Loose') archer.applyRollInPlace('S');

  // The standard line-up already puts a friendly rank directly in front.
  const inTheWay = g.units.find((u) => u.faction === 'humans' && u.x === archer.x && u.z === archer.z + 1);
  assert.ok(inTheWay, 'the second rank really does stand behind the first');

  orc.x = archer.x;
  orc.z = archer.z + 3;
  orc.facing = 'E';
  assert.equal(g.findAttackTarget(archer), orc, 'the shot arcs over your own man');

  g.terrain.set(`${archer.x},${archer.z + 2}`, TERRAIN.WALL);
  assert.equal(g.findAttackTarget(archer), null, 'stone stops it — that is what cover is');
});

test('loosing spends the shot: the die tips off its missile face', () => {
  const { g, archer, place } = shootingRange();
  place(3);
  assert.equal(archer.topLabel, 'Loose');

  g.currentFaction = 'humans';
  assert.equal(g.attack(archer), true);
  assert.notEqual(archer.topLabel, 'Loose', 'the bow comes down when it is loosed');
  assert.equal(g.attackMinRange(archer), 1, 'and what is left is not a missile');
  assert.equal(g.findAttackTarget(archer), null, 'so it cannot shoot again on the spot');
});

test('loosing can never wound the shooter — the skip covers it like any tip', () => {
  const { g, archer, place } = shootingRange();
  place(3);
  g.currentFaction = 'humans';
  g.attack(archer);
  assert.equal(archer.isWounded, false);
  assert.equal(archer.alive, true);
});

test('a melee attack leaves the attacker facing exactly as it was', () => {
  const g = new Game({ apPerTurn: 6 });
  const sword = findUnit(g, 'swordsman');
  const orc = g.units.find((u) => u.faction === 'orcs');
  sword.x = 3;
  sword.z = 3;
  sword.facing = 'S';
  orc.x = 3;
  orc.z = 4;
  orc.facing = 'E';
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  g.currentFaction = 'humans';
  assert.equal(g.attack(sword), true);
  assert.equal(sword.topLabel, 'Strike', 'only a missile spends itself; a blade does not');
});
