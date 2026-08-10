import { UNIT_TYPES, ATTACK_LABELS, PUSH_LABELS, RANGE_BY_LABEL, WOUNDED_LABEL, RALLY_LABELS } from '../core/units.js';

/** What each face actually does, in one line. Keyed by label so the sheet can
 *  never drift from the roster — every face printed on a die gets looked up
 *  here, and anything missing shows up immediately as a blank. */
export const FACE_RULES = {
  Guard: 'A frontal hit is absorbed — no wound, but the Guard is knocked aside. No protection from the flank.',
  Wounded: 'One hit from death. Cannot block, attack, roll or turn — only one 1-AP step per turn.',
  Strike: 'Plain attack, range 1.',
  Chop: 'Plain attack, range 1.',
  Crush: 'Plain attack, range 1.',
  Smash: 'Plain attack, range 1.',
  Bash: 'Attack + shoves the target back one tile; you follow into the square it left.',
  Thrust: 'Attack with range 2 — the only reaching weapon.',
  Advance: 'A step covers 2 tiles for the same 1 AP (both must be clear).',
  Rush: 'A roll costs 1 AP instead of 2.',
  Riposte: 'Survive a hit while this is up and you counter-attack for free.',
  Brace: 'An enemy shoved onto the square in front of you takes a free hit.',
  Stagger: 'Any hit on you shoves you back a tile, even one that normally would not.',
  Roar: 'Adjacent enemies lose their Guard block entirely.',
  Command: 'Your side gets +1 AP next turn — but the commander itself may not act that turn.',
  Waaagh: 'Your side gets +1 AP next turn — but the commander itself may not act that turn.',
};

/** Which way this faction advances decides which face a forward roll brings
 *  up: rolling toward a direction lifts the face on the OPPOSITE side, so
 *  humans (who roll south) show their north face, and orcs the reverse. */
function forwardAxis(faction) {
  return faction === 'humans' ? { fwd: 'north', back: 'south' } : { fwd: 'south', back: 'north' };
}

function faceClass(label) {
  if (label === 'Guard') return 'f-guard';
  if (label === WOUNDED_LABEL) return 'f-wound';
  if (ATTACK_LABELS.has(label)) return 'f-attack';
  if (RALLY_LABELS.has(label)) return 'f-rally';
  return 'f-other';
}

/** The die unfolded, vertically: the column is the forward-roll cycle and the
 *  two arms are the faces you can only reach by rolling sideways. Guard sits
 *  where the arms meet, exactly as on a physical net. */
function renderNet(type) {
  const { fwd, back } = forwardAxis(type.faction);
  const f = type.faces;
  const cell = (label, note) =>
    `<div class="netCell ${faceClass(label)}"><b>${label}</b>${note ? `<span>${note}</span>` : ''}</div>`;

  return `
    <div class="net">
      <div class="netRow">${cell(f[back], '1 roll back')}</div>
      <div class="netRow arms">
        ${cell(f.west, 'roll sideways')}
        ${cell(f.top, 'START')}
        ${cell(f.east, 'roll sideways')}
      </div>
      <div class="netRow">${cell(f[fwd], '1 roll forward')}</div>
      <div class="netRow">${cell(f.bottom, '2 rolls — always skipped')}</div>
    </div>`;
}

function renderUnitCard(type) {
  const faces = [...new Set(Object.values(type.faces))];
  return `
    <div class="unitCard">
      <h4 class="${type.faction}">${type.name}${type.isLeader ? ' ★ leader' : ''}</h4>
      ${renderNet(type)}
    </div>`;
}

export function renderCheatSheet() {
  const usedFaces = new Set();
  for (const t of Object.values(UNIT_TYPES)) for (const l of Object.values(t.faces)) usedFaces.add(l);

  const faceRows = [...usedFaces]
    .sort()
    .map(
      (label) => `
      <tr class="${faceClass(label)}">
        <td class="faceName">${label}${RANGE_BY_LABEL[label] ? ` (range ${RANGE_BY_LABEL[label]})` : ''}${
        PUSH_LABELS.has(label) ? ' ⇥' : ''
      }</td>
        <td>${FACE_RULES[label] ?? '<i>no rule — flavour only</i>'}</td>
      </tr>`
    )
    .join('');

  return `
    <h3>How it works</h3>

    <h4>Your turn — 2 AP for the whole side</h4>
    <table class="cheatTable">
      <tr><td class="k">Step</td><td><b>1 AP</b> · one tile, any direction · top face unchanged</td></tr>
      <tr><td class="k">Roll</td><td><b>2 AP</b> · one tile, any direction · <b>changes the top face</b></td></tr>
      <tr><td class="k">Tip in place</td><td><b>2 AP</b> · stays put · changes the top face — the only way to re-arm while boxed in</td></tr>
      <tr><td class="k">Face ⟳ ⟲</td><td><b>1 AP</b> · turns which way you look · top face unchanged · click a <b>corner</b> of the die: right corners turn clockwise, left corners anticlockwise</td></tr>
      <tr><td class="k">Attack</td><td><b>1 AP</b> · only if an attack face is up, straight ahead</td></tr>
    </table>

    <h4>Damage — no hit points, the die IS the state</h4>
    <div class="ladder">
      <span class="f-guard">Guard</span><i>frontal hit</i>
      <span class="f-other">disarmed</span><i>hit</i>
      <span class="f-wound">Wounded</span><i>hit</i>
      <span class="f-dead">dead</span>
    </div>
    <p class="note">Frontal: <b>3 hits</b>. From a flank or rear: <b>2 hits</b> — the blow drives straight past the Guard.
    You can never roll <i>yourself</i> onto Wounded: a roll that would land there turns one step further, still moving a single tile.</p>

    <h4>Every face</h4>
    <table class="cheatTable faces">${faceRows}</table>

    <h4>The dice, unfolded</h4>
    <p class="note">Guard is where the side arms meet. Straight down the column is what successive rolls
    <i>toward the enemy</i> bring up; the arms are what a sideways roll brings up instead.</p>
    <div class="unitGrid">
      ${Object.values(UNIT_TYPES)
        .filter((t) => t.faction === 'humans')
        .map(renderUnitCard)
        .join('')}
    </div>
    <div class="unitGrid">
      ${Object.values(UNIT_TYPES)
        .filter((t) => t.faction === 'orcs')
        .map(renderUnitCard)
        .join('')}
    </div>
  `;
}
