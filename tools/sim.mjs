// Wspólny przyrząd pomiarowy. Każda faza przebudowy mierzy co innego, ale
// wszystkie potrzebują tego samego: rozegrać partię AI vs AI na zadanym
// rozstawieniu i policzyć, co się w niej działo.
//
// Gra jest DETERMINISTYCZNA — ta sama plansza i to samo rozstawienie zawsze
// dają tę samą partię. Powtarzanie nic nie daje; zmienność bierze się
// wyłącznie z rozstawienia i terenu. Dlatego wszędzie porównujemy warianty na
// tym samym zestawie map (próbki sparowane), a nie warianty na losowych.
import { Game } from '../src/core/game.js';
import { decideAiAction } from '../src/core/ai.js';
import { TERRAIN } from '../src/core/board.js';

export const MAX_TURNS = 400;

export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Rozstawienie jako dane, żeby ten sam układ dało się rozegrać w kilku
 *  wariantach zasad i porównać jabłka z jabłkami. */
export function makeDeployment(seed, { boardSize, roster }) {
  const rnd = mulberry32(seed);
  const zones = { humans: [0, 1], orcs: [boardSize - 1, boardSize - 2] };
  const out = [];
  for (const faction of ['humans', 'orcs']) {
    const tiles = [];
    for (const z of zones[faction]) for (let x = 0; x < boardSize; x++) tiles.push([x, z]);
    const picked = shuffled(tiles, rnd).slice(0, roster[faction].length);
    roster[faction].forEach((id, i) => out.push([id, faction, picked[i][0], picked[i][1]]));
  }
  return out;
}

/** Teren rozsypany symetrycznie względem środka planszy: obie strony dostają
 *  ten sam problem, więc różnica w wyniku nie jest różnicą map. */
export function makeTerrain(seed, { boardSize, density = 0.12 }) {
  const rnd = mulberry32(seed * 7919 + 13);
  const terrain = new Map();
  const mid = Math.floor(boardSize / 2);
  for (let x = 0; x < boardSize; x++) {
    for (let z = 2; z <= mid; z++) {
      if (rnd() > density) continue;
      const kind = rnd() < 0.55 ? TERRAIN.WALL : TERRAIN.MUD;
      terrain.set(`${x},${z}`, kind);
      terrain.set(`${boardSize - 1 - x},${boardSize - 1 - z}`, kind); // lustro
    }
  }
  return terrain;
}

/** Rozegraj jedną partię i zwróć, co się w niej działo. */
export function play({ deployment, terrain = null, boardSize, economy = 'freestep', apPerTurn, stallLimit, scenario, scoreTarget }) {
  const opts = { deploy: true, economy, boardSize };
  if (scenario) opts.scenario = scenario;
  if (scoreTarget != null) opts.scoreTarget = scoreTarget;
  if (apPerTurn != null) opts.apPerTurn = apPerTurn;
  if (stallLimit != null) opts.stallLimit = stallLimit;
  const g = new Game(opts);
  if (terrain) for (const [k, v] of terrain) g.terrain.set(k, v);
  for (const [id, faction, x, z] of deployment) g.deployUnit(id, faction, x, z);
  g.startBattle();

  const startX = new Map(g.units.map((u) => [u.id, u.x]));
  const m = { steps: 0, turns: 0, tips: 0, attacks: 0, actions: 0, actors: new Set(),
              apOnTips: 0, apSpent: 0, apOffered: 0, movedColumn: new Set() };
  const APPLY = {
    attack: (d) => g.attack(d.unit),
    roll: (d) => g.roll(d.unit, d.dir),
    rollInPlace: (d) => g.rollInPlace(d.unit, d.dir),
    step: (d) => g.step(d.unit, d.dir),
    turn: (d) => g.turn(d.unit, d.cw),
  };

  let seenTurn = -1, guard = 0;
  while (!g.gameOver && g.turnNumber < MAX_TURNS && guard++ < 40000) {
    if (g.turnNumber !== seenTurn) { seenTurn = g.turnNumber; m.apOffered += g.ap; }
    const d = decideAiAction(g);
    if (!d) { g.endTurn(); continue; }
    // Koszt liczony PRZED akcją, z funkcji kosztu samej gry: różnicowanie
    // g.ap dawało zera, bo akcja zerująca pulę od razu kończy turę, a endTurn
    // odbudowuje AP — czyli najdroższe akcje wychodziły na darmowe.
    const free = g.economy === 'freestep';
    const cost = d.type === 'roll' || d.type === 'rollInPlace' ? g._rollCost(d.unit)
               : d.type === 'attack' ? 1
               : free ? 0 : 1;
    if (!APPLY[d.type](d)) { g.endTurn(); continue; }
    m.actions++;
    m.apSpent += cost;
    if (d.type === 'roll' || d.type === 'rollInPlace') { m.tips++; m.apOnTips += cost; }
    else if (d.type === 'step') m.steps++;
    else if (d.type === 'turn') m.turns++;
    else if (d.type === 'attack') m.attacks++;
    m.actors.add(d.unit.id);
    if (d.unit.x !== startX.get(d.unit.id)) m.movedColumn.add(d.unit.id);
  }

  const dice = deployment.length;
  return {
    turns: g.turnNumber,
    winner: g.winner,
    humansWin: g.winner === 'humans',
    orcsWin: g.winner === 'orcs',
    endReason: g.endReason,
    exhaustion: g.endReason === 'exhaustion',
    byScore: g.endReason === 'score',
    byLeader: g.endReason === 'leader',
    byWipeout: g.endReason === 'wipeout',
    draw: g.gameOver && g.winner === null,
    unresolved: !g.gameOver,
    casualties: dice - g.aliveUnits().length,
    participation: m.actors.size / dice,
    // Ile kostek w ogóle zmieniło kolumnę. Pierwotny objaw „gry lustrzanej":
    // obie armie maszerowały prosto na siebie i połowa nigdy nie zeszła z osi.
    columnDrift: m.movedColumn.size / dice,
    actionsPerTurn: m.actions / g.turnNumber,
    stepsPerTurn: m.steps / g.turnNumber,
    tipsPerTurn: m.tips / g.turnNumber,
    attacksPerTurn: m.attacks / g.turnNumber,
    apOnTipsShare: m.apSpent > 0 ? m.apOnTips / m.apSpent : 0,
    apUtilisation: m.apOffered > 0 ? m.apSpent / m.apOffered : 0,
  };
}

export const avg = (xs, k) => xs.reduce((s, r) => s + r[k], 0) / xs.length;
export const pct = (xs, k) => (100 * xs.filter((r) => r[k]).length) / xs.length;
