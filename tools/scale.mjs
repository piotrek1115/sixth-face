// Faza 2 — skala. Jaka plansza i ile kości w warbandzie?
//
// Objaw, który to ma naprawić: „ciasna przestrzeń i wojna pozycyjna na
// środku". Zmniejszenie planszy SAMO W SOBIE zagęszcza, więc lekarstwem musi
// być mniej kości, nie mniejsza plansza — a to trzeba zmierzyć, nie założyć.
//
// Uwaga: dopóki nie ma celów (faza 3), jedynym warunkiem zwycięstwa jest
// dowódca, więc każda warbanda musi go zawierać.
import { makeDeployment, makeTerrain, play, avg, pct } from './sim.mjs';

// Kolejność dobierania: dowódca, potem trzon, potem szerokość.
const PICK = {
  humans: ['captain', 'swordsman', 'shieldbearer', 'archer', 'pikeman', 'swordsman', 'shieldbearer', 'archer'],
  orcs: ['warboss', 'orcBoy', 'mauler', 'hurler', 'brute', 'orcBoy', 'mauler', 'hurler'],
};
const rosterOf = (n) => ({ humans: PICK.humans.slice(0, n), orcs: PICK.orcs.slice(0, n) });

const N_MAPS = Number(process.argv[2] ?? 40);
const WITH_TERRAIN = process.argv.includes('--terrain');
const BOARDS = [5, 6, 7, 8];
const BANDS = [3, 4, 5, 6, 8];

console.log(`\n  ekonomia freestep · ${N_MAPS} map na komórkę${WITH_TERRAIN ? ' · z terenem' : ' · goła plansza'}`);
console.log('  „zajętość" = kości / pola.  „dryf" = jaka część kostek w ogóle zmieniła kolumnę.\n');

const rows = [];
for (const boardSize of BOARDS) {
  for (const band of BANDS) {
    if (band * 2 > boardSize * 2) continue; // musi się zmieścić w dwóch rzędach na stronę
    const roster = rosterOf(band);
    const games = [];
    for (let seed = 1; seed <= N_MAPS; seed++) {
      const deployment = makeDeployment(seed, { boardSize, roster });
      const terrain = WITH_TERRAIN ? makeTerrain(seed, { boardSize }) : null;
      games.push(play({ deployment, terrain, boardSize }));
    }
    rows.push({
      boardSize, band,
      occupancy: (band * 2) / (boardSize * boardSize),
      turns: avg(games, 'turns'),
      actionsPerTurn: avg(games, 'actionsPerTurn'),
      drift: avg(games, 'columnDrift'),
      attacks: avg(games, 'attacksPerTurn'),
      casualties: avg(games, 'casualties') / (band * 2),
      exhaustion: pct(games, 'exhaustion'),
      unresolved: pct(games, 'unresolved'),
    });
  }
}

const f = (n, d = 2, w = 6) => n.toFixed(d).padStart(w);
console.log('  plansza  kości  zajętość   tur  akcji/turę   dryf  ataków/turę  strat%  wyczerp.%');
console.log('  ' + '-'.repeat(78));
let lastBoard = null;
for (const r of rows) {
  if (lastBoard !== null && r.boardSize !== lastBoard) console.log();
  lastBoard = r.boardSize;
  console.log(
    `  ${String(r.boardSize + 'x' + r.boardSize).padEnd(8)} ${String(r.band + 'v' + r.band).padEnd(6)}` +
    `${f(r.occupancy, 2)}  ${f(r.turns, 1, 5)}  ${f(r.actionsPerTurn, 1, 9)}  ${f(r.drift, 2)}` +
    `  ${f(r.attacks, 2, 10)}  ${f(100 * r.casualties, 0, 6)}  ${f(r.exhaustion, 0, 9)}`
  );
}
console.log();
