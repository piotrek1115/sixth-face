// A heuristic AI good enough to drive a full game and to look like it has a
// plan. It only DECIDES; it never mutates game state, so the caller can
// animate each decision exactly like a human-driven action.
//
// Structure: instead of a priority cascade ("attack if you can, else turn,
// else advance"), every legal action for every unit is scored and the best
// one wins. The cascade version produced visibly silly play — it would spend
// a whole turn spinning a unit 180°, and it walked units back and forth
// because each decision was made with no memory of the last one. Scoring
// fixes both: a turn is only worth anything if it actually enables an attack
// this turn, and undoing your own last move is refused outright.
import { DIR_ORDER, nextDir, oppositeDir, DIRECTION_VECTORS } from './orientation.js';
import { ATTACK_LABELS, WOUNDED_LABEL, RALLY_LABELS, RANGE_BY_LABEL, MIN_RANGE_BY_LABEL,
         FAN_LABELS } from './units.js';
import { BOARD_SIZE, inBounds, isWall } from './board.js';


/** Walking distance from every tile to the nearest enemy, as a flood fill
 *  outward from all of them at once.
 *
 *  This used to be Manhattan distance, which on a board with walls is not an
 *  approximation but a WRONG NUMBER: it reports distances that cannot be
 *  travelled. A unit would read "the enemy is three tiles away" straight
 *  through a wall, march at it and stop dead — measured as terrain making
 *  units move sideways LESS, which is the exact opposite of the point of
 *  putting terrain on the board.
 *
 *  Other units are treated as passable: they move, so routing around a body
 *  that will not be there next turn is not worth the detour. Only stone is
 *  permanent. */
function distanceField(sources, terrain, size = BOARD_SIZE) {
  const dist = new Map();
  const queue = [];
  for (const e of sources) {
    const key = `${e.x},${e.z}`;
    if (!dist.has(key)) {
      dist.set(key, 0);
      queue.push([e.x, e.z]);
    }
  }
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    const d = dist.get(`${x},${z}`);
    for (const [dx, dz] of STEPS) {
      const nx = x + dx;
      const nz = z + dz;
      const key = `${nx},${nz}`;
      if (!inBounds(nx, nz, size) || dist.has(key) || isWall(terrain, nx, nz)) continue;
      dist.set(key, d + 1);
      queue.push([nx, nz]);
    }
  }
  // Walled off entirely: treat as very far rather than infinite, so scores
  // stay finite and comparable.
  return (x, z) => dist.get(`${x},${z}`) ?? size * 2;
}

/** Czy ten wrog moglby uderzyc w to pole w swojej nastepnej turze.
 *
 *  Swiadomie zgrubne w jedna strone: zakladamy, ze przeciwnik zdazy sie
 *  przekrecic na sciane ataku (przy trzech AP zwykle zdazy), wiec liczy sie
 *  geometria — linia, zasieg, sciany — a nie to, co akurat ma na wierzchu.
 *  Zgadywanie w druga strone („nie ma teraz broni, wiec jestem bezpieczny")
 *  bylo dokladnie tym bledem, ktory chcemy usunac. */
function threatensTile(game, enemy, tile) {
  if (enemy.isWounded) return false; // ranna kostka tylko sie wlecze
  const dx = tile.x - enemy.x;
  const dz = tile.z - enemy.z;

  // Sweep siega tez na skos o jedno pole — jedyne zagrozenie, ktore nie
  // biegnie wzdluz osi, wiec latwo je przeoczyc.
  const hasFan = Object.values(enemy.type.faces).some((f) => FAN_LABELS.has(f));
  if (hasFan && Math.abs(dx) === 1 && Math.abs(dz) === 1) return true;

  if (dx !== 0 && dz !== 0) return false;
  const dist = Math.abs(dx) + Math.abs(dz);
  if (dist === 0) return false;

  // Najdalszy zasieg, jaki ta kostka moze miec na ktorejkolwiek scianie.
  let reach = enemy.type.reach ?? 1;
  let minRange = 1;
  for (const face of Object.values(enemy.type.faces)) {
    if (!ATTACK_LABELS.has(face)) continue;
    reach = Math.max(reach, RANGE_BY_LABEL[face] ?? 1);
    if (RANGE_BY_LABEL[face]) minRange = Math.min(minRange, MIN_RANGE_BY_LABEL[face] ?? 1);
  }
  if (dist > reach || dist < minRange) return false;

  const stepX = Math.sign(dx);
  const stepZ = Math.sign(dz);
  for (let i = 1; i < dist; i++) {
    if (isWall(game.terrain, enemy.x + stepX * i, enemy.z + stepZ * i)) return false;
  }
  return true;
}

