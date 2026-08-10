import './style.css';
import { Raycaster, Vector2 } from 'three';
import { Game } from './core/game.js';
import { createSceneRig } from './render/scene.js';
import { UnitView } from './render/diceMesh.js';
import { gridToWorld, makeHighlight, buildBoard, DIE_HALF } from './render/board.js';
import { RollAnimation, RollInPlaceAnimation, StepAnimation, TurnAnimation, HitAnimation, LungeAnimation } from './render/animator.js';
import { createHud } from './ui/hud.js';
import { DIRECTION_VECTORS } from './core/orientation.js';
import { decideAiAction } from './core/ai.js';

const canvas = document.getElementById('scene');
const { scene, camera, renderer, board: initialBoard } = createSceneRig(canvas);
let board = initialBoard;
let theme = 'dark';

function setTheme(next) {
  theme = next;
  document.documentElement.dataset.theme = theme;
  scene.remove(board);
  board = buildBoard(theme);
  scene.add(board);
  hud.setThemeLabel(theme);
}

let game = new Game();
window.__debug = { scene, camera, renderer, get game() { return game; } };

// --- unit views -------------------------------------------------------
let views = new Map(); // unit.id -> UnitView

/** Build and place the 3D pieces for one unit. Used both at start-up and
 *  when a die is placed by hand during custom setup. */
function addUnitView(unit) {
  const view = new UnitView(unit);
  const { x, z } = gridToWorld(unit.x, unit.z);
  view.dieMesh.position.set(x, DIE_HALF, z);
  view.syncFacing(x, z);
  view.syncRing(x, z);
  scene.add(view.dieMesh, view.facingArrow, view.guardBar, view.attackArrow, view.activeLabel, view.ring);
  views.set(unit.id, view);
  return view;
}

function removeUnitView(unit) {
  const view = views.get(unit.id);
  if (!view) return;
  scene.remove(view.dieMesh, view.facingArrow, view.guardBar, view.attackArrow, view.activeLabel, view.ring);
  view.dispose();
  views.delete(unit.id);
}

function buildAllViews() {
  for (const view of views.values()) {
    scene.remove(view.dieMesh, view.facingArrow, view.guardBar, view.attackArrow, view.activeLabel, view.ring);
    view.dispose();
  }
  views = new Map();
  window.__debug.views = views;
  for (const unit of game.units) addUnitView(unit);
}

buildAllViews();

// --- move-target highlight tiles --------------------------------------
// Dragging a unit on the board always STEPs (cheap, 1 AP, no face change) —
// that's the fast/direct-manipulation gesture. ROLL (2 AP, changes the top
// face) is a more deliberate choice, made via the HUD's Roll buttons.
const STEP_COLOR = 0x5dc9e1;
const highlightPool = [makeHighlight(STEP_COLOR), makeHighlight(STEP_COLOR), makeHighlight(STEP_COLOR), makeHighlight(STEP_COLOR)];
highlightPool.forEach((h) => scene.add(h));
const attackHighlight = makeHighlight(0xff6b6b);
scene.add(attackHighlight);

let selectedUnit = null;
// The deploy palette: which unit type the next board click will place, or
// null when clicks should pick units up instead. Declared here, next to the
// other UI state, so it is initialised before anything can render.
let deployChoice = null;

