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
  Rush: 'Tipping this die costs 1 AP less than its own weight normally would.',
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

/** The traits that are properties of the UNIT rather than of a face — weight
 *  and reach. Printed on the card because they are invisible on the net. */
function unitTraits(type) {
  const traits = [];
  if (type.rollCost === 1) traits.push('light · tips for 1 AP');
  if (type.rollCost > 2) traits.push(`heavy · tips for ${type.rollCost} AP`);
  if (type.reach > 1) traits.push(`reach ${type.reach} · strikes over its own front rank`);
  return traits.length ? `<div class="unitTraits">${traits.join(' · ')}</div>` : '';
}

function renderUnitCard(type) {
  return `
    <div class="unitCard">
      <h4 class="${type.faction}">${type.name}${type.isLeader ? ' ★ leader' : ''}</h4>
      ${unitTraits(type)}
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
      <tr><td class="k">Roll</td><td><b>1–3 AP</b> · one tile, any direction · <b>changes the top face</b>. The price is the die's own weight: <b>light</b> dice tip for 1, most for 2, <b>heavy</b> ones for 3 — a whole turn.</td></tr>
      <tr><td class="k">Tip in place</td><td>same price as a Roll · stays put · changes the top face — the only way to re-arm while boxed in</td></tr>
      <tr><td class="k">Face ⟳ ⟲</td><td><b>1 AP</b> · turns which way you look · top face unchanged · click a <b>corner</b> of the die: right corners turn clockwise, left corners anticlockwise</td></tr>
      <tr><td class="k">Attack</td><td><b>1 AP</b> · only if an attack face is up, straight ahead</td></tr>
    </table>

    <h4>Weight — how often a die can change what it is</h4>
    <p class="note">Tipping is both how you move and how you change your ability, so those are one
    axis. A <b>light</b> die (Swordsman, Orc Boy) tips for 1 AP and keeps reinventing itself.
    A <b>heavy</b> one (Shieldbearer, Mauler) needs 3 — more than a normal turn holds, so it
    only ever turns over on a turn its commander has bought an extra AP for. It still walks
    for 1 AP; it simply keeps the face it has.</p>

    <h4>Damage — no hit points, the die IS the state</h4>
    <div class="ladder">
      <span class="f-guard">Guard</span><i>frontal hit</i>
      <span class="f-other">disarmed</span><i>hit</i>
      <span class="f-wound">Wounded</span><i>hit</i>
      <span class="f-dead">dead</span>
    </div>
    <p class="note">Frontal: <b>3 hits</b>. From a flank or rear: <b>2 hits</b> — the blow drives straight past the Guard.
    You can never roll <i>yourself</i> onto Wounded: a roll that would land there turns one step further, still moving a single tile.</p>

    <h4>Terrain</h4>
    <table class="cheatTable">
      <tr><td class="k">Wall</td><td>Impassable, and blows do not travel through it. Walls make the route
      you take matter — and a gap in one is worth holding.</td></tr>
      <tr><td class="k">Mud</td><td>Walk in and out of it freely, but <b>no die tips</b> in mud: not into it,
      not out of it, not on the spot. You carry in whatever face is up and you carry the same one out.
      It restricts your <b>abilities</b>, not your movement — which is the one kind of terrain a die
      can express and a figure cannot.</td></tr>
    </table>

    <h4>Ending the battle</h4>
    <p class="note">Defeat the enemy leader and you win outright. If <b>nobody lands a blow
    for 12 turns</b> the battle is called instead, and decided on what is left standing —
    a healthy die counts 2, a wounded one 1. Running away with a wounded die therefore
    loses the call rather than saving it.</p>

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
