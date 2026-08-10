import { ATTACK_LABELS, UNIT_TYPES, WOUNDED_LABEL, RALLY_LABELS, PUSH_LABELS, RANGE_BY_LABEL } from '../core/units.js';
import { renderCheatSheet } from './cheatsheet.js';
import { renderDebugPanel } from './debugPanel.js';

/** Builds the static HUD skeleton once and returns update functions + action hooks. */
export function createHud(root, actions) {
  root.innerHTML = `
    <div class="topbar">
      <div class="faction-badge humans" id="badge-humans">Humans</div>
      <div class="ap-pips" id="apPips"></div>
      <div class="turn-label" id="turnLabel">Turn 1</div>
      <button id="endTurnBtn">End Turn</button>
      <button id="autoPlayBtn">▶ Auto-Play</button>
      <button id="themeBtn">☀ Light</button>
      <button id="modeBtn">✥ Custom setup</button>
      <button id="cheatBtn">? Rules</button>
      <div class="faction-badge orcs" id="badge-orcs">Orcs</div>
    </div>
    <div class="debugPanel" id="debugPanel"></div>
    <div class="panel" id="unitPanel"><h3>Unit</h3><div class="empty">Click a unit to select it</div></div>
    <div class="deployPanel" id="deployPanel" hidden></div>
    <div class="cheatSheet" id="cheatSheet" hidden></div>
    <div class="log" id="log"></div>
    <div class="hint" id="hint"><b>Point at any die</b> — even an enemy's — and four purple tabs appear on its edges, each naming the face a <b>tip</b> that way would turn up. <b>Double-click a tab</b> on your own die to tip it (2 AP, stays put); the gold <b>corner arrows</b> turn it to face that way (1 AP).<br>Cyan tiles: click to <b>Step</b> (1 AP), double-click to <b>Roll</b> (2 AP) — the tile spells out which one you can afford. Hover anything and hold still for a second to see what it does.</div>
  `;

  root.querySelector('#endTurnBtn').addEventListener('click', () => actions.onEndTurn());
  root.querySelector('#autoPlayBtn').addEventListener('click', () => actions.onToggleAutoPlay());
  root.querySelector('#themeBtn').addEventListener('click', () => actions.onToggleTheme());
  root.querySelector('#cheatBtn').addEventListener('click', () => {
    const sheet = root.querySelector('#cheatSheet');
    sheet.hidden = !sheet.hidden;
    if (!sheet.innerHTML) sheet.innerHTML = renderCheatSheet();
  });

  return {
    setAutoPlayLabel(enabled) {
      const btn = root.querySelector('#autoPlayBtn');
      btn.textContent = enabled ? '⏸ Stop' : '▶ Auto-Play';
      btn.classList.toggle('active', enabled);
    },
    setThemeLabel(theme) {
      root.querySelector('#themeBtn').textContent = theme === 'light' ? '🌙 Dark' : '☀ Light';
    },
    debugPanelEl: root.querySelector('#debugPanel'),
    update(game, selectedUnit, selectedView, deployChoice = null) {
      root.querySelector('#badge-humans').classList.toggle('active', game.currentFaction === 'humans');
      root.querySelector('#badge-orcs').classList.toggle('active', game.currentFaction === 'orcs');
      root.querySelector('#turnLabel').textContent = `Turn ${game.turnNumber} — ${game.currentFaction.toUpperCase()}`;

      const pips = root.querySelector('#apPips');
      pips.innerHTML = '';
      // Render as many pips as the side can actually hold — a rallied leader
      // pushes AP above the base, so size to whichever is larger.
      for (let i = 0; i < Math.max(game.apPerTurn, game.ap); i++) {
        const pip = document.createElement('div');
        pip.className = `ap-pip ${i < game.ap ? `filled ${game.currentFaction}` : ''}`;
        pips.appendChild(pip);
      }

      // Only an onclick here, never an addEventListener as well: the two
      // would BOTH fire, and because this handler is reassigned mid-click the
      // second one ran with the freshly-flipped phase — every click built a
      // custom game and then immediately replaced it with a standard one.
      const deploying = game.phase === 'deploy';
      root.querySelector('#modeBtn').textContent = deploying ? '↺ Standard game' : '✥ Custom setup';
      root.querySelector('#modeBtn').onclick = () =>
        deploying ? actions.onNewStandardGame() : actions.onNewCustomGame();
      renderDeployPanel(root.querySelector('#deployPanel'), game, actions, deployChoice);
      renderUnitPanel(root.querySelector('#unitPanel'), game, selectedUnit, actions);
      renderDebugPanel(root.querySelector('#debugPanel'), selectedUnit, selectedView);

      const log = root.querySelector('#log');
      log.innerHTML = game.log.slice(-40).map((l) => `<div>${escapeHtml(l)}</div>`).join('');
      log.scrollTop = log.scrollHeight;

      if (game.gameOver) {
        showVictory(root, game.winner);
      } else {
        const v = root.querySelector('.victory');
        if (v) v.remove();
      }
    },
  };
}

/** The custom-setup palette: pick a die, click the board to place it, click a
 *  placed die to take it back. Hidden entirely during a normal battle. */
