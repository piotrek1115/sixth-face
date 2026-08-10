import { CanvasTexture, SRGBColorSpace } from 'three';

const ATTACK_LABELS = new Set(['Strike', 'Chop', 'Crush', 'Smash', 'Bash', 'Thrust']);
const DEATH_LABELS = new Set(['Wounded']);

/** Optional painted artwork per faction, served from public/. Drop a square
 *  image at this path and every face of that faction's dice uses it as its
 *  background; leave it out and the flat tinted fallback below is used
 *  instead. Loading is async, so faces are drawn immediately with the
 *  fallback and repainted in place once the artwork arrives — the same
 *  CanvasTexture object stays live, so nothing else has to know. */
const FACTION_ART = {
  orcs: '/orc-face.png',
  humans: '/human-face.png',
};

function fallbackColorFor(label, faction) {
  if (DEATH_LABELS.has(label)) return '#20242c';
  if (label === 'Guard') return faction === 'humans' ? '#1e3a6e' : '#6e2f0f';
  if (ATTACK_LABELS.has(label)) return '#7a1f1f';
  return faction === 'humans' ? '#25406b' : '#6b3520';
}

const SIZE = 256;
const cache = new Map();
const painted = []; // every face we've drawn, so art can repaint them later
const artwork = {}; // faction -> HTMLImageElement once loaded

function paintFace(entry) {
  const { ctx, label, faction } = entry;
  const art = artwork[faction];

  if (art) {
    // Cover the face with the artwork, cropping to square if needed.
    const side = Math.min(art.width, art.height);
    const sx = (art.width - side) / 2;
    const sy = (art.height - side) / 2;
    ctx.drawImage(art, sx, sy, side, side, 0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = fallbackColorFor(label, faction);
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, SIZE - 6, SIZE - 6);

  // Name plate. Over painted artwork the label would fight the picture, so
  // it gets a dark band to sit on — the text itself stays white either way.
  const fontSize = label.length > 7 ? 34 : 42;
  ctx.font = `700 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
  const lines = layoutText(ctx, label, SIZE - 40, fontSize + 4);
  const bandHeight = lines.length * (fontSize + 4) + 26;
  // Centred, not tucked against an edge. The face that actually gets read is
  // the TOP one, seen at a steep angle from the tactical camera — a plate on
  // the rim lands where the guard/attack indicator sits and is half hidden.
  const bandY = (SIZE - bandHeight) / 2;

  if (art) {
    // Semi-opaque rather than solid, so the artwork still reads through it —
    // and dark regardless of faction, since the human parchment is far too
    // light for white text to survive on its own.
    ctx.fillStyle = 'rgba(12,10,8,0.66)';
    ctx.fillRect(8, bandY, SIZE - 16, bandHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, bandY, SIZE - 16, bandHeight);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerY = bandY + bandHeight / 2;
  const startY = centerY - ((lines.length - 1) * (fontSize + 4)) / 2;
  lines.forEach((line, i) => {
    const y = startY + i * (fontSize + 4);
    // Outline first so white stays readable over anything underneath.
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(line, SIZE / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, SIZE / 2, y);
  });

  if (DEATH_LABELS.has(label)) {
    ctx.strokeStyle = 'rgba(255,80,80,0.85)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(28, 28);
    ctx.lineTo(SIZE - 28, SIZE - 28);
    ctx.moveTo(SIZE - 28, 28);
    ctx.lineTo(28, SIZE - 28);
    ctx.stroke();
  }
}

function loadFactionArt(faction, url) {
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    artwork[faction] = img;
    // Repaint every already-built face of this faction, in place.
    for (const entry of painted) {
      if (entry.faction !== faction) continue;
      paintFace(entry);
      entry.texture.needsUpdate = true;
    }
  };
  // A missing file is not an error — it just means this faction keeps the
  // flat fallback, so the game still runs before any art is dropped in.
  img.onerror = () => {};
  img.src = url;
}

for (const [faction, url] of Object.entries(FACTION_ART)) loadFactionArt(faction, url);

/** Builds (and caches) a canvas texture for one die face. */
export function labelTexture(label, faction) {
  const key = `${label}|${faction}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  const entry = { canvas, ctx, label, faction, texture };
  painted.push(entry);
  paintFace(entry);
  texture.needsUpdate = true;

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