function refreshHighlights() {
  highlightPool.forEach((h) => (h.visible = false));
  attackHighlight.visible = false;
  if (!selectedUnit || !game.canAct(selectedUnit)) return;
  let i = 0;
  for (const dir of ['N', 'E', 'S', 'W']) {
    if (game.canStep(selectedUnit, dir)) {
      const nx = selectedUnit.x + DIRECTION_VECTORS[dir].x;
      const nz = selectedUnit.z + DIRECTION_VECTORS[dir].z;
      const { x, z } = gridToWorld(nx, nz);
      const h = highlightPool[i++];
      h.position.x = x;
      h.position.z = z;
      h.visible = true;
      h.userData.dir = dir;
      h.material.opacity = 0.35;
    }
  }
  const target = game.findAttackTarget(selectedUnit);
  if (target && game.canAttack(selectedUnit)) {
    const { x, z } = gridToWorld(target.x, target.z);
    attackHighlight.position.x = x;
    attackHighlight.position.z = z;
    attackHighlight.visible = true;
    // Always unmistakably RED against the cyan move tiles — an attack should
    // never be mistaken for a move. Brightness escalates with what it does:
    // disarm, wound, kill.
    const preview = game.previewAttack(selectedUnit);
    const rung = preview?.lethal ? 2 : preview?.wounds ? 1 : 0;
    attackHighlight.material.color.setHex([0xff4d4d, 0xff2020, 0xff0000][rung]);
    attackHighlight.material.opacity = [0.5, 0.7, 0.9][rung];
  }
}

// --- animation queue ----------------------------------------------------
const activeAnimations = new Map(); // unit.id -> animation instance
window.__debug.activeAnimations = activeAnimations;

function animateStep(unit, dir) {
  const view = views.get(unit.id);
  const fromWorld = gridToWorld(unit.x, unit.z);
  const ok = game.step(unit, dir);
  if (!ok) return false;
  const toWorld = gridToWorld(unit.x, unit.z);
  const anim = new StepAnimation(view, fromWorld, toWorld);
  activeAnimations.set(unit.id, { anim });
  return true;
}

function animateRoll(unit, dir) {
  const view = views.get(unit.id);
  const fromWorld = gridToWorld(unit.x, unit.z);
  const fromQuat = view.dieMesh.quaternion.clone();
  const turns = unit.rollTurns(dir); // read BEFORE the rules apply it
  const ok = game.roll(unit, dir);
  if (!ok) return false;
  const toWorld = gridToWorld(unit.x, unit.z);

  // The roll hides the on-die indicator for the whole tumble (see
  // RollAnimation) — reveal it against the FINAL top face once landed.
  const reveal = () => view.syncFacing(toWorld.x, toWorld.z);

  if (turns === 1) {
    activeAnimations.set(unit.id, { anim: new RollAnimation(view, fromWorld, toWorld, dir, fromQuat), onDone: reveal });
    return true;
  }

  // Wound-skip: the die turns twice but still only travels one tile, so the
  // motion can't be a single physical tumble. Tip over the edge onto the new
  // tile first, then keep turning on the spot — chaining the two keeps the
  // drawn cube in step with the logical one, which a single 90° tumble would
  // not (it would land a whole quarter-turn short).
  activeAnimations.set(unit.id, {
    anim: new RollAnimation(view, fromWorld, toWorld, dir, fromQuat),
    onDone: () => {
      const landedQuat = view.dieMesh.quaternion.clone();
      activeAnimations.set(unit.id, {
        anim: new RollInPlaceAnimation(view, toWorld, dir, 1, landedQuat, 0.24),
        onDone: reveal,
      });
    },
  });
  return true;
}

function animateRollInPlace(unit, dir) {
  const view = views.get(unit.id);
  const tileWorld = gridToWorld(unit.x, unit.z);
  const fromQuat = view.dieMesh.quaternion.clone();
  const turns = unit.rollTurns(dir); // read BEFORE the rules change it
  const ok = game.rollInPlace(unit, dir);
  if (!ok) return false;
  const anim = new RollInPlaceAnimation(view, tileWorld, dir, turns, fromQuat);
  activeAnimations.set(unit.id, { anim, onDone: () => view.syncFacing(tileWorld.x, tileWorld.z) });
  return true;
}

function animateTurn(unit, cw) {
  const view = views.get(unit.id);
  const tileWorld = gridToWorld(unit.x, unit.z);
  const fromQuat = view.dieMesh.quaternion.clone();
  const fromFacing = unit.facing;
  const ok = game.turn(unit, cw);
  if (!ok) return false;
  const anim = new TurnAnimation(view, tileWorld, fromQuat, cw, fromFacing);
  activeAnimations.set(unit.id, { anim });
  return true;
}