/** Ile kosztuje stanie na tym polu, jesli przeciwnik odpowie najlepiej jak
 *  umie. Liczone SKUTKIEM: rana czy smierc, nie sam fakt bycia w zasiegu. */
function dangerAt(game, unit, tile, enemies, topLabel = unit.topLabel) {
  let worst = 0;
  for (const e of enemies) {
    if (!threatensTile(game, e, tile)) continue;
    // Garda chroni tylko od frontu, a atakujacy sam wybiera, skad przyjdzie —
    // wiec traktujemy ja jako oslone tylko wtedy, gdy wrog stoi na wprost.
    const frontal = topLabel === 'Guard';
    const cost = unit.isWounded ? SCORE.dangerKilled
      : frontal ? SCORE.dangerDisarmed
      : SCORE.dangerWounded;
    worst = Math.min(worst, cost);
  }
  return worst;
}

/** O ile lepsze jest to pole ze wzgledu na CELE, a nie na wroga.
 *
 *  Bez tej funkcji cele sa martwa litera: AI widzi tylko przeciwnika, wiec
 *  punktuje przypadkiem albo wcale, a pomiar scenariusza mierzy szum.
 *  Zwraca 0 w scenariuszu 'leader', gdzie zadnych celow nie ma. */
function objectivePull(game, unit, tile, fields) {
  const { toObjective, toRelic, homeRow } = fields;
  let score = 0;

  // Kurier ma dokladnie jedno zadanie i jest nim wlasny tyl planszy.
  if (homeRow !== null && game.isCarrying(unit)) {
    const now = Math.abs(unit.z - homeRow);
    const then = Math.abs(tile.z - homeRow);
    if (then === 0) return SCORE.relicDeliver;
    return (now - then) * SCORE.carryHomePerTile;
  }

  if (toRelic) {
    if (game.relics.some((r) => !r.carrier && r.x === tile.x && r.z === tile.z)) {
      score += SCORE.relicPickup;
    } else {
      score += (toRelic(unit.x, unit.z) - toRelic(tile.x, tile.z)) * SCORE.relicPerTile;
    }
  }

  if (toObjective) {
    if (scoresOn(game, tile, unit.topLabel)) score += SCORE.standOnObjective;
    else score += (toObjective(unit.x, unit.z) - toObjective(tile.x, tile.z)) * SCORE.objectivePerTile;
  }
  return score;
}

/** Would tipping toward `dir` leave this unit actually able to strike?
 *
 *  A tip does not change facing, so an attack face is worthless unless the
 *  target already stands in front. Scoring "an attack face came up" without
 *  that check made a unit stood beside an enemy it wasn't facing tip back and
 *  forth forever: each tip produced an attack face, outbid turning, and ate
 *  the AP that turning needed. Asking the rules whether the strike would
 *  land — rather than guessing from the label — also gets reach units right
 *  for free, since it consults their real range. */
function couldAttackAfterTip(game, unit, dir) {
  const before = unit.orientation.clone();
  try {
    const turns = unit.rollTurns(dir);
    for (let i = 0; i < turns; i++) unit.orientation.roll(dir);
    return ATTACK_LABELS.has(unit.topLabel) && !!game.findAttackTarget(unit);
  } finally {
    unit.orientation = before;
  }
}

/** Would this unit have an attack available if it were facing `facing`?
 *  Answered by briefly setting the facing and asking the Game itself, so the
 *  prediction can never drift from the real targeting rule. Restored in a
 *  finally block, so no mutation survives the call. */
function couldAttackFacing(game, unit, facing) {
  const original = unit.facing;
  try {
    unit.facing = facing;
    return ATTACK_LABELS.has(unit.topLabel) && !!game.findAttackTarget(unit);
  } finally {
    unit.facing = original;
  }
}

