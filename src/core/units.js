// Per-unit-type die topology: which ability label is "printed" on each of the
// six LOCAL_AXES. This mapping is fixed for the lifetime of a unit — rolling
// and turning only change which label currently sits on which world side.
//
// Design rule enforced everywhere: LOCAL_AXES.top must be 'Guard', so every
// unit spawns showing Guard.
//
// Rolling the SAME direction repeatedly only ever cycles through 4 of the 6
// faces — TOP, the face behind you, BOTTOM, and the face ahead of you (the
// two side faces are reachable only via a sideways roll or a TURN).
//
// WOUNDED sits opposite Guard (BOTTOM) on every die, and that position is
// load-bearing. It resolves what looked like a hard contradiction:
//
//   * The wound face MUST sit on the axis combat happens along, or head-on
//     fighting can never hurt anyone. (With it on a side face, we measured
//     that a hit from the north or south literally could not kill, ever —
//     armies faced off along N/S and nothing died.)
//   * The wound face MUST NOT sit there, or simply marching two tiles
//     forward would flip your own unit onto it.
//
// The skip rule in Unit.applyMove breaks the tie: a unit's OWN roll can
// never come to rest on Wounded — it tumbles one extra tile past it. So
// marching never wounds you, while an enemy's hit lands on it normally.
// Wounded is therefore a state you can only ever be put into, never one you
// can choose or shake off by walking.
//
// Everything else follows the faction lever the brief asks for: Humans get
// one attack then mobility (measured, reactive); Orcs get attacks on both
// the forward face AND a side face (relentless, always pressing). Leaders
// trade their 3-roll face for a rally ability instead of a second attack.
//
// IMPORTANT — which axis is "1 roll forward" depends on which way the
// faction actually advances: rolling toward world direction d pulls the
// face OPPOSITE d up to the top (a North roll brings the SOUTH face to top,
// not the north face — verified against orientation.js's roll physics).
// Humans spawn facing south and roll south to advance, so their 1-roll face
// is north. Orcs spawn facing north and roll north to advance, so their
// 1-roll face is SOUTH — swapped from what you'd naively guess.

export const ATTACK_LABELS = new Set(['Strike', 'Chop', 'Crush', 'Smash', 'Bash', 'Thrust']);
export const PUSH_LABELS = new Set(['Bash']);
export const RANGE_BY_LABEL = { Thrust: 2 };
export const DEFAULT_RANGE = 1;

/** The single wound state, shared by every unit type. A unit showing this
 *  is not dead — it is one more hit away from dead (see Unit.applyHit). */
export const WOUNDED_LABEL = 'Wounded';

/** Leader-only rally faces: showing one at the start of your turn buys the
 *  whole army an extra AP. Named here so the rule, the AI and any future UI
 *  all read the same list instead of repeating string literals. */
export const RALLY_LABELS = new Set(['Command', 'Waaagh']);

export const UNIT_TYPES = {
  swordsman: {
    id: 'swordsman',
    name: 'Swordsman',
    faction: 'humans',
    isLeader: false,
    // LIGHT. In this game mobility and ability-switching are the same axis:
    // the only way to change what you can do is to tip the die, and tipping
    // is how you move. So "fast" means "changes what it is often" — versatile
    // and unpredictable, and correspondingly rarely sitting behind Guard.
    rollCost: 1,
    // 1 roll → Strike. 3 rolls → Riposte. Sides: Stagger / Advance.
    faces: { top: 'Guard', north: 'Strike', bottom: 'Wounded', south: 'Riposte', east: 'Stagger', west: 'Advance' },
  },
  pikeman: {
    id: 'pikeman',
    name: 'Pikeman',
    faction: 'humans',
    isLeader: false,
    // The REACH archetype (see `reach` below): every attack face carries two
    // tiles and strikes over the unit's own front rank.
    reach: 2,
    // 1 roll → Thrust. 3 rolls → Brace.
    faces: { top: 'Guard', north: 'Thrust', bottom: 'Wounded', south: 'Brace', east: 'Stagger', west: 'Advance' },
  },
  shieldbearer: {
    id: 'shieldbearer',
    name: 'Shieldbearer',
    faction: 'humans',
    isLeader: false,
    // HEAVY, the mirror of the above: turning this thing over costs a whole
    // turn, so it keeps whatever face it is showing. Predictable, hard to
    // shift, and it still walks for 1 AP — a heavy unit you can never afford
    // to move at all would simply be left at home.
    rollCost: 3,
    // The humans' push unit — 1 roll → Bash. This is what makes the
    // Shieldbearer-bashes-an-orc-into-the-Pikeman's-Brace combo from the
    // brief actually reachable in play (before this unit existed, only orcs
    // had a push, so a human Brace could never be triggered).
    faces: { top: 'Guard', north: 'Bash', bottom: 'Wounded', south: 'Brace', east: 'Stagger', west: 'Advance' },
  },
  captain: {
    id: 'captain',
    name: 'Captain',
    faction: 'humans',
    isLeader: true,
    // 1 roll → Strike. 3 rolls → Command (rally). Leaders trade the second
    // attack every other unit gets for their rally face — losing them ends
    // the game, so they're built one notch less aggressive.
    faces: { top: 'Guard', north: 'Strike', bottom: 'Wounded', south: 'Command', east: 'Stagger', west: 'Advance' },
  },
  orcBoy: {
    id: 'orcBoy',
    name: 'Orc Boy',
    faction: 'orcs',
    isLeader: false,
    rollCost: 1, // LIGHT — the orc mirror of the Swordsman
    // Orcs advance NORTH, so their 1-roll face is SOUTH (see note above).
    // Attacks on BOTH the forward face and a side face — the orc identity:
    // whichever way they tumble, something hits you.
    faces: { top: 'Guard', south: 'Bash', bottom: 'Wounded', north: 'Roar', east: 'Stagger', west: 'Chop' },
  },
  brute: {
    id: 'brute',
    name: 'Brute',
    faction: 'orcs',
    isLeader: false,
    // The orcs' reach unit — the structural mirror of the human Pikeman, so
    // that the archetype can be measured without handing one side an edge.
    reach: 2,
    faces: { top: 'Guard', south: 'Smash', bottom: 'Wounded', north: 'Rush', east: 'Stagger', west: 'Crush' },
  },
  mauler: {
    id: 'mauler',
    name: 'Mauler',
    faction: 'orcs',
    isLeader: false,
    rollCost: 3, // HEAVY — the orc mirror of the Shieldbearer
    // The orcs' second push unit and second Roar carrier.
    faces: { top: 'Guard', south: 'Chop', bottom: 'Wounded', north: 'Roar', east: 'Stagger', west: 'Bash' },
  },
  warboss: {
    id: 'warboss',
    name: 'Warboss',
    faction: 'orcs',
    isLeader: true,
    // Leader exception, same as Captain: rally (Waaagh) instead of a second
    // attack.
    faces: { top: 'Guard', south: 'Chop', bottom: 'Wounded', north: 'Rush', east: 'Stagger', west: 'Waaagh' },
  },
};

export function labelForAxisKey(unitType, axisKey) {
  return UNIT_TYPES[unitType].faces[axisKey];
}