function animateAttack(unit) {
  const target = game.findAttackTarget(unit);
  if (!target) return false;
  const targetView = views.get(target.id);
  const attackerView = views.get(unit.id);
  const targetFrom = gridToWorld(target.x, target.z);
  const attackerFrom = gridToWorld(unit.x, unit.z);
  const targetQuat = targetView.dieMesh.quaternion.clone();
  const attackDir = unit.facing;
  const preAlive = target.alive;

  const ok = game.attack(unit);
  if (!ok) return false;

  // The attacker either follows the shove into the vacated tile, or jabs and
  // returns. Either way it has to be animated — a follow-up used to move the
  // unit logically while its die stayed put.
  const attackerTo = gridToWorld(unit.x, unit.z);
  const moved = attackerTo.x !== attackerFrom.x || attackerTo.z !== attackerFrom.z;
  activeAnimations.set(unit.id, {
    anim: moved
      ? new StepAnimation(attackerView, attackerFrom, attackerTo)
      : new LungeAnimation(attackerView, attackerFrom, attackDir),
    onDone: () => attackerView.syncFacing(attackerTo.x, attackerTo.z),
  });

  // Replay the exact rotations the rules applied — see HitAnimation.
  const rolls = target.lastHitRolls ?? [];
  if (rolls.length) {
    const targetTo = gridToWorld(target.x, target.z);
    const eliminated = preAlive && !target.alive;
    activeAnimations.set(target.id, {
      anim: new HitAnimation(targetView, targetFrom, targetTo, rolls, targetQuat, attackDir),
      onDone: eliminated
        ? () => fadeOutUnit(target)
        : () => targetView.syncFacing(targetTo.x, targetTo.z),
    });
  }
  return true;
}

/** Make sure every unit on the board has 3D pieces and no stale ones linger.
 *  Views used to be created in exactly one place — the deploy click handler —
 *  so any other route to adding a unit produced an invisible piece. Rebuilding
 *  from the unit list instead of trusting a single call site removes a whole
 *  class of "the rules and the screen disagree" bugs. */
function reconcileViews() {
  for (const unit of game.units) if (!views.has(unit.id)) addUnitView(unit);
  for (const id of [...views.keys()]) {
    const unit = game.units.find((u) => u.id === id);
    if (!unit) {
      const view = views.get(id);
      scene.remove(view.dieMesh, view.facingArrow, view.guardBar, view.attackArrow, view.activeLabel, view.ring);
      view.dispose();
      views.delete(id);
    }
  }
}

/** Safety net for the invariant the brief cares most about: once everything
 *  has settled, every drawn die must sit exactly where its logical die says.
 *  Animations are supposed to leave them equal on their own — this only
 *  catches a code path that forgot to animate, which is precisely the bug
 *  that let attacks silently desync the board (the die kept its old face
 *  forever while the rules had already turned it). Snapping is far better
 *  than leaving the player looking at a lie. */
function resyncViews() {
  for (const unit of game.units) {
    if (!unit.alive) continue;
    const view = views.get(unit.id);
    if (!view) continue;
    const world = gridToWorld(unit.x, unit.z);
    if (view.dieMesh.quaternion.angleTo(unit.orientation.q) > 1e-6) {
      view.dieMesh.quaternion.copy(unit.orientation.q);
    }
    view.dieMesh.position.set(world.x, DIE_HALF, world.z);
    view.syncFacing(world.x, world.z);
    view.syncRing(world.x, world.z);
  }
}