// Remembers each unit's last committed move so we can refuse to undo it.
// Keyed by the unit object, so it disappears with the game.
const lastMove = new WeakMap();

const SCORE = {
  kill: 1000,
  wound: 600,
  disarm: 250,
  turnIntoAttack: 400,
  rollIntoAttack: 300,
  // Arming without surrendering the square you fought for beats arming by
  // backing off, so the in-place version outbids the travelling one.
  holdContact: 120,
  rally: 260,
  // Only meaningful in 'adjacent' rally mode: the commander is worth more
  // standing beside the troops it buffs. This is deliberately in tension
  // with LEADER_KEEP_AWAY — the whole question is which pull wins.
  leaderNearAlly: 140,
  closePerTile: 30,
  rollClosePerTile: 20,
  retreatPerTile: 50,
  guardWhileEngaged: 80,
  exposedWhileEngaged: -70,

  // --- cele -----------------------------------------------------------
  // Bez tego cele istnialyby w zasadach, a nie w grze: AI chodziloby po
  // planszy dokladnie tak jak przedtem, a punktowanie bylo funkcja przypadku.
  objectivePerTile: 28, // gradient „blizej wolnej kapliczki"
  standOnObjective: 340,
  // Stoisz na kapliczce ze sciana ataku, czyli nie punktujesz. Przekrecenie
  // sie na cokolwiek innego JEST tu ruchem punktujacym — i wprost licytuje
  // z gotowoscia bojowa, o co w tej zasadzie chodzi.
  holdObjectiveFace: 300,
  relicPerTile: 40,
  relicPickup: 520,
  carryHomePerTile: 90, // niosac masz jeden cel i jest nim wlasny tyl planszy
  relicDeliver: 1400,

  // --- nie wchodz pod cios -------------------------------------------
  // Jedyna rzecz, ktora AI robilo naprawde glupio z punktu widzenia
  // czlowieka: stawalo na polu, z ktorego przeciwnik zabijal je w nastepnej
  // turze, bo liczylo tylko wlasny zysk. Kara jest wazona SKUTKIEM, nie
  // sama obecnoscia zagrozenia — wejscie pod cios z podniesiona garda
  // kosztuje niewiele, wejscie tam ranna kostka kosztuje partie.
  dangerKilled: -900,
  dangerWounded: -260,
  dangerDisarmed: -55,
  // Podniesienie tarczy, kiedy cios juz nadchodzi. Bez tego AI stalo pod
  // wzniesiona bronia z odsloniete bokiem i nie robilo NIC — bo przekrecenie
  // sie bylo punktowane wylacznie wtedy, gdy dawalo wlasny atak.
  guardUpUnderThreat: 330,
  // Obrot przodem do zagrozenia. Pod ekonomia 'freestep' Obrot jest DARMOWY,
  // a bok kosztuje o cale trafienie mniej niz front (dwa ciosy zamiast
  // trzech) — wiec stanie tylem do wroga jest powaznym bledem, ktorego AI
  // dotad nie widzialo: obracalo sie wylacznie po to, zeby samo uderzyc.
  faceTheThreat: 90,
};

// Losing the leader loses the game outright, and a leader dies to the same
// two flank hits as anyone else — so it has no business leading the charge.
// Without this the AI marched its own Captain into contact and handed the
// game away on turn 10.
const LEADER_KEEP_AWAY = 3;

/** How much a unit wants to end up `there` tiles from the nearest enemy,
 *  given it is `here` tiles away now. `leaderMayHide` is false once the
 *  leader has no healthy troops left to fight on its behalf — without that
 *  condition both leaders simply run from each other forever and the game
 *  can never be won (observed: 2971 turns of empty passes with only the two
 *  leaders left standing). */
function positionalScore(unit, here, there, perTile, leaderMayHide) {
  if (unit.isWounded) return (there - here) * SCORE.retreatPerTile;
  if (unit.type.isLeader && leaderMayHide) {
    // Back off while inside the danger band; drift forward only from safety,
    // and even then reluctantly.
    if (there < LEADER_KEEP_AWAY) return (there - here) * SCORE.retreatPerTile;
    return (here - there) * perTile * 0.2;
  }
  return (here - there) * perTile;
}

