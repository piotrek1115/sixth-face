// Generator szablonów UV do malowania ścian kostek.
//
// Mapowanie tekstury na ściany zmierzone wprost z UV geometrii (nie zgadnięte):
//   ściany boczne (N/S/E/W) — góra obrazka = góra kostki
//   TOP                     — góra obrazka = północ planszy, prawo = wschód
//   BOTTOM                  — góra obrazka = południe, prawo = wschód
// Wniosek praktyczny: KAŻDY kwadrat malujesz normalnie, pionowo. Nic nie
// trzeba obracać ani lustrzać.
//
// Kluczem grafiki jest ZDOLNOŚĆ, nie kostka: 60 ścian w grze, ale tylko 24
// różne obrazki (12 na frakcję), bo Guard, Wounded, Loose, Bash, Sweep
// i Stagger powtarzają się na wielu kostkach.
import { writeFileSync, mkdirSync } from 'node:fs';
import { UNIT_TYPES } from '../src/core/units.js';
import { Game } from '../src/core/game.js';

const OUT = new URL('../art/uv/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const CELL = 512;
const HEAD = 300;
const slug = (l) => l.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Rozłożenie sześcianu: przód to POŁUDNIE, nad nim GÓRA, pod nim SPÓD,
// a PÓŁNOC (naprzeciw południa) domyka krzyż od dołu.
const NET = [
  { axis: 'top', col: 1, row: 0, up: 'góra obrazka = PÓŁNOC planszy' },
  { axis: 'west', col: 0, row: 1, up: 'góra obrazka = góra kostki' },
  { axis: 'south', col: 1, row: 1, up: 'góra obrazka = góra kostki' },
  { axis: 'east', col: 2, row: 1, up: 'góra obrazka = góra kostki' },
  { axis: 'bottom', col: 1, row: 2, up: 'góra obrazka = POŁUDNIE planszy' },
  { axis: 'north', col: 1, row: 3, up: 'góra obrazka = góra kostki' },
];
const PL = { top: 'GÓRA', bottom: 'SPÓD', north: 'PÓŁNOC', south: 'POŁUDNIE', east: 'WSCHÓD', west: 'ZACHÓD' };

/** Co wypada na wierzchu po przechyle w danym kierunku — z silnika, nie z głowy. */
function tipTable(unitTypeId) {
  return ['N', 'E', 'S', 'W'].map((dir) => {
    const g = new Game();
    const u = g.units.find((x) => x.unitTypeId === unitTypeId);
    u.applyRollInPlace(dir);
    return [dir, u.topLabel];
  });
}

function netSvg(type) {
  const f = type.faces;
  const W = CELL * 3;
  const H = HEAD + CELL * 4;
  const weight = type.rollCost ?? 2;
  const tips = tipTable(type.id).map(([d, l]) => `${d}→${l}`).join('   ');

  const cells = NET.map(({ axis, col, row, up }) => {
    const x = col * CELL;
    const y = HEAD + row * CELL;
    const label = f[axis];
    const file = `art/faces/${type.faction}/${slug(label)}.jpg`;
    return `
  <g>
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#ffffff" stroke="#111" stroke-width="4"/>
    <rect x="${x + 24}" y="${y + 24}" width="${CELL - 48}" height="${CELL - 48}" fill="none"
          stroke="#c9ccd4" stroke-width="2" stroke-dasharray="10 10"/>
    <text x="${x + 28}" y="${y + 62}" font-family="Helvetica" font-size="30" font-weight="bold" fill="#111">${PL[axis]}</text>
    <text x="${x + CELL / 2}" y="${y + CELL / 2 + 6}" font-family="Georgia" font-size="62"
          fill="#111" text-anchor="middle">${esc(label)}</text>
    <path d="M${x + CELL / 2} ${y + CELL / 2 + 148} L${x + CELL / 2} ${y + CELL / 2 + 52}
             M${x + CELL / 2 - 22} ${y + CELL / 2 + 82} L${x + CELL / 2} ${y + CELL / 2 + 52}
             L${x + CELL / 2 + 22} ${y + CELL / 2 + 82}"
          stroke="#9aa0aa" stroke-width="5" fill="none" stroke-linecap="round"/>
    <text x="${x + CELL / 2}" y="${y + CELL - 78}" font-family="Helvetica" font-size="21"
          fill="#6b7280" text-anchor="middle">${esc(up)}</text>
    <text x="${x + CELL / 2}" y="${y + CELL - 42}" font-family="Consolas,monospace" font-size="19"
          fill="#8a5f10" text-anchor="middle">${esc(file)}</text>
  </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f6f5f2"/>
  <text x="40" y="76" font-family="Helvetica" font-size="54" font-weight="bold" fill="#111">${esc(type.name)}</text>
  <text x="40" y="122" font-family="Helvetica" font-size="26" fill="#6b7280">${esc(type.faction)} · ${
    weight === 1 ? 'lekka' : weight === 3 ? 'ciężka' : 'standard'
  } (tip za ${weight} AP)${type.reach > 1 ? ` · zasięg ${type.reach}` : ''}${type.isLeader ? ' · DOWÓDCA' : ''}</text>
  <text x="40" y="176" font-family="Consolas,monospace" font-size="25" fill="#111">przechył: ${esc(tips)}</text>
  <text x="40" y="228" font-family="Helvetica" font-size="23" fill="#6b7280">Maluj każdy kwadrat PIONOWO — nic nie obracaj. Strzałka pokazuje górę obrazka.</text>
  <text x="40" y="264" font-family="Helvetica" font-size="23" fill="#8a5f10">Ta sama zdolność na innej kostce = ten sam plik. Malujesz 12 obrazków na frakcję, nie 60.</text>
  ${cells}
</svg>`;
}

function paintListSvg(faction) {
  const labels = [...new Set(
    Object.values(UNIT_TYPES).filter((t) => t.faction === faction).flatMap((t) => Object.values(t.faces))
  )].sort();
  const COLS = 4;
  const rows = Math.ceil(labels.length / COLS);
  const W = CELL * COLS, H = 180 + CELL * rows;
  const cells = labels.map((label, i) => {
    const x = (i % COLS) * CELL;
    const y = 180 + Math.floor(i / COLS) * CELL;
    const users = Object.values(UNIT_TYPES)
      .filter((t) => t.faction === faction && Object.values(t.faces).includes(label))
      .map((t) => t.name);
    return `
  <g>
    <rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="#fff" stroke="#111" stroke-width="4"/>
    <text x="${x + CELL / 2}" y="${y + CELL / 2 - 10}" font-family="Georgia" font-size="60" fill="#111" text-anchor="middle">${esc(label)}</text>
    <text x="${x + CELL / 2}" y="${y + CELL / 2 + 46}" font-family="Helvetica" font-size="22" fill="#6b7280" text-anchor="middle">na ${users.length} ${users.length === 1 ? 'kostce' : 'kostkach'}</text>
    <text x="${x + CELL / 2}" y="${y + CELL - 40}" font-family="Consolas,monospace" font-size="20" fill="#8a5f10" text-anchor="middle">${slug(label)}.jpg</text>
  </g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#f6f5f2"/>
  <text x="40" y="76" font-family="Helvetica" font-size="52" font-weight="bold" fill="#111">Lista do namalowania — ${esc(faction)}</text>
  <text x="40" y="126" font-family="Helvetica" font-size="26" fill="#6b7280">${labels.length} obrazków. Wrzuć jako public/art/faces/${esc(faction)}/&lt;nazwa&gt;.jpg — kwadratowe, 512×512 lub więcej.</text>
  ${cells}
</svg>`;
}

for (const type of Object.values(UNIT_TYPES)) {
  writeFileSync(`${OUT}${type.id}.svg`, netSvg(type));
}
for (const faction of ['humans', 'orcs']) {
  writeFileSync(`${OUT}_paintlist-${faction}.svg`, paintListSvg(faction));
}
console.log(`${Object.keys(UNIT_TYPES).length} siatek + 2 listy → art/uv/`);