function fadeOutUnit(unit) {
  const view = views.get(unit.id);
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / 500);
    view.dieMesh.scale.setScalar(1 - t);
    view.facingArrow.visible = false;
    view.guardBar.visible = false;
    view.attackArrow.visible = false;
    view.activeLabel.visible = false;
    view.ring.visible = false;
    if (t < 1) requestAnimationFrame(step);
    else {
      scene.remove(view.dieMesh, view.facingArrow, view.guardBar, view.attackArrow, view.activeLabel, view.ring);
    }
  }
  requestAnimationFrame(step);
}

// --- HUD -----------------------------------------------------------------
const hud = createHud(document.getElementById('hud'), {
  onStep: (unit, dir) => {
    if (animateStep(unit, dir)) afterAction();
  },
  onRoll: (unit, dir) => {
    if (animateRoll(unit, dir)) afterAction();
  },
  onRollInPlace: (unit, dir) => {
    if (animateRollInPlace(unit, dir)) afterAction();
  },
  onTurn: (unit, cw) => {
    if (animateTurn(unit, cw)) afterAction();
  },
  onAttack: (unit) => {
    if (animateAttack(unit)) afterAction();
  },
  onEndTurn: () => {
    game.endTurn();
    afterAction();
  },
  onNewStandardGame: () => newGame(),
  onNewCustomGame: () => newGame({ deploy: true }),
  onPickDeployUnit: (unitTypeId, faction) => {
    deployChoice = deployChoice?.unitTypeId === unitTypeId && deployChoice?.faction === faction
      ? null
      : { unitTypeId, faction };
    afterAction();
  },
  onStartBattle: () => {
    if (game.startBattle()) {
      deployChoice = null;
      afterAction();
    }
  },
  onToggleTheme: () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  },
  onToggleAutoPlay: () => {
    autoPlayEnabled = !autoPlayEnabled;
    hud.setAutoPlayLabel(autoPlayEnabled);
    if (autoPlayEnabled) autoPlayStep();
  },
});

function afterAction() {
  reconcileViews();
  if (selectedUnit && (!selectedUnit.alive || selectedUnit.faction !== game.currentFaction)) {
    selectedUnit = null;
  }
  refreshHighlights();
  hud.update(game, selectedUnit, selectedUnit ? views.get(selectedUnit.id) : null, deployChoice);
}

// --- AI / auto-play --------------------------------------------------
// Both sides can be driven by the same simple heuristic (src/core/ai.js).
// It only ever DECIDES — every decision is executed through the exact same
// animate* functions a human's click or HUD button would trigger, so an
// AI-controlled turn is visually and mechanically indistinguishable from a
// human one (same animations, same AP costs, same automatic elimination).
let autoPlayEnabled = false;
const AI_ACTION_DELAY_MS = 550;

function autoPlayStep() {
  if (!autoPlayEnabled) return;
  if (game.gameOver) {
    autoPlayEnabled = false;
    hud.setAutoPlayLabel(false);
    return;
  }
  if (activeAnimations.size > 0) {
    setTimeout(autoPlayStep, 80); // wait for the in-flight animation to settle
    return;
  }

  const decision = decideAiAction(game);
  if (decision) {
    selectedUnit = decision.unit; // so the HUD/debug panel narrate what's happening
    let ok = false;
    // Every action the AI can propose must have a branch here. A missing one
    // reads as "the move failed" and silently switches auto-play off — which
    // is exactly what happened when 'rollInPlace' was added to the AI and the
    // HUD but not to this dispatcher.
    const APPLY = {
      attack: (d) => animateAttack(d.unit),
      roll: (d) => animateRoll(d.unit, d.dir),
      rollInPlace: (d) => animateRollInPlace(d.unit, d.dir),
      step: (d) => animateStep(d.unit, d.dir),
      turn: (d) => animateTurn(d.unit, d.cw),
    };
    const apply = APPLY[decision.type];
    ok = apply ? apply(decision) : false;
    afterAction();
    if (!ok) {
      // Shouldn't happen (the AI only proposes legal moves) — bail out
      // rather than spin forever if it ever does.
      autoPlayEnabled = false;
      hud.setAutoPlayLabel(false);
      return;
    }
  } else if (game.ap > 0) {
    game.endTurn();
    afterAction();
  }

  setTimeout(autoPlayStep, AI_ACTION_DELAY_MS);
}

