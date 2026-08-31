// Head-to-head: dwa profile AI grają przeciw sobie na tych samych mapach.
//
// Po co: „mądrzejsze AI" to twierdzenie, które trzeba wygrać na planszy, a nie
// uzasadnić opisem heurystyki. Mam już jeden zmierzony przypadek, w którym
// mapa zagrożeń POGORSZYŁA grę — więc tym razem mierzę wprost siłę.
//
// Każdą mapę gramy DWA RAZY, zamieniając strony, bo ludzie zaczynają i to
// samo w sobie jest przewagą. Wynik liczy się profilom, nie frakcjom.
import { Game } from '../src/core/game.js';
import { decideAiAction, AI_PROFILES } from '../src/core/ai.js';
import { makeDeployment } from './sim.mjs';

const PICK = {
  humans: ['captain', 'swordsman', 'shieldbearer', 'archer', 'pikeman'],
  orcs: ['warboss', 'orcBoy', 'mauler', 'hurler', 'brute'],
};

function playDuel(deployment, profileFor, { boardSize = 6, scenario = 'shrines' } = {}) {
  const g = new Game({ deploy: true, economy: 'freestep', boardSize, scenario });
  for (const [id, faction, x, z] of deployment) g.deployUnit(id, faction, x, z);
  g.startBattle();
  const APPLY = {
    attack: (d) => g.attack(d.unit), roll: (d) => g.roll(d.unit, d.dir),
    rollInPlace: (d) => g.rollInPlace(d.unit, d.dir), step: (d) => g.step(d.unit, d.dir),
    turn: (d) => g.turn(d.unit, d.cw),
  };
  let guard = 0;
  while (!g.gameOver && g.turnNumber < 400 && guard++ < 40000) {
    const d = decideAiAction(g, profileFor[g.currentFaction]);
    if (!d || !APPLY[d.type](d)) { g.endTurn(); continue; }
  }
  return g;
}

const N = Number(process.argv[2] ?? 150);
const [A, B] = [process.argv[3] ?? 'careful', process.argv[4] ?? 'plain'];
let winA = 0, winB = 0, draws = 0;

for (let seed = 1; seed <= N; seed++) {
  const deployment = makeDeployment(seed, { boardSize: 6, roster: PICK });
  // A gra ludźmi, potem to samo rozstawienie z zamienionymi stronami
  for (const flip of [false, true]) {
    const profileFor = flip
      ? { humans: AI_PROFILES[B], orcs: AI_PROFILES[A] }
      : { humans: AI_PROFILES[A], orcs: AI_PROFILES[B] };
    const g = playDuel(deployment, profileFor);
    const aSide = flip ? 'orcs' : 'humans';
    if (!g.winner) draws++;
    else if (g.winner === aSide) winA++;
    else winB++;
  }
}

const games = N * 2;
const rate = (100 * winA) / games;
console.log(`\n  ${A}  vs  ${B}   —   ${games} partii (${N} map × 2 strony)\n`);
console.log(`  ${A.padEnd(9)} wygrywa  ${String(winA).padStart(3)}  (${rate.toFixed(1)}%)`);
console.log(`  ${B.padEnd(9)} wygrywa  ${String(winB).padStart(3)}  (${((100 * winB) / games).toFixed(1)}%)`);
console.log(`  remisy              ${String(draws).padStart(3)}\n`);
