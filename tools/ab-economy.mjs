// Faza 1 — kamień węgielny. Czy „darmowy Krok" da się utrzymać?
//
// A/B na NIEZMIENIONYM rosterze 8v8 i planszy 7x7: ta sama plansza, te same
// kostki, jedyna różnica to ekonomia akcji. Gra jest deterministyczna, więc
// powtarzanie tej samej partii nic nie daje — zmienność bierze się wyłącznie
// z rozstawienia. Każde rozstawienie gramy w OBU ekonomiach, czyli próbki są
// sparowane i różnica jest przypisywalna zmianie, a nie mapie.
import { Game } from '../src/core/game.js';
import { decideAiAction } from '../src/core/ai.js';
import { BOARD_SIZE } from '../src/core/board.js';

const ROSTER = {
  humans: ['swordsman', 'shieldbearer', 'pikeman', 'shieldbearer', 'swordsman', 'archer', 'captain', 'archer'],
  orcs: ['orcBoy', 'mauler', 'brute', 'mauler', 'orcBoy', 'hurler', 'warboss', 'hurler'],
};
const ZONES = { humans: [0, 1], orcs: [BOARD_SIZE - 1, BOARD_SIZE - 2] };
const MAX_TURNS = 400;

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function shuffled(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One deployment, described as data so both economies get the identical board. */
function makeDeployment(seed) {
  const rnd = mulberry32(seed);
  const out = [];
  for (const faction of ['humans', 'orcs']) {
    const tiles = [];
    for (const z of ZONES[faction]) for (let x = 0; x < BOARD_SIZE; x++) tiles.push([x, z]);
    const picked = shuffled(tiles, rnd).slice(0, ROSTER[faction].length);
    ROSTER[faction].forEach((id, i) => out.push([id, faction, picked[i][0], picked[i][1]]));
  }
  return out;
}

function play(deployment, economy) {
  const g = new Game({ deploy: true, economy });
  for (const [id, faction, x, z] of deployment) g.deployUnit(id, faction, x, z);
  g.startBattle();

  const m = { steps: 0, turns: 0, tips: 0, attacks: 0, actors: new Set(), passes: 0,
              apOnTips: 0, apOnRest: 0, apOffered: 0, apSpent: 0 };
  // AP oferowane w turze liczymy raz na turę, nie raz na akcję.
  let seenTurn = -1;
  const APPLY = {
    attack: (d) => g.attack(d.unit),
    roll: (d) => g.roll(d.unit, d.dir),
    rollInPlace: (d) => g.rollInPlace(d.unit, d.dir),
    step: (d) => g.step(d.unit, d.dir),
    turn: (d) => g.turn(d.unit, d.cw),
  };

  let guard = 0;
  while (!g.gameOver && g.turnNumber < MAX_TURNS && guard++ < 20000) {
    if (g.turnNumber !== seenTurn) { seenTurn = g.turnNumber; m.apOffered += g.ap; }
    const d = decideAiAction(g);
    if (!d) { m.passes++; g.endTurn(); continue; }
    // Koszt liczymy PRZED akcją, z funkcji kosztu samej gry. Różnicowanie
    // g.ap dawało zera: akcja, która zeruje pulę, od razu kończy turę, a
    // endTurn odbudowuje AP — więc najdroższe akcje wyglądały na darmowe.
    const free = g.economy === 'freestep';
    const cost =
      d.type === 'roll' || d.type === 'rollInPlace' ? g._rollCost(d.unit)
      : d.type === 'attack' ? 1
      : free ? 0 : 1; // step / turn
    if (!APPLY[d.type](d)) { m.passes++; g.endTurn(); continue; } // illegal proposal: don't spin
    m.apSpent += cost;
    if (d.type === 'roll' || d.type === 'rollInPlace') m.apOnTips += cost;
    else m.apOnRest += cost;
    m.actors.add(d.unit.id);
    if (d.type === 'step') m.steps++;
    else if (d.type === 'turn') m.turns++;
    else if (d.type === 'roll' || d.type === 'rollInPlace') m.tips++;
    else if (d.type === 'attack') m.attacks++;
  }

  const dice = ROSTER.humans.length + ROSTER.orcs.length;
  return {
    turns: g.turnNumber,
    exhaustion: g.endReason === 'exhaustion',
    unresolved: !g.gameOver,
    casualties: dice - g.aliveUnits().length,
    participation: m.actors.size / dice,
    stepsPerTurn: m.steps / g.turnNumber,
    tipsPerTurn: m.tips / g.turnNumber,
    attacksPerTurn: m.attacks / g.turnNumber,
    // Ile ruchów kosztowało AP (przezbrojenie) w stosunku do wszystkich ruchów.
    // To jest sprawdzian rdzenia: jeśli spada do zera, ściany przestały mieć
    // znaczenie i została sama plansza.
    paidMoveShare: m.tips + m.steps > 0 ? m.tips / (m.tips + m.steps) : 0,
    // Prawdziwy sprawdzian rdzenia: ile ze wspolnej puli idzie na zmiane
    // sciany. Udzial tipow w RUCHACH myli, bo darmowe kroki dokladaja sie do
    // mianownika, nie odbierajac nic tipom.
    apOnTipsShare: m.apSpent > 0 ? m.apOnTips / m.apSpent : 0,
    apUtilisation: m.apOffered > 0 ? m.apSpent / m.apOffered : 0,
  };
}

const N = Number(process.argv[2] ?? 60);
const rows = { pool: [], freestep: [] };
for (let seed = 1; seed <= N; seed++) {
  const dep = makeDeployment(seed);
  for (const eco of ['pool', 'freestep']) rows[eco].push(play(dep, eco));
}

const avg = (xs, k) => xs.reduce((s, r) => s + r[k], 0) / xs.length;
const pct = (xs, k) => (100 * xs.filter((r) => r[k]).length) / xs.length;
const f = (n, d = 2) => n.toFixed(d).padStart(7);

console.log(`\n  ${N} rozstawień, każde zagrane w obu ekonomiach (pary)\n`);
console.log('  metryka                       pool   freestep');
console.log('  ' + '-'.repeat(44));
const METRICS = [
  ['udział kości w partii', 'participation', 2],
  ['kroki / turę', 'stepsPerTurn', 2],
  ['tipy / turę', 'tipsPerTurn', 2],
  ['ataki / turę', 'attacksPerTurn', 2],
  ['udział tipów w ruchach', 'paidMoveShare', 2],
  ['AP wydane na tipy (udział)', 'apOnTipsShare', 2],
  ['wykorzystanie puli AP', 'apUtilisation', 2],
  ['długość partii (tury)', 'turns', 1],
  ['straty (z 16 kości)', 'casualties', 1],
];
for (const [label, key, d] of METRICS) {
  console.log(`  ${label.padEnd(26)}${f(avg(rows.pool, key), d)}   ${f(avg(rows.freestep, key), d)}`);
}
console.log(`  ${'% partii z wyczerpania'.padEnd(26)}${f(pct(rows.pool, 'exhaustion'), 1)}   ${f(pct(rows.freestep, 'exhaustion'), 1)}`);
console.log(`  ${'% partii nierozstrzygniętych'.padEnd(26)}${f(pct(rows.pool, 'unresolved'), 1)}   ${f(pct(rows.freestep, 'unresolved'), 1)}`);

// Wyczerpanie skoczylo — sprawdzamy, czy to partie BEZ walki, czy juz
// rozstrzygniete rzezie, w ktorych niedobitek ucieka do konca licznika.
console.log('\n  partie kończone wyczerpaniem — co się w nich działo:');
for (const eco of ['pool', 'freestep']) {
  const ex = rows[eco].filter((r) => r.exhaustion);
  if (!ex.length) { console.log(`  ${eco.padEnd(10)} brak`); continue; }
  console.log(
    `  ${eco.padEnd(10)} n=${String(ex.length).padStart(2)}` +
    `  strat średnio ${avg(ex, 'casualties').toFixed(1)}/16` +
    `  ataków/turę ${avg(ex, 'attacksPerTurn').toFixed(2)}` +
    `  tur ${avg(ex, 'turns').toFixed(1)}`
  );
}
console.log();