function newGame(opts) {
  game = new Game(opts);
  selectedUnit = null;
  deployChoice = null;
  activeAnimations.clear();
  buildAllViews();
  afterAction();
}

/** Handle a board click while dice are being placed: an empty tile drops the
 *  chosen die there, an occupied one picks that die back up. */
function handleDeployClick(x, z) {
  const existing = game.units.find((u) => u.x === x && u.z === z);
  if (existing) {
    if (game.undeployUnit(existing)) removeUnitView(existing);
    afterAction();
    return;
  }
  if (!deployChoice) return;
  const unit = game.deployUnit(deployChoice.unitTypeId, deployChoice.faction, x, z);
  if (unit) addUnitView(unit);
  afterAction();
}

// DEBUG-ONLY hook: select a unit by id without needing pixel-perfect raycast
// clicks. Not used by the game itself — safe to leave in for a prototype.
window.__debug.selectUnitById = (id) => {
  selectedUnit = game.units.find((u) => u.id === id) || null;
  afterAction();
};

// --- picking ---------------------------------------------------------
// pointerdown selects (own units only); pointerup commits whatever is under
// the cursor at release time. Because selection already happened on the way
// down, a single press-drag-release gesture from a unit straight onto a
// neighbouring tile resolves as a move — a plain click-without-drag still
// just selects, and clicking a highlighted tile afterwards still moves too.
const raycaster = new Raycaster();
const pointer = new Vector2();