function engagementBonus(topLabel, adjacentToEnemy) {
  if (!adjacentToEnemy) return 0;
  if (topLabel === 'Guard') return SCORE.guardWhileEngaged;
  if (ATTACK_LABELS.has(topLabel)) return 0; // fine — you're about to swing
  if (topLabel === WOUNDED_LABEL) return 0; // already handled by retreat logic
  return SCORE.exposedWhileEngaged;
}

/** Undoing your own last move is forbidden outright, not merely discouraged.
 *
 *  As a score it never stood a chance: a roll that brings up an attack face
 *  is worth +300, so a -25 nudge let a unit shuttle between two tiles for
 *  thousands of turns — arm, fail to reach the enemy standing to its SIDE,
 *  roll back, repeat. Raising the penalty instead was tried and it vetoed
 *  real progress. A hard ban kills two-tile cycles and leaves every other
 *  decision untouched. */
function isImmediateReversal(unit, type, dir) {
  const prev = lastMove.get(unit);
  if (!prev || !dir) return false;
  const wasMove = prev.type === 'step' || prev.type === 'roll';
  const isMove = type === 'step' || type === 'roll';
  return wasMove && isMove && prev.dir === oppositeDir(dir);
}

/** Pola, ktore ta strona chce zajac. Kapliczka juz trzymana przez nas nie
 *  ciagnie nikogo wiecej — inaczej cala warbanda zbieglaby sie na jedno pole. */
function openObjectives(game, faction) {
  return game.objectives.filter((o) => {
    const u = game.units.find((x) => x.alive && x.x === o.x && x.z === o.z);
    return !u || u.faction !== faction;
  });
}

/** Czy stojac na tym polu z ta sciana faktycznie punktujesz. */
const scoresOn = (game, tile, topLabel) =>
  game.objectives.some((o) => o.x === tile.x && o.z === tile.z) && !ATTACK_LABELS.has(topLabel);

