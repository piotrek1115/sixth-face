import { CanvasTexture, SRGBColorSpace } from 'three';

const SIZE = 256;

/** Barwa pola pod czarnym stemplem, per frakcja.
 *
 *  Grafika przychodzi jako czarny tusz na bieli. Zamiast żądać od rysownika
 *  osobnego pliku na każdy kolor, przebarwiamy ją przy wczytaniu: biel staje
 *  się kolorem frakcji, czerń zostaje czernią. Dzięki temu ten sam plik
 *  źródłowy może kiedyś obsłużyć kilka frakcji, a zmiana koloru to jedna
 *  liczba tutaj, nie przemalowywanie dwudziestu czterech obrazków. */
const FIELD = { orcs: [0xb0, 0x30, 0x30], humans: [0x2a, 0x44, 0x74] };
const FRAME = Math.round(SIZE * 0.055); // czarna ramka wokół każdej ściany

const cache = new Map();
const painted = []; // każda narysowana ściana, żeby dało się ją przemalować po doczytaniu pliku

/** Malowana grafika PER ŚCIANA.
 *
 *  Kluczem jest ZDOLNOŚĆ, nie kostka: w grze jest 60 ścian, ale tylko 24 różne
 *  (12 na frakcję), bo Guard, Wounded, Advance i Stagger powtarzają się na
 *  wielu kostkach. Malujesz Guard raz i pojawia się na każdej kości tej
 *  frakcji — i tak ma być, bo gracz musi umieć przeczytać planszę z drugiej
 *  strony stołu, a to znaczy, że ta sama zdolność wygląda wszędzie tak samo.
 *
 *  Kolejność szukania, od szczegółu do ogółu — pierwszy trafiony wygrywa:
 *    art/faces/<frakcja>/<kostka>-<ściana>.jpg   ← wyjątek dla jednej kostki
 *    art/faces/<frakcja>/<ściana>.jpg            ← normalny przypadek
 *    (brak)                                      ← białe tło i zwykły napis
 *
 *  Wcześniej tłem była JEDNA grafika na całą frakcję, przez co wszystkie
 *  ściany wyglądały tak samo i nazwę trzeba było dopisywać paskiem na
 *  wierzchu. Namalowana ściana niesie swoją nazwę w samym rysunku, więc pasek
 *  zniknął razem z tamtym mechanizmem.
 *
 *  Ścieżki są względem bazy publikacji, nie roota serwera: build stoi pod
 *  /sixth-face/, gdzie ścieżka z wiodącym ukośnikiem dałaby 404. */
const ART_BASE = import.meta.env.BASE_URL;
const EXTS = ['jpg', 'png']; // eksport z różnych programów wychodzi różnie; 404 nic nie kosztuje

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const faceArtUrls = (label, faction, unitTypeId) => {
  const dir = `${ART_BASE}art/faces/${faction}/`;
  const names = [unitTypeId ? `${unitTypeId}-${slug(label)}` : null, slug(label)].filter(Boolean);
  return names.flatMap((n) => EXTS.map((e) => `${dir}${n}.${e}`));
};

const faceArt = new Map(); // url -> HTMLImageElement (tylko te, które się wczytały)
const tried = new Set();

function repaint(entry) {
  paintFace(entry);
  entry.texture.needsUpdate = true;
}

/** Najlepsza dostępna grafika dla tej ściany, według łańcucha wyżej. */
function artFor(label, faction, unitTypeId) {
  for (const url of faceArtUrls(label, faction, unitTypeId)) {
    const img = faceArt.get(url);
    if (img) return img;
  }
  return null;
}

/** Spróbuj wczytać obrazki tej ściany i przemaluj ją, jeśli któryś dojdzie.
 *  Asynchronicznie i w miejscu: ta sama CanvasTexture zostaje żywa, więc
 *  reszta silnika nie musi o niczym wiedzieć. Brak pliku NIE jest błędem —
 *  ściana zostaje biała z napisem, więc obrazki można dokładać po jednym. */