function setPointerFromEvent(ev) {
  pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function pickDieUnit(ev) {
  setPointerFromEvent(ev);
  const dieMeshes = [...views.values()].map((v) => v.dieMesh);
  const hit = raycaster.intersectObjects(dieMeshes, false)[0];
  if (!hit) return null;
  return game.units.find((u) => views.get(u.id).dieMesh === hit.object) || null;
}

// Each visible highlight tile in highlightPool is tagged with the direction
// it represents (see refreshHighlights) so hit-testing never has to
// re-derive it from world positions.
function pickHighlightedTile(ev) {
  if (!selectedUnit) return null;
  setPointerFromEvent(ev);
  const visibleHighlights = highlightPool.filter((h) => h.visible);
  const tileHit = raycaster.intersectObjects(visibleHighlights, false)[0];
  return tileHit ? tileHit.object : null;
}

function pickHighlightedDir(ev) {
  return pickHighlightedTile(ev)?.userData.dir ?? null;
}

function pickAttackHighlight(ev) {
  if (!selectedUnit || !attackHighlight.visible) return false;
  setPointerFromEvent(ev);
  return !!raycaster.intersectObject(attackHighlight, false)[0];
}

let pointerDownPos = null;

canvas.addEventListener('pointerdown', (ev) => {
  pointerDownPos = { x: ev.clientX, y: ev.clientY };
  if (game.phase === 'deploy') return; // placing dice is handled on release
  const unit = pickDieUnit(ev);
  if (unit && unit.alive && unit.faction === game.currentFaction) {
    selectedUnit = unit;
    afterAction();
  }
});

canvas.addEventListener('pointermove', (ev) => {
  // Live hover feedback while dragging: brighten whichever legal-move tile
  // is currently under the cursor so the drag target is obvious.
  const hovered = pickHighlightedTile(ev);
  for (const h of highlightPool) h.material.opacity = h === hovered ? 0.75 : 0.35;
});

// Tile clicks: 1 click = Step (1 AP, cheap), a quick 2nd click on the SAME
// tile = Roll (2 AP, changes the top face) instead — so a single click
// commits immediately (after a short window to catch a following click, like
// any double-click gesture) while a deliberate double-tap upgrades it. A
// real drag (press, move, release elsewhere) always commits a Step right
// away — dragging doesn't feel like a double-click gesture, so it shouldn't
// wait for one. The HUD's Step/Roll buttons remain as the explicit, no-guess
// alternative.
const DOUBLE_CLICK_MS = 300;
const DRAG_THRESHOLD_PX = 6;
let pendingClick = null; // { unit, dir, timer }

function cancelPendingClick() {
  if (pendingClick) {
    clearTimeout(pendingClick.timer);
    pendingClick = null;
  }
}

/** Which board square is under the cursor, by hit-testing the tile quads the
 *  board is built from (they carry their grid coords in userData). */
function pickBoardTile(ev) {
  setPointerFromEvent(ev);
  const hit = raycaster.intersectObjects(board.children, false).find((h) => h.object.userData.tileX !== undefined);
  return hit ? { x: hit.object.userData.tileX, z: hit.object.userData.tileZ } : null;
}

canvas.addEventListener('pointerup', (ev) => {
  if (game.phase === 'deploy') {
    const tile = pickBoardTile(ev);
    if (tile) handleDeployClick(tile.x, tile.z);
    return;
  }
  const dir = pickHighlightedDir(ev);
  if (dir && selectedUnit) {
    const dragDist = pointerDownPos ? Math.hypot(ev.clientX - pointerDownPos.x, ev.clientY - pointerDownPos.y) : 0;

    if (dragDist > DRAG_THRESHOLD_PX) {
      cancelPendingClick();
      if (animateStep(selectedUnit, dir)) afterAction();
      return;
    }

    if (pendingClick && pendingClick.unit === selectedUnit && pendingClick.dir === dir) {
      // Second click on the same tile within the window — upgrade to Roll.
      cancelPendingClick();
      if (animateRoll(selectedUnit, dir)) afterAction();
      return;
    }

    cancelPendingClick();
    const unit = selectedUnit;
    const timer = setTimeout(() => {
      pendingClick = null;
      if (animateStep(unit, dir)) afterAction();
    }, DOUBLE_CLICK_MS);
    pendingClick = { unit, dir, timer };
    return;
  }
  if (pickAttackHighlight(ev)) {
    cancelPendingClick();
    if (animateAttack(selectedUnit)) afterAction();
  }
});

// --- render loop -------------------------------------------------------
// tick() does one frame's worth of work and is deliberately NOT
// self-scheduling — it's driven by two independent sources below, so it
// must never call requestAnimationFrame itself (that would let the chains
// multiply without bound).
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const wasAnimating = activeAnimations.size > 0;
  for (const [unitId, entry] of [...activeAnimations.entries()]) {
    const done = entry.anim.update(dt);
    if (done) {
      activeAnimations.delete(unitId);
      entry.onDone?.();
    }
  }

  // Debug panel + unit panel re-render every frame while something is
  // animating (so the panel always reflects the live mesh transform), AND
  // once more on the exact frame the last animation finishes — otherwise the
  // panel is left showing a mid-animation snapshot forever.
  if (activeAnimations.size > 0 || wasAnimating) {
    hud.update(game, selectedUnit, selectedUnit ? views.get(selectedUnit.id) : null);
  }
  if (wasAnimating && activeAnimations.size === 0) resyncViews();

  renderer.render(scene, camera);
}

function rafLoop(now) {
  tick(now);
  requestAnimationFrame(rafLoop);
}

afterAction();
requestAnimationFrame(rafLoop);

// Fallback driver: some embedded preview contexts report document.hidden
// even while actually on-screen, which makes browsers throttle/suspend
// requestAnimationFrame entirely per the Page Visibility spec — animations
// would start and then simply never finish. A slow interval keeps the same
// tick() progressing (it's driven by real elapsed time, so redundant calls
// from both drivers are harmless) so nothing gets stuck mid-roll, without
// ever spawning extra rAF chains of its own.
setInterval(() => tick(performance.now()), 100);
