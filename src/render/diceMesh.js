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

    this.ring = new Mesh(
      new RingGeometry(0.62, 0.72, 32),
      new MeshStandardMaterial({ color: 0xffd479, emissive: 0xffd479, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.ring.visible = false;

    this.deadFade = 0; // 0 = alive/opaque, 1 = fully faded
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
    this.ring.geometry.dispose();
    this.ring.material.dispose();
  }
}