function scoreCandidates(game, myUnits, enemies, profile) {
  const out = [];
  // One flood fill per decision, shared by every candidate move.
  const distanceTo = distanceField(enemies, game.terrain, game.boardSize);
  // Te same zalewy, ale do celow. Liczone raz na decyzje, nie raz na kandydata.
  const open = game.objectives.length ? openObjectives(game, game.currentFaction) : [];
  const toObjective = open.length ? distanceField(open, game.terrain, game.boardSize) : null;
  const freeRelics = game.relics.filter((r) => !r.carrier);
  const toRelic = freeRelics.length ? distanceField(freeRelics, game.terrain, game.boardSize) : null;
  const homeRow = game.relics.length ? game.homeRowOf(game.currentFaction) : null;
  // A leader may only play it safe while someone else can still do the
  // fighting; once the healthy rank and file are gone it has to commit.
  const leaderMayHide = myUnits.some((u) => !u.type.isLeader && !u.isWounded);
  const add = (score, action) => {
    if (score > 0) out.push({ score, action });
  };

  for (const unit of myUnits) {
    const here = distanceTo(unit.x, unit.z);


    // --- attack -------------------------------------------------------
    if (game.canAttack(unit)) {
      const p = game.previewAttack(unit);
      if (p) {
        const s = p.lethal ? SCORE.kill : p.wounds ? SCORE.wound : SCORE.disarm;
        add(s, { type: 'attack', unit });
      }
    }

    // --- turn ---------------------------------------------------------
    // Only ever worth it if it lines up an attack we can still pay for this
    // turn. Without that condition the AI burns whole turns rotating for no
    // reason — which is exactly what it used to do.
    // Cost of the turn itself plus the 1 AP for the blow it sets up. Under
    // the 'freestep' economy the turn is free, so lining up an attack needs
    // only the attack's own AP.
    const turnCost = game.economy === 'freestep' ? 0 : 1;
    if (game.canTurn(unit)) {
      const threat = enemies.find((e) => threatensTile(game, e, unit));
      for (const cw of [true, false]) {
        const facing = nextDir(unit.facing, cw);
        if (game.ap >= turnCost + 1 && couldAttackFacing(game, unit, facing)) {
          add(SCORE.turnIntoAttack, { type: 'turn', unit, cw });
        }
        // Darmowy obrot przodem do tego, kto zaraz uderzy. Kosztuje tylko
        // darmowa akcje tej kostki, a zamienia trafienie w bok na trafienie
        // w front — czyli o jeden cios wiecej zycia.
        if (
          profile.faceThreat && turnCost === 0 && threat &&
          game._compassDirTo(unit, threat) === facing &&
          game._compassDirTo(unit, threat) !== unit.facing
        ) {
          add(SCORE.faceTheThreat, { type: 'turn', unit, cw });
        }
      }
    }

    // --- step ---------------------------------------------------------
    for (const dir of DIR_ORDER) {
      if (!game.canStep(unit, dir)) continue;
      if (isImmediateReversal(unit, 'step', dir)) continue;
      const d = DIRECTION_VECTORS[dir];
      const nx = unit.x + d.x;
      const nz = unit.z + d.z;
      const there = distanceTo(nx, nz);
      let score =
        positionalScore(unit, here, there, SCORE.closePerTile, leaderMayHide) +
        engagementBonus(unit.topLabel, there === 1) +
        objectivePull(game, unit, { x: nx, z: nz }, { toObjective, toRelic, homeRow });
      if (profile.danger) score += dangerAt(game, unit, { x: nx, z: nz }, enemies);
      // A rallying commander wants to be within reach of its own troops,
      // because that is the only way the aura pays anything at all.
      if (unit.type.isLeader && game.rallyMode !== 'none' && game.rallyMode !== 'army') {
        const buffed = myUnits.some(
          (a) => a !== unit && !a.isWounded && Math.abs(a.x - nx) + Math.abs(a.z - nz) <= (game.rallyMode === 'aura2' ? 2 : 1)
        );
        if (buffed) score += SCORE.leaderNearAlly;
      }
      add(score, { type: 'step', unit, dir });
    }

    // --- roll in place --------------------------------------------------
    // The way to arm yourself without giving up contact. Only worth AP when
    // it actually produces an attack face and there is someone next to you
    // to use it on; otherwise a travelling roll is the better buy because it
    // also covers ground.
    if (game.canRollInPlace(unit)) {
      for (const dir of DIR_ORDER) {
        const newTop = unit.topAfterTurning(dir);
        if (couldAttackAfterTip(game, unit, dir)) {
          add(SCORE.rollIntoAttack + SCORE.holdContact, { type: 'rollInPlace', unit, dir });
        }
        // A leader parked out of reach should be rallying: one turn of the
        // die buys the whole army +1 AP every turn it keeps that face up,
        // and turning in place means it never has to leave its safe square.
        // Without this the rally faces were dead weight — measured at 0 uses
        // across a whole game.
        if (unit.type.isLeader && here > LEADER_KEEP_AWAY && RALLY_LABELS.has(newTop)) {
          add(SCORE.rally, { type: 'rollInPlace', unit, dir });
        }
        // Stoisz na kapliczce, ale z bronią w górze — czyli nie punktujesz.
        // Przekręcenie się na cokolwiek innego jest tutaj ruchem punktującym.
        // To jest ta zasada w działaniu: nie da się jednocześnie trzymać pola
        // i grozić z niego, bo góra kostki jest jedna.
        if (
          game.objectives.some((o) => o.x === unit.x && o.z === unit.z) &&
          ATTACK_LABELS.has(unit.topLabel) &&
          !ATTACK_LABELS.has(newTop)
        ) {
          add(SCORE.holdObjectiveFace, { type: 'rollInPlace', unit, dir });
        }
        // Ktos moze mnie tu uderzyc, a ja stoje z opuszczona garda. Podniesc.
        // Warte tylko wtedy, gdy trafienie faktycznie boli: rannej kostki
        // garda i tak nie uratuje, a stojacej juz w gardzie nie ma po co
        // podnosic drugi raz.
        // Ktos moze mnie tu uderzyc, a ja stoje z opuszczona garda.
        // ALE: garda zatrzymuje wylacznie cios od FRONTU, a atakujacy sam
        // wybiera, skad przyjdzie. Podnoszenie jej przeciw komukolwiek
        // wyszlo na pomiarze neutralne-do-gorszego (48,3% vs 51,7%), bo
        // kosztowalo AP przeciw wrogowi, ktory i tak obejdzie. Warto tylko
        // wtedy, gdy zagrozenie stoi dokladnie na linii, w ktora patrzymy.
        if (
          profile.guardUp && newTop === 'Guard' && unit.topLabel !== 'Guard' && !unit.isWounded &&
          enemies.some((e) => threatensTile(game, e, unit) && game._compassDirTo(unit, e) === unit.facing)
        ) {
          add(SCORE.guardUpUnderThreat, { type: 'rollInPlace', unit, dir });
        }
      }
    }

    // --- roll ---------------------------------------------------------
    for (const dir of DIR_ORDER) {
      if (!game.canRoll(unit, dir)) continue;
      if (isImmediateReversal(unit, 'roll', dir)) continue;
      const d = DIRECTION_VECTORS[dir];
      const nx = unit.x + d.x; // a roll always covers exactly one tile
      const nz = unit.z + d.z;
      const there = distanceTo(nx, nz);
      const newTop = unit.topAfterTurning(dir);
      let score =
        positionalScore(unit, here, there, SCORE.rollClosePerTile, leaderMayHide) +
        // Uwaga: przyciąganie liczone dla ŚCIANY, KTÓRA WYPADNIE po tym
        // przewrocie, nie dla obecnej — inaczej AI wjeżdżałoby na kapliczkę
        // przewrotem, który stawia mu na wierzchu broń, i nie punktowało.
        objectivePull(game, { ...unit, topLabel: newTop }, { x: nx, z: nz },
                      { toObjective, toRelic, homeRow });
      // Przewrot zmienia sciane, wiec i to, czy garda bedzie w gorze na
      // polu docelowym — zagrozenie liczymy dla sciany, ktora WYPADNIE.
      if (profile.danger) score += dangerAt(game, unit, { x: nx, z: nz }, enemies, newTop);
      // Arming yourself is the main reason to spend 2 AP on a roll — and it
      // has to outweigh the step back it costs. Changing your face REQUIRES
      // moving, so a unit standing next to an enemy can only arm itself by
      // giving up the contact for a turn. Without this the whole army froze
      // in place around an enemy with Guard up: every roll looked like a
      // retreat, so nobody ever drew a weapon.
      if (ATTACK_LABELS.has(newTop) && there <= 2) score += SCORE.rollIntoAttack;
      score += engagementBonus(newTop, there === 1);
      add(score, { type: 'roll', unit, dir });
    }
  }
  return out;
}

