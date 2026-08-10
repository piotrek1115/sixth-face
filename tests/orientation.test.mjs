import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CubeOrientation, DIR_ORDER } from '../src/core/orientation.js';
import { Unit } from '../src/core/unit.js';
import { UNIT_TYPES, ATTACK_LABELS, WOUNDED_LABEL, labelForAxisKey } from '../src/core/units.js';

// AT-1: every unit type starts on Guard, physically and logically.
test('AT-1: all unit types spawn showing Guard on top', () => {
  for (const id of Object.keys(UNIT_TYPES)) {
    const u = new Unit(id, UNIT_TYPES[id].faction, 0, 0, 'S');
    assert.equal(u.topLabel, 'Guard', `${id} should start on Guard`);
  }
});

// The wound face sits opposite Guard on purpose — that's the axis combat
// actually happens along, so head-on fighting can hurt. Marching is kept
// safe by the skip rule instead. See the comment block in units.js.
test('every unit type carries exactly one wound face, opposite Guard', () => {
  for (const id of Object.keys(UNIT_TYPES)) {
    const u = new Unit(id, UNIT_TYPES[id].faction, 0, 0, 'S');
    const snap = u.snapshotLabels();
    assert.equal(snap.bottom, WOUNDED_LABEL, `${id}'s wound face should sit opposite Guard`);
    const woundFaces = Object.values(UNIT_TYPES[id].faces).filter((l) => l === WOUNDED_LABEL);
    assert.equal(woundFaces.length, 1, `${id} should have exactly one wound face`);
  }
});

// Advancing straight at the enemy must never wound you (the skip rule) and
// must put an attack up along the way. This is what the whole face layout is
// arranged around.
test('advancing straight at the enemy never self-wounds, and shows an attack', () => {
  const FORWARD_DIR = { humans: 'S', orcs: 'N' };
  for (const id of Object.keys(UNIT_TYPES)) {
    const type = UNIT_TYPES[id];
    const u = new Unit(id, type.faction, 0, 0, 'S');
    const dir = FORWARD_DIR[type.faction];
    let sawAttack = false;
    for (let roll = 1; roll <= 4; roll++) {
      u.applyMove(dir);
      assert.equal(u.isWounded, false, `${id}: roll ${roll} forward must never self-wound`);
      assert.equal(u.alive, true, `${id}: moving must never kill`);
      if (ATTACK_LABELS.has(u.topLabel)) sawAttack = true;
    }
    assert.ok(sawAttack, `${id}: should have an attack available while advancing`);
  }
});

// AT-2: rolling the same direction 4 times returns to the identical orientation.
test('AT-2: 4x roll in one direction returns to identical orientation', () => {
  for (const dir of DIR_ORDER) {
    const o = new CubeOrientation();
    const before = o.snapshot();
    for (let i = 0; i < 4; i++) o.roll(dir);
    const after = o.snapshot();
    assert.deepEqual(after, before, `4x roll ${dir} should be identity`);
  }
});

// AT-3: TURN never changes the top face.
test('AT-3: TURN does not change top face (any number of spins, either direction)', () => {
  const o = new CubeOrientation();
  o.roll('N');
  o.roll('E'); // put it in a non-trivial orientation first
  const topBefore = o.snapshot().top;
  for (let i = 0; i < 7; i++) {
    o.spin(i % 2 === 0);
    assert.equal(o.snapshot().top, topBefore, `spin #${i + 1} must not change top`);
  }
});

// AT-6/7, restated for the two-stage wound system: your own movement can
// never wound or kill you (the skip rule guarantees it), while an enemy's
// hits wound and then finish you.
test('AT-6/7: moving can never wound or kill you; hits do both', () => {
  const a = new Unit('swordsman', 'humans', 0, 0, 'S');
  for (const dir of ['N', 'E', 'S', 'W', 'N', 'E', 'S', 'W']) {
    a.applyMove(dir);
    assert.equal(a.isWounded, false, 'a unit can never move itself onto its wound face');
    assert.equal(a.alive, true, 'moving must never eliminate');
  }

  const b = new Unit('swordsman', 'humans', 0, 0, 'S');
  let died = false;
  let hits = 0;
  while (!died && hits < 6) {
    died = b.applyHit('E');
    hits++;
  }
  // applyHit with no disarm flag is the flank case: the first hit knocks the
  // die clean over onto its wound face, the second finishes it.
  assert.equal(hits, 2, 'a flank sequence should kill in two hits');
  assert.equal(b.alive, false);
  assert.equal(b.eliminatedBy, 'hit');
});

// Regression: frontLabel must track the LIVE orientation, not the spawn-time
// mapping — a unit that has rolled shows a different label on its facing side
// than the one printed there at spawn.
test('frontLabel resolves through the live orientation after a roll, not the static spawn mapping', () => {
  const u = new Unit('swordsman', 'humans', 0, 0, 'S');
  const spawnFront = u.frontLabel; // facing S at spawn → south face → 'Riposte'
  assert.equal(spawnFront, 'Riposte');

  u.applyMove('S'); // physically tips Guard onto the south face
  assert.equal(u.facing, 'S', 'applyMove must not change facing');
  assert.equal(u.topLabel, 'Strike', 'sanity: north face (Strike) should now be on top');
  assert.equal(u.frontLabel, 'Guard', 'south face should now show Guard, not the stale spawn label');
  assert.notEqual(u.frontLabel, spawnFront);
});

// AT-9: after many mixed N/E/S/W rolls, the orientation stays a valid rigid rotation
// (quaternion normalized, and every local axis still maps to a DISTINCT world axis —
// i.e. the mapping stays a bijection, never collapses).
test('AT-9: orientation stays mathematically valid after many mixed rolls', () => {
  const o = new CubeOrientation();
  const dirs = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 137; i++) {
    o.roll(dirs[i % dirs.length]);
    if (i % 5 === 0) o.spin(i % 2 === 0);
  }
  assert.ok(Math.abs(o.q.length() - 1) < 1e-9, 'quaternion must stay unit-length');
  const snap = o.snapshot();
  const labels = Object.values(snap);
  assert.equal(new Set(labels).size, 6, 'all 6 local axes must still map to distinct world roles');
});
