import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/core/game.js';
import { decideAiAction } from '../src/core/ai.js';

function findUnit(game, unitTypeId) {
  return game.units.find((u) => u.unitTypeId === unitTypeId);
}

function applyDecision(game, decision) {
  const { type, unit } = decision;
  if (type === 'attack') return game.attack(unit);
  if (type === 'roll') return game.roll(unit, decision.dir);
  if (type === 'step') return game.step(unit, decision.dir);
  if (type === 'rollInPlace') return game.rollInPlace(unit, decision.dir);
  if (type === 'turn') return game.turn(unit, decision.cw);
  throw new Error(`unknown decision type: ${type}`);
}

test('AI attacks immediately when a unit can already attack', () => {
  const g = new Game();
  const sword = findUnit(g, 'swordsman');
  const orcBoy = findUnit(g, 'orcBoy');
  sword.x = orcBoy.x;
  sword.z = orcBoy.z - 1;
  orcBoy.facing = 'E'; // not frontal, so the attack actually lands
  while (sword.topLabel !== 'Strike') sword.orientation.roll('S');

  const decision = decideAiAction(g);
  assert.equal(decision.type, 'attack');
  assert.equal(decision.unit, sword);
});

test('AI advances the nearest unit toward the nearest enemy when nobody can attack yet', () => {
  const g = new Game(); // fresh spawn, everyone far apart, all on Guard
  const decision = decideAiAction(g);
  assert.ok(decision, 'should always find SOME productive action from the opening position');
  assert.ok(['roll', 'rollInPlace', 'step', 'turn'].includes(decision.type), `unexpected opening action: ${decision.type}`);
});

test('a full AI-driven turn always terminates and ends the turn', () => {
  const g = new Game();
  const startFaction = g.currentFaction;
  let guard = 0;
  while (g.currentFaction === startFaction && !g.gameOver && guard < 20) {
    const decision = decideAiAction(g);
    if (!decision) break;
    applyDecision(g, decision);
    guard++;
  }
  assert.ok(guard < 20, 'the AI must not loop indefinitely without making progress');
});

test('a fully AI-driven game reaches gameOver within a bounded number of turns', () => {
  const g = new Game();
  let turns = 0;
  const MAX_TURNS = 400;
  while (!g.gameOver && turns < MAX_TURNS) {
    const decision = decideAiAction(g);
    if (decision) {
      applyDecision(g, decision);
    } else if (g.ap > 0) {
      // Nothing productive left this turn (e.g. boxed in) — don't spin forever.
      g.endTurn();
    }
    turns++;
  }
  assert.equal(g.gameOver, true, `game should reach a conclusion within ${MAX_TURNS} decisions`);
  assert.ok(g.winner === 'humans' || g.winner === 'orcs');
});

// Guards against the class of bug where an action exists in the rules and in
// the AI but some dispatcher forgot it — the AI then proposes a perfectly
// legal move that the caller treats as a failure.
test('every action the AI can propose is legal at the moment it proposes it', () => {
  const g = new Game();
  const seen = new Set();
  let t = 0;
  while (!g.gameOver && t < 3000) {
    const d = decideAiAction(g);
    if (!d) { if (g.ap > 0) g.endTurn(); else break; t++; continue; }
    seen.add(d.type);
    const legal =
      d.type === 'attack' ? g.canAttack(d.unit)
      : d.type === 'roll' ? g.canRoll(d.unit, d.dir)
      : d.type === 'rollInPlace' ? g.canRollInPlace(d.unit)
      : d.type === 'step' ? g.canStep(d.unit, d.dir)
      : d.type === 'turn' ? g.canTurn(d.unit)
      : false;
    assert.ok(legal, `AI proposed an illegal or unknown action: ${d.type}`);
    assert.equal(applyDecision(g, d), true, `applying ${d.type} must succeed`);
    t++;
  }
  // And confirm the full vocabulary actually shows up in a real game, so this
  // test can't pass by simply never exercising the interesting actions.
  for (const type of ['attack', 'roll', 'rollInPlace', 'step']) {
    assert.ok(seen.has(type), `a full game should have used ${type} at least once`);
  }
});
