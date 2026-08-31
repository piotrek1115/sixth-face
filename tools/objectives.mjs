// Faza 3 — cele. Czy powód, żeby BYĆ GDZIEŚ, leczy to, na co miał leczyć?
//
// Dwie choroby do wyleczenia, obie zmierzone wcześniej:
//   1. 13% partii kończonych wyczerpaniem — niedobitek ucieka, bo ucieczka
//      nic nie kosztuje, a jedyny cel na planszy to wrogi dowódca.
//   2. dryf zatrzymany na ~0,64 — kostki wciąż idą głównie wzdłuż osi.
import { makeDeployment, makeTerrain, play, avg, pct } from './sim.mjs';

const PICK = {
  humans: ['captain', 'swordsman', 'shieldbearer', 'archer', 'pikeman'],
  orcs: ['warboss', 'orcBoy', 'mauler', 'hurler', 'brute'],
};
const N = Number(process.argv[2] ?? 120);
const BOARD = 6;
const WITH_TERRAIN = process.argv.includes('--terrain');

const rows = {};
for (const scenario of ['leader', 'shrines', 'relic']) {
  const games = [];
  for (let seed = 1; seed <= N; seed++) {
    games.push(play({
      deployment: makeDeployment(seed, { boardSize: BOARD, roster: PICK }),
      terrain: WITH_TERRAIN ? makeTerrain(seed, { boardSize: BOARD }) : null,
      boardSize: BOARD, scenario,
    }));
  }
  rows[scenario] = games;
}

const f = (n, d = 2, w = 7) => n.toFixed(d).padStart(w);
console.log(`\n  6x6 · 5v5 · freestep · ${N} map${WITH_TERRAIN ? ' · z terenem' : ''}\n`);
console.log('  metryka                     leader   shrines     relic');
console.log('  ' + '-'.repeat(54));
for (const [label, key, d] of [
  ['dryf (zmiana kolumny)', 'columnDrift', 2],
  ['długość partii (tury)', 'turns', 1],
  ['akcji / turę', 'actionsPerTurn', 1],
  ['ataków / turę', 'attacksPerTurn', 2],
  ['straty (z 10 kości)', 'casualties', 1],
  ['AP na tipy (udział)', 'apOnTipsShare', 2],
]) {
  console.log(`  ${label.padEnd(24)}${f(avg(rows.leader, key), d)}  ${f(avg(rows.shrines, key), d)}  ${f(avg(rows.relic, key), d)}`);
}
console.log();
console.log('  jak się kończą (%):');
for (const [label, key] of [
  ['  wyczerpanie', 'exhaustion'],
  ['  na punkty', 'byScore'],
  ['  śmierć dowódcy', 'byLeader'],
  ['  wybicie warbandy', 'byWipeout'],
  ['  remis', 'draw'],
  ['  NIEROZSTRZYGNIĘTE', 'unresolved'],
]) {
  console.log(`  ${label.padEnd(24)}${f(pct(rows.leader, key), 0)}  ${f(pct(rows.shrines, key), 0)}  ${f(pct(rows.relic, key), 0)}`);
}
console.log();
