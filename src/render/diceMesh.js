import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  PlaneGeometry,
  CanvasTexture,
  SRGBColorSpace,
  ConeGeometry,
  RingGeometry,
  Group,
} from 'three';
import { labelTexture } from './labels.js';
import { DIRECTION_VECTORS } from '../core/orientation.js';
import { ATTACK_LABELS } from '../core/units.js';
import { DIE_HALF } from './board.js';

// Visual size only — a touch smaller than a tile so grid lines stay legible.
// Position/rotation math never uses this; it uses board.DIE_HALF (see there
// for why the two must be kept separate).
export const CUBE_SIZE = 1.44;

const FACTION_COLOR = { humans: 0x4d8cff, orcs: 0xff7a33 };

// Sits just above the die's visual top surface — a legible height for both
// the tactical camera and the facing/ability indicators below. Exported so
// the animator can interpolate the on-die indicators at the same height.
export const TOP_Y = DIE_HALF * 2 + 0.03;

/** Which facing indicator a top face calls for: a defensive wall (Guard),
 *  an attack arrow, or nothing for every other (flavour) state. */
function indicatorKindFor(topLabel) {
  if (topLabel === 'Guard') return 'guard';
  if (ATTACK_LABELS.has(topLabel)) return 'attack';
  return 'none';
}

/** BoxGeometry material slot order: [+X, -X, +Y, -Y, +Z, -Z]. */
function buildMaterials(unit) {
  const f = unit.type.faces;
  const order = [
    ['east', f.east],
    ['west', f.west],
    ['top', f.top],
    ['bottom', f.bottom],
    ['south', f.south],
    ['north', f.north],
  ];
  return order.map(
    ([, label]) =>
      new MeshStandardMaterial({ map: labelTexture(label, unit.faction), roughness: 0.6, metalness: 0.05 })
  );
}

/** A flat, always-upright plate carrying canvas text. Every hint in the game
 *  is one of these, so they all look and behave the same whether they belong
 *  to a die or to the board. */
export function makePlate(w, h, renderOrder = 12) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = Math.round((256 * h) / w);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshBasicMaterial({ map: texture, transparent: true, depthTest: false })
  );
  mesh.rotation.x = -Math.PI / 2; // lies flat; y-rotation stays 0 so it never turns
  mesh.renderOrder = renderOrder;
  mesh.userData.canvas = canvas;
  mesh.userData.texture = texture;
  return mesh;
}

