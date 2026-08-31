// Przenosi grafiki ze źródeł (art/source/<frakcja>/) tam, skąd czyta je gra
// (public/art/faces/<frakcja>/<zdolność>.jpg) i mówi, czego jeszcze brakuje.
//
// Po co skrypt zamiast `cp`: pliki od rysownika przychodzą z nazwami w rodzaju
// `Orc_Guard.jpg`, czasem bez rozszerzenia, czasem jako PSD — a gra potrzebuje
// dokładnie `guard.jpg`. Ręczne przepisywanie tego dziesięć razy to dziesięć
// okazji do literówki, która objawia się jako biała ściana bez żadnego błędu.
import { readdirSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { UNIT_TYPES } from '../src/core/units.js';

const faction = process.argv[2];
if (!faction) {
  console.error('użycie: node tools/install-art.mjs <humans|orcs>');
  process.exit(1);
}

const root = new URL('../', import.meta.url).pathname;
const srcDir = `${root}art/source/${faction}/`;
const dstDir = `${root}public/art/faces/${faction}/`;
mkdirSync(dstDir, { recursive: true });

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const wanted = new Set(
  Object.values(UNIT_TYPES).filter((t) => t.faction === faction).flatMap((t) => Object.values(t.faces))
);
const wantedBySlug = new Map([...wanted].map((l) => [slug(l), l]));

/** Nazwa ściany z nazwy pliku: `Orc_Guard.jpg`, `guard`, `ORC guard.JPG` → `guard`. */
function faceFromFilename(name) {
  const base = name.replace(/\.(jpe?g|png|psd)$/i, '');
  const key = slug(base.replace(new RegExp(`^${faction.replace(/s$/, '')}[_\\- ]*`, 'i'), ''));
  return wantedBySlug.has(key) ? key : null;
}

/** PSD-a przeglądarka nie otworzy — konwersja przez sips (macOS, w systemie). */
const isPsd = (path) => readFileSync(path, { length: 4 }).toString('latin1') === '8BPS';

const installed = [];
for (const name of readdirSync(srcDir)) {
  const face = faceFromFilename(name);
  if (!face) continue; // np. BASE — pusty stempel, nie jest ścianą
  const from = srcDir + name;
  const to = `${dstDir}${face}.jpg`;
  if (isPsd(from)) execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '92', from, '--out', to], { stdio: 'ignore' });
  else copyFileSync(from, to);
  installed.push(face);
}

const missing = [...wantedBySlug.keys()].filter((s) => !installed.includes(s)).sort();
console.log(`${faction}: wgrane ${installed.length}/${wantedBySlug.size} — ${installed.sort().join(', ')}`);
if (missing.length) console.log(`brakuje ${missing.length}: ${missing.join(', ')}  (zostaną białe z napisem)`);