/** Decide ONE action for the current player, or null when nothing is worth
 *  doing (the caller should then end the turn). */
/** 'plain' to zachowanie sprzed tej zmiany — zostaje, zeby dalo sie zmierzyc
 *  jedno przeciw drugiemu zamiast uwierzyc, ze nowe jest lepsze. */
export const AI_PROFILES = {
  plain: { danger: false, guardUp: false, faceThreat: false },
  careful: { danger: true, guardUp: false, faceThreat: false },
  // ODRZUCONE pomiarem — patrz komentarz przy guardUpUnderThreat. Zostaje
  // przelaczalne, zeby wynik dalo sie powtorzyc, nie zeby go uzywac.
  guarded: { danger: true, guardUp: true, faceThreat: false },
  facing: { danger: true, guardUp: false, faceThreat: true },
};

export function decideAiAction(game, profile = AI_PROFILES.facing) {
  const enemyFaction = game.currentFaction === 'humans' ? 'orcs' : 'humans';
  const myUnits = game.aliveUnits(game.currentFaction);
  const enemies = game.aliveUnits(enemyFaction);
  if (!enemies.length || !myUnits.length) return null;

  const candidates = scoreCandidates(game, myUnits, enemies, profile);
  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  const { action } = candidates[0];
  if (action.type === 'step' || action.type === 'roll') {
    lastMove.set(action.unit, { type: action.type, dir: action.dir });
  }
  return action;
}
