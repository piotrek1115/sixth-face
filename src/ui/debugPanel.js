import { snapshotFromQuaternion } from '../core/orientation.js';
import { labelForAxisKey } from '../core/units.js';

/** Renders the TOP/BOTTOM/FRONT/BACK/LEFT/RIGHT panel by reading DIRECTLY from
 *  the selected unit's live render-mesh quaternion — the same transform the
 *  renderer is drawing this frame, mid-animation or at rest. There is no
 *  separate "debug copy" of the orientation to drift out of sync. */
export function renderDebugPanel(el, selectedUnit, selectedView) {
  if (!selectedUnit || !selectedView) {
    el.innerHTML = `<h4>Orientation</h4><div class="row"><span class="k">—</span><span>select a unit</span></div>`;
    return;
  }
  const snap = snapshotFromQuaternion(selectedView.dieMesh.quaternion);
  const labelFor = (axisKey) => labelForAxisKey(selectedUnit.unitTypeId, axisKey);

  const frontAxisKey = selectedUnit.orientation.axisKeyForCompass(selectedUnit.facing);
  const rows = [
    ['TOP', labelFor(snap.top)],
    ['BOTTOM', labelFor(snap.bottom)],
    ['FRONT', labelFor(frontAxisKey)],
    ['NORTH', labelFor(snap.north)],
    ['SOUTH', labelFor(snap.south)],
    ['EAST', labelFor(snap.east)],
    ['WEST', labelFor(snap.west)],
    ['FACING', selectedUnit.facing],
  ];

  el.innerHTML = `<h4>Orientation — ${selectedUnit.type.name}</h4>${rows
    .map(([k, v]) => `<div class="row"><span class="k">${k}</span><span>${v}</span></div>`)
    .join('')}`;
}