function loadFaceArt(entry) {
  for (const url of faceArtUrls(entry.label, entry.faction, entry.unitTypeId)) {
    if (faceArt.has(url)) { repaint(entry); return; }
    if (tried.has(url)) continue;
    tried.add(url);
    const img = new Image();
    img.onload = () => {
      faceArt.set(url, img);
      for (const e of painted) {
        if (faceArtUrls(e.label, e.faction, e.unitTypeId).includes(url)) repaint(e);
      }
    };
    img.onerror = () => {};
    img.src = url;
  }
}

/** Przebarwia czarno-biały stempel na czarno-kolorowy, w miejscu na kanwie.
 *
 *  Nie progujemy jasności — mnożymy kolor pola przez jasność piksela, więc
 *  biel wychodzi pełnym kolorem, czerń czernią, a wygładzone brzegi liter
 *  zostają wygładzone. Progowanie dałoby poszarpane kontury przy tym rozmiarze
 *  tekstury (256 px na ścianę, oglądane pod kątem). */
function tintInPlace(ctx, x, y, w, h, [fr, fg, fb]) {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    d[i] = fr * lum;
    d[i + 1] = fg * lum;
    d[i + 2] = fb * lum;
  }
  ctx.putImageData(img, x, y);
}

function paintFace(entry) {
  const { ctx, label, faction, withLabel, unitTypeId } = entry;
  const art = artFor(label, faction, unitTypeId);
  const field = FIELD[faction] ?? FIELD.humans;
  const inner = SIZE - FRAME * 2;

  // Czarna ramka wokół każdej ściany: najpierw czerń na całość, potem rysunek
  // wpuszczony do środka. Ramka oddziela sąsiednie ściany kostki od siebie —
  // bez niej dwa pola tego samego koloru zlewały się na krawędzi.
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (art) {
    // Namalowana ściana niesie SWOJĄ WŁASNĄ nazwę wpisaną w rysunek, więc nie
    // dokładamy do niej niczego — ani paska z tekstem, ani krzyża na Wounded.
    const side = Math.min(art.width, art.height);
    ctx.drawImage(art, (art.width - side) / 2, (art.height - side) / 2, side, side,
                  FRAME, FRAME, inner, inner);
    tintInPlace(ctx, FRAME, FRAME, inner, inner, field);
    return;
  }

  // Ściana jeszcze nienamalowana: samo pole i zwykły napis, bez ozdób — ma się
  // rzucać w oczy, czego brakuje, ale kolorem trzymać się reszty kostki.
  ctx.fillStyle = `rgb(${field[0]},${field[1]},${field[2]})`;
  ctx.fillRect(FRAME, FRAME, inner, inner);

  // Ściana na wierzchu ma tabliczkę unoszącą się nad kostką, więc drugi raz
  // nazwy nie piszemy.
  if (!withLabel) return;

  const fontSize = label.length > 7 ? 38 : 46;
  ctx.font = `700 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  const lines = layoutText(ctx, label, inner - 24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  const startY = SIZE / 2 - ((lines.length - 1) * (fontSize + 6)) / 2;
  lines.forEach((line, i) => ctx.fillText(line, SIZE / 2, startY + i * (fontSize + 6)));
}

/** Builds (and caches) a canvas texture for one die face. Pass
 *  `withLabel: false` for the bare-artwork variant used by whichever face is
 *  currently on top. */
export function labelTexture(label, faction, { withLabel = true, unitTypeId = null } = {}) {
  const key = `${label}|${faction}|${withLabel}|${unitTypeId ?? ''}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const entry = { canvas, ctx, label, faction, texture, withLabel, unitTypeId };
  painted.push(entry);
  paintFace(entry);
  texture.needsUpdate = true;
  loadFaceArt(entry);

  cache.set(key, texture);
  return texture;
}

/** Splits `text` into lines that fit `maxWidth` with the ctx's current font. */
function layoutText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  lines.push(line);
  return lines;
}