export function drawPlate(
  mesh,
  text,
  { size = 40, bg = 'rgba(10,9,8,0.82)', fg = '#ffffff', border = 'rgba(255,255,255,0.3)' } = {}
) {
  const canvas = mesh.userData.canvas;
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.font = `700 ${size}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, w / 2, h / 2);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2);
  mesh.userData.texture.needsUpdate = true;
}

/** The rotation glyph for the corner turn handles: an open arc with an
 *  arrowhead, drawn rather than typed. A '⟳' character would be at the mercy
 *  of whatever font the machine happens to have. */
export function drawTurnGlyph(mesh, clockwise, { hot = false } = {}) {
  const canvas = mesh.userData.canvas;
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  const c = s / 2;
  const r = s * 0.3;
  ctx.clearRect(0, 0, s, s);

  ctx.beginPath();
  ctx.arc(c, c, s * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = hot ? 'rgba(255,212,121,0.95)' : 'rgba(14,12,18,0.72)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = hot ? '#ffffff' : 'rgba(255,212,121,0.5)';
  ctx.stroke();

  const ink = hot ? '#241c08' : '#ffd479';
  // Three quarters of a circle, so the gap plus the arrowhead read as "turn".
  const from = -Math.PI * 0.55;
  const to = from + Math.PI * 1.5 * (clockwise ? 1 : -1);
  ctx.beginPath();
  ctx.arc(c, c, r, from, to, !clockwise);
  ctx.lineWidth = s * 0.1;
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Arrowhead on the moving end, tangent to the arc.
  const tip = { x: c + Math.cos(to) * r, y: c + Math.sin(to) * r };
  const tangent = to + (clockwise ? Math.PI / 2 : -Math.PI / 2);
  const head = s * 0.13;
  ctx.beginPath();
  for (const spread of [Math.PI * 0.78, -Math.PI * 0.78]) {
    ctx.lineTo(tip.x + Math.cos(tangent + spread) * head, tip.y + Math.sin(tangent + spread) * head);
  }
  ctx.lineTo(tip.x + Math.cos(tangent) * head * 0.5, tip.y + Math.sin(tangent) * head * 0.5);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();

  mesh.userData.texture.needsUpdate = true;
}

// Where each tip tab sits on the top face, and how its text is spun so it
// stays readable. The side tabs run ALONG their edge (long axis north-south)
// with the lettering turned to face the middle of the die, which is the only
// way a label that lives on a 1.44-wide face can be read at all.
const EDGE_TAB = {
  N: { spin: 0, size: [1.02, 0.26] },
  S: { spin: 0, size: [1.02, 0.26] },
  E: { spin: Math.PI / 2, size: [1.02, 0.26] },
  W: { spin: -Math.PI / 2, size: [1.02, 0.26] },
};
const EDGE_TAB_INSET = 0.57; // centre-to-tab, so a 0.26-thick tab sits flush inside the 0.72 half-face

// Turn handles live at the corners: the two eastern ones turn the die
// clockwise, the two western ones anticlockwise, matching which way your hand
// would push that corner.
const TURN_CORNERS = {
  NE: { x: 1, z: -1, cw: true },
  SE: { x: 1, z: 1, cw: true },
  NW: { x: -1, z: -1, cw: false },
  SW: { x: -1, z: 1, cw: false },
};
const CORNER_INSET = 0.5;

/** Everything needed to render + animate one unit's die + facing marker + selection ring. */
export class UnitView {

  constructor(unit) {
    this.unit = unit;

    const geo = new BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 1, 1, 1);
    // Slightly bevel-free box; round the edges visually via material only for now.
    this.dieMesh = new Mesh(geo, buildMaterials(unit));
    this.dieMesh.castShadow = true;
    this.dieMesh.receiveShadow = true;

    // Facing marker: a small always-on ground tick, independent of the die's
    // own rotation — it only turns when `facing` changes (TURN), never on
    // ROLL/STEP. Kept subtle since the bold on-die indicators below (guard
    // bar / attack arrow) carry the emphasis whenever it actually matters.
    const arrowGeo = new ConeGeometry(0.13, 0.26, 3);
    this.facingArrow = new Mesh(
      arrowGeo,
      new MeshStandardMaterial({ color: FACTION_COLOR[unit.faction], emissive: FACTION_COLOR[unit.faction], emissiveIntensity: 0.3 })
    );
    this.facingArrow.rotation.x = Math.PI / 2; // lay the cone flat, pointing along -Z locally
    this.facingArrow.position.y = 0.03;

    // On-die indicators, sitting on top of the die itself (per the brief):
    // a wall-like bar across the defended edge when Guard is active, or a
    // bold arrow along the attacked edge when an attack face is active. Only
    // one is ever visible at a time — see updateIndicators().
    this.guardBar = new Mesh(
      new BoxGeometry(1.0, 0.09, 0.24),
      new MeshStandardMaterial({ color: 0xf3f5fa, emissive: 0xf3f5fa, emissiveIntensity: 0.3 })
    );
    this.guardBar.position.y = TOP_Y;
    this.guardBar.visible = false;

    this.attackArrow = new Mesh(
      new ConeGeometry(0.2, 0.6, 3),
      new MeshStandardMaterial({ color: 0xff4d4d, emissive: 0xff4d4d, emissiveIntensity: 0.55 })
    );
    this.attackArrow.rotation.x = Math.PI / 2;
    this.attackArrow.position.y = TOP_Y;
    this.attackArrow.visible = false;

    // The active face's name, floating just above the die and ALWAYS upright.
    // The label baked into the cube texture rotates with the cube, so after a
    // tumble it can read sideways or upside down — and the wound-skip, which
    // turns the die a full 180°, flips it every single time. The face that
    // actually matters is the top one, so it gets a plate that never rotates.
    this.labelCanvas = document.createElement('canvas');
    this.labelCanvas.width = 256;
    this.labelCanvas.height = 96;
    this.labelCtx = this.labelCanvas.getContext('2d');
    this.labelTexture = new CanvasTexture(this.labelCanvas);
    this.labelTexture.colorSpace = SRGBColorSpace;
    this.activeLabel = new Mesh(
      new PlaneGeometry(1.12, 0.42),
      new MeshBasicMaterial({ map: this.labelTexture, transparent: true, depthTest: false })
    );
    this.activeLabel.rotation.x = -Math.PI / 2; // lies flat; y-rotation stays 0 so it never turns
    this.activeLabel.renderOrder = 10;
    this._drawActiveLabel();

    // Who this die actually is. Without it the board is a row of anonymous
    // cubes — you can read the active ability but not whether you are looking
    // at a Pikeman or the Captain.
    this.nameLabel = makePlate(1.5, 0.3, 11);
    drawPlate(this.nameLabel, unit.type.name + (unit.type.isLeader ? ' ★' : ''), {
      size: 34,
      bg: 'rgba(10,9,8,0.7)',
      fg: unit.faction === 'humans' ? '#9dc0ff' : '#ffb98a',
    });

    // One hint plate per edge of the top face, showing what a TIP that way
    // would turn up. Hidden until the die is selected — they are the primary
    // way to tip now, replacing a row of buttons that could not show you the
    // one thing that matters: which face you would actually get.
    this.edgeHints = {};
    for (const dir of ['N', 'E', 'S', 'W']) {
      const { spin, size } = EDGE_TAB[dir];
      const plate = makePlate(size[0], size[1], 13);
      // rotation.z spins the lettering inside the plate's own plane BEFORE it
      // is laid flat (Euler XYZ applies Z first), so the side tabs end up
      // running along their edge with the text turned inward.
      plate.rotation.z = spin;
      plate.visible = false;
      plate.userData.tipDir = dir;
      plate.userData.unitId = unit.id;
      this.edgeHints[dir] = plate;
    }

    // Corner turn handles — TURN used to live in a pair of HUD buttons, which
    // told you nothing about which way the die would swing.
    this.cornerTurns = {};
    for (const [corner, spec] of Object.entries(TURN_CORNERS)) {
      const plate = makePlate(0.36, 0.36, 14);
      plate.visible = false;
      plate.userData.turnCw = spec.cw;
      plate.userData.unitId = unit.id;
      plate.userData.corner = corner;
      drawTurnGlyph(plate, spec.cw);
      this.cornerTurns[corner] = plate;
    }

    this.ring = new Mesh(
      new RingGeometry(0.62, 0.72, 32),
      new MeshStandardMaterial({ color: 0xffd479, emissive: 0xffd479, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;

    this.deadFade = 0; // 0 = alive/opaque, 1 = fully faded
  }

  /** Show (or hide) the four tip tabs, each sitting ON its edge of the top
   *  face and labelled with the face a tip that way would bring up.
   *
   *  `hoveredDir` gets the highlighted treatment. `mutedDir` is hidden
   *  outright: it is the direction whose move tile the cursor is over, and
   *  that tile already spells out the very same face — rolling one square
   *  toward `dir` and tipping toward `dir` are the same quarter-turn, so the
   *  two hints would always print identical words.
   *
   *  `actionable` is false when the die is merely being read (an enemy's, or
   *  your own out of turn); the tab still explains itself but says so by
   *  going quiet, since double-clicking it will do nothing. */
  setEdgeHints(visible, worldX, worldZ, { hoveredDir = null, mutedDir = null, actionable = true } = {}) {
    for (const dir of ['N', 'E', 'S', 'W']) {
      const plate = this.edgeHints[dir];
      plate.visible = visible && dir !== mutedDir;
      if (!plate.visible) continue;
      const d = DIRECTION_VECTORS[dir];
      plate.position.set(worldX + d.x * EDGE_TAB_INSET, TOP_Y + 0.06, worldZ + d.z * EDGE_TAB_INSET);
      const hot = dir === hoveredDir;
      drawPlate(plate, this.unit.topAfterTurning(dir), {
        size: 34,
        bg: hot ? 'rgba(192,138,232,0.95)' : actionable ? 'rgba(14,12,18,0.8)' : 'rgba(14,12,18,0.6)',
        fg: hot ? '#12101a' : actionable ? '#c9b6e8' : '#8d81a3',
        border: hot ? '#ffffff' : actionable ? 'rgba(201,182,232,0.5)' : 'rgba(141,129,163,0.3)',
      });
    }
  }

  /** Show (or hide) the four corner turn handles. */
  setCornerTurns(visible, worldX, worldZ, hoveredCorner = null) {
    for (const [corner, spec] of Object.entries(TURN_CORNERS)) {
      const plate = this.cornerTurns[corner];
      plate.visible = visible;
      if (!visible) continue;
      plate.position.set(worldX + spec.x * CORNER_INSET, TOP_Y + 0.07, worldZ + spec.z * CORNER_INSET);
      drawTurnGlyph(plate, spec.cw, { hot: corner === hoveredCorner });
    }
  }

  /** Repaints the floating name plate for whatever face is up right now. */
  _drawActiveLabel() {
    const ctx = this.labelCtx;
    const { width: w, height: h } = this.labelCanvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,9,8,0.82)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, w - 5, h - 5);

    const label = this.unit.topLabel;
    const size = label.length > 8 ? 40 : 50;
    ctx.font = `700 ${size}px 'Segoe UI', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText(label, w / 2, h / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w / 2, h / 2);
    this.labelTexture.needsUpdate = true;
  }

  setSelected(selected) {
    this.ring.visible = selected;
  }

  /** Snap every facing-dependent marker (ground tick + on-die guard/attack
   *  indicator) to the unit's current compass facing + tile position, and
   *  pick which on-die indicator (if any) the current top face calls for. */
  syncFacing(worldX, worldZ) {
    const d = DIRECTION_VECTORS[this.unit.facing];
    // Cone tip points local +Y, laid flat to +Z by rotation.x=PI/2; rotation.y=atan2(d.x,d.z)
    // then swings that +Z tip to point at world direction d — verified against DIRECTION_VECTORS.
    const angle = Math.atan2(d.x, d.z);

    this.facingArrow.position.set(worldX + d.x * 0.62, 0.03, worldZ + d.z * 0.62);
    this.facingArrow.rotation.y = angle;

    this.attackArrow.position.set(worldX + d.x * 0.5, TOP_Y, worldZ + d.z * 0.5);
    this.attackArrow.rotation.y = angle;

    // The guard bar is a wall PERPENDICULAR to facing, sitting at the
    // defended edge. Its long edge starts out along local +X, which is
    // already perpendicular to the arrow's local +Z "points at facing" axis
    // — so it needs the SAME angle as the arrow, not an extra quarter turn
    // (that would swing it to point ALONG facing instead of across it, which
    // is what made it read as a vertical picket instead of a flat shield).
    this.guardBar.position.set(worldX + d.x * 0.5, TOP_Y, worldZ + d.z * 0.5);
    this.guardBar.rotation.y = angle;

    // Sits above the die, centred, never rotated — see the constructor.
    this.activeLabel.position.set(worldX, TOP_Y + 0.06, worldZ);
    this._drawActiveLabel();
    this.nameLabel.position.set(worldX, 0.05, worldZ + 0.98);

    const kind = indicatorKindFor(this.unit.topLabel);
    this.guardBar.visible = kind === 'guard';
    this.attackArrow.visible = kind === 'attack';
  }

  syncRing(worldX, worldZ) {
    this.ring.position.set(worldX, 0.02, worldZ);
  }

  dispose() {
    this.dieMesh.geometry.dispose();
    this.dieMesh.material.forEach((m) => m.dispose());
    this.facingArrow.geometry.dispose();
    this.facingArrow.material.dispose();
    this.guardBar.geometry.dispose();
    this.guardBar.material.dispose();
    this.attackArrow.geometry.dispose();
    this.attackArrow.material.dispose();
    this.activeLabel.geometry.dispose();
    this.activeLabel.material.dispose();
    this.labelTexture.dispose();
    for (const m of [this.nameLabel, ...Object.values(this.edgeHints), ...Object.values(this.cornerTurns)]) {
      m.geometry.dispose();
      m.material.dispose();
      m.userData.texture.dispose();
    }
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