function renderDeployPanel(el, game, actions, chosen) {
  if (game.phase !== 'deploy') {
    el.hidden = true;
    el.innerHTML = ''; // don't leave stale buttons queryable behind a hidden panel
    return;
  }
  el.hidden = false;
  const byFaction = (faction) =>
    Object.values(UNIT_TYPES)
      .filter((t) => t.faction === faction)
      .map(
        (t) =>
          `<button data-deploy="${t.id}" data-faction="${faction}" class="${
            chosen && chosen.unitTypeId === t.id && chosen.faction === faction ? 'chosen' : ''
          }">${t.name}${t.isLeader ? ' ★' : ''}</button>`
      )
      .join('');

  const counts = {
    humans: game.aliveUnits('humans').length,
    orcs: game.aliveUnits('orcs').length,
  };

  el.innerHTML = `
    <h3>Custom setup</h3>
    <p class="deployHint">Pick a die, then click a square to place it. Click a placed die to remove it. Any number, anywhere.</p>
    <div class="deployGroup"><span class="k humans">Humans (${counts.humans})</span>${byFaction('humans')}</div>
    <div class="deployGroup"><span class="k orcs">Orcs (${counts.orcs})</span>${byFaction('orcs')}</div>
    <button id="startBattleBtn" ${game.canStartBattle() ? '' : 'disabled'}>▶ Start battle</button>
    ${game.canStartBattle() ? '' : '<p class="deployHint">Both sides need at least one die.</p>'}
  `;
  el.querySelectorAll('button[data-deploy]').forEach((btn) =>
    btn.addEventListener('click', () => actions.onPickDeployUnit(btn.dataset.deploy, btn.dataset.faction))
  );
  el.querySelector('#startBattleBtn').addEventListener('click', () => actions.onStartBattle());
}

function renderUnitPanel(el, game, unit, actions) {
  if (game.phase === 'deploy') {
    el.innerHTML = `<h3>Unit</h3><div class="empty">Placing dice — start the battle to play.</div>`;
    return;
  }
  if (!unit) {
    el.innerHTML = `<h3>Unit</h3><div class="empty">Click a unit to select it</div>`;
    return;
  }
  const canAct = game.canAct(unit);
  const topLabel = unit.topLabel;
  const isAttack = ATTACK_LABELS.has(topLabel);
  const canAttackNow = game.canAttack(unit);
  const preview = game.previewAttack(unit);

  el.innerHTML = `
    <h3><span style="color:${unit.faction === 'humans' ? 'var(--humans)' : 'var(--orcs)'}">${unit.type.name}</span></h3>
    <div class="faceRow top ${isAttack ? 'attackable' : ''}"><span class="k">TOP (active)</span><span class="v">${topLabel}</span></div>
    <div class="faceRow"><span class="k">Facing</span><span class="v">${unit.facing} · front: ${unit.frontLabel}</span></div>
    <div class="faceRow"><span class="k">AP left</span><span class="v">${unit.alive ? game.ap : '—'}</span></div>
    <div class="actions">
      <div class="actionGroupLabel">Step · 1 AP · keeps top face</div>
      ${['N', 'E', 'S', 'W'].map((dir) => stepButton(game, unit, dir, canAct)).join('')}
      <div class="actionGroupLabel">Roll · 2 AP · changes top face, moves a tile</div>
      ${['N', 'E', 'S', 'W'].map((dir) => rollButton(game, unit, dir, canAct)).join('')}
      <div class="actionGroupLabel">Face · 1 AP · click a corner of the die</div>
      <button data-act="attack" class="attack ${preview?.lethal || preview?.wounds ? 'lethal' : ''}" ${!canAttackNow ? 'disabled' : ''}>Attack (${topLabel})</button>
    </div>
    ${renderAttackPreview(preview)}
  `;

  el.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'step') actions.onStep(unit, btn.dataset.dir);
      if (act === 'roll') actions.onRoll(unit, btn.dataset.dir);
      if (act === 'turn') actions.onTurn(unit, btn.dataset.cw === '1');
      if (act === 'attack') actions.onAttack(unit);
    });
  });
}

/** Spells out what the pending attack would actually do. Without this the
 *  most important fact in the game — whether a hit kills — is invisible,
 *  since it depends on the target's accumulated orientation, not on
 *  anything the player can read off the board. */
function renderAttackPreview(preview) {
  if (!preview) return '';
  const { target, disarms, isFrontal, resultingTop, lethal } = preview;
  if (disarms) {
    return `<div class="atkPreview blocked">vs ${target.type.name}: <b>DISARMS IT</b> — Guard knocked aside (→ ${resultingTop}); the next hit wounds. Flank it to skip this step.</div>`;
  }
  const verdict = lethal
    ? `<b class="kill">KILLS IT</b> — already wounded`
    : `<b class="kill">WOUNDS IT</b> — one more hit kills`;
  return `<div class="atkPreview lethal">vs ${target.type.name} (${isFrontal ? 'frontal' : 'flank'}): ${verdict}</div>`;
}

const DIR_GLYPH = { N: '↑N', E: '→E', S: '↓S', W: '←W' };

function stepButton(game, unit, dir, canAct) {
  const disabled = !canAct || !game.canStep(unit, dir);
  return `<button data-act="step" data-dir="${dir}" class="step" ${disabled ? 'disabled' : ''}>Step ${DIR_GLYPH[dir]}</button>`;
}

function rollButton(game, unit, dir, canAct) {
  const disabled = !canAct || !game.canRoll(unit, dir);
  return `<button data-act="roll" data-dir="${dir}" ${disabled ? 'disabled' : ''}>Roll ${DIR_GLYPH[dir]}</button>`;
}

function showVictory(root, winner) {
  if (root.querySelector('.victory')) return;
  const div = document.createElement('div');
  div.className = 'victory';
  div.innerHTML = `<div class="card ${winner}"><h1>${winner.toUpperCase()} WIN</h1><p>The enemy leader has fallen. Refresh to play again.</p></div>`;
  root.appendChild(div);
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
