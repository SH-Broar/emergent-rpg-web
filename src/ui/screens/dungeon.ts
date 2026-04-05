// dungeon.ts — 던전 화면 (목록 + 전투)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { CombatState, DungeonDef } from '../../models/dungeon';

type DungeonPhase = 'list' | 'combat' | 'continue';

export function createDungeonScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const ds = session.dungeonSystem;
  const allDungeons = ds.getAllDungeons().filter(d => d.accessFrom === p.currentLocation);

  let phase: DungeonPhase = 'list';
  let combatState: CombatState | null = null;
  let selectedDungeon: DungeonDef | null = null;
  let combatMessages: string[] = [];

  function renderList(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>\u2190 \ub4a4\ub85c [Esc]</button>
      <h2>\ub358\uc804</h2>
      ${allDungeons.length === 0
        ? '<p class="hint">\uc811\uadfc \uac00\ub2a5\ud55c \ub358\uc804\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>'
        : `<div class="dungeon-list">
            ${allDungeons.map((d, i) => {
              const stars = ds.calcDifficultyStars(d);
              const progress = p.getDungeonProgress(d.id);
              return `<button class="btn dungeon-item" data-idx="${i}">
                <div class="dungeon-name">${i + 1}. ${d.name}</div>
                <div class="dungeon-meta">
                  <span>\ub09c\uc774\ub3c4: ${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}</span>
                  <span>\uc9c4\ud589: ${progress}%</span>
                </div>
                <div class="dungeon-desc">${d.description}</div>
              </button>`;
            }).join('')}
          </div>`
      }
      <p class="hint">1~9 \uc120\ud0dd, Esc \ub4a4\ub85c</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', onDone);
    wrap.querySelectorAll<HTMLButtonElement>('[data-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx!, 10);
        startCombat(idx, el);
      });
    });

    el.appendChild(wrap);
  }

  function startCombat(dungeonIdx: number, el: HTMLElement) {
    const dungeon = allDungeons[dungeonIdx];
    if (!dungeon) return;
    selectedDungeon = dungeon;

    const enemy = ds.selectEnemy(dungeon, p.getDungeonProgress(dungeon.id));
    combatState = {
      dungeonId: dungeon.id,
      combatTurn: 0,
      currentEnemy: enemy,
      enemyHp: enemy.hp,
      combatLog: [`${enemy.name}\uc774(\uac00) \ub098\ud0c0\ub0ac\ub2e4!`],
    };
    combatMessages = [];
    phase = 'combat';

    session.backlog.add(
      session.gameTime,
      `${p.name}\uc774(\uac00) ${dungeon.name}\uc5d0 \uc785\uc7a5\ud588\ub2e4.`,
      '\ud589\ub3d9',
    );

    renderCombat(el);
  }

  function renderCombat(el: HTMLElement) {
    if (!combatState || !selectedDungeon) return;
    el.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-combat-screen';

    const enemyHpPct = Math.max(0, Math.round((combatState.enemyHp / combatState.currentEnemy.hp) * 100));
    const playerHpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);

    wrap.innerHTML = `
      <div class="combat-header">
        <h2>${selectedDungeon.name} - \uc804\ud22c</h2>
        <span class="combat-turn">Turn ${combatState.combatTurn}</span>
      </div>

      <div class="combat-enemy">
        <div class="combat-name">${combatState.currentEnemy.name}</div>
        <div class="stat-bar">
          <span class="stat-label">HP</span>
          <div class="bar"><div class="bar-fill enemy-hp-bar" style="width:${enemyHpPct}%"></div></div>
          <span class="stat-val">${Math.max(0, Math.round(combatState.enemyHp))}/${combatState.currentEnemy.hp}</span>
        </div>
      </div>

      <div class="combat-player">
        <div class="combat-name">${p.name}</div>
        <div class="stat-bar">
          <span class="stat-label">HP</span>
          <div class="bar"><div class="bar-fill hp-bar" style="width:${playerHpPct}%"></div></div>
          <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
        </div>
      </div>

      <div class="combat-log">
        ${combatState.combatLog.slice(-6).map(l => `<div class="log-entry">${l}</div>`).join('')}
        ${combatMessages.map(m => `<div class="log-msg">${m}</div>`).join('')}
      </div>

      <div class="button-grid combat-actions">
        <button class="btn action-button btn-primary" data-caction="attack">
          <span class="action-label">\uacf5\uaca9</span>
          <span class="key-hint">[1]</span>
        </button>
        <button class="btn action-button" data-caction="skill">
          <span class="action-label">\uc2a4\ud0ac</span>
          <span class="key-hint">[2]</span>
        </button>
        <button class="btn action-button" data-caction="flee">
          <span class="action-label">\ub3c4\uc8fc</span>
          <span class="key-hint">[3]</span>
        </button>
      </div>
      <p class="hint">1=\uacf5\uaca9 2=\uc2a4\ud0ac 3=\ub3c4\uc8fc Esc=\ub4a4\ub85c</p>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-caction]').forEach(btn => {
      btn.addEventListener('click', () => {
        handleCombatAction(btn.dataset.caction as 'attack' | 'skill' | 'flee', el);
      });
    });

    el.appendChild(wrap);
  }

  function handleCombatAction(action: 'attack' | 'skill' | 'flee', el: HTMLElement) {
    if (!combatState || !selectedDungeon) return;

    combatMessages = [];

    if (action === 'flee') {
      combatState.combatLog.push(`${p.name}\uc774(\uac00) \ub3c4\uc8fc\ud588\ub2e4!`);
      session.backlog.add(session.gameTime, `${p.name}\uc774(\uac00) \ub358\uc804\uc5d0\uc11c \ub3c4\uc8fc\ud588\ub2e4.`, '\ud589\ub3d9');
      phase = 'list';
      combatState = null;
      selectedDungeon = null;
      renderList(el);
      return;
    }

    if (action === 'skill') {
      // 스킬: MP 소모하여 1.5x 데미지
      if (p.base.mp < 10) {
        combatMessages.push('MP\uac00 \ubd80\uc871\ud569\ub2c8\ub2e4!');
        renderCombat(el);
        return;
      }
      p.adjustMp(-10);
    }

    const attackMultiplier = action === 'skill' ? 1.5 : 1.0;
    const result = ds.simulateCombatTurn(
      p.getEffectiveAttack() * attackMultiplier,
      p.getEffectiveDefense(),
      p.base.hp,
      p.color.values,
      combatState,
    );

    const actionLabel = action === 'skill' ? '\uc2a4\ud0ac \uacf5\uaca9' : '\uacf5\uaca9';
    combatState.combatLog.push(
      `${p.name}\uc758 ${actionLabel}! ${result.damageDealt} \ub370\ubbf8\uc9c0`,
    );

    if (result.enemyDead) {
      combatState.combatLog.push(`${combatState.currentEnemy.name}\uc744(\ub97c) \uc4f0\ub7ec\ub728\ub838\ub2e4!`);
      const expGain = 20 + selectedDungeon.difficulty * 10;
      const goldGain = 10 + selectedDungeon.difficulty * 5;
      p.addGold(goldGain);
      const leveledUp = p.gainExp(expGain);
      p.addDungeonProgress(selectedDungeon.id, selectedDungeon.progressPerAdvance);
      session.backlog.add(
        session.gameTime,
        `${p.name}\uc774(\uac00) ${combatState.currentEnemy.name}\uc744(\ub97c) \ud1a0\ubc8c\ud588\ub2e4. EXP+${expGain}, ${goldGain}G \ud68d\ub4dd`,
        '\ud589\ub3d9',
      );
      combatMessages.push(`\uc2b9\ub9ac! EXP+${expGain}, ${goldGain}G`);
      if (leveledUp) {
        combatMessages.push(`\ub808\ubca8 \uc5c5! Lv.${p.base.level}`);
      }
      session.gameTime.advance(30);
      p.adjustVigor(-10);

      // 전투 승리 — 계속 진행할지 선택
      const progress = p.getDungeonProgress(selectedDungeon.id);
      combatMessages.push(`진행도: ${progress}%`);
      combatState.combatLog.push(...combatMessages);
      combatMessages = [];
      showContinueChoice(el);
      return;
    }

    // 적 반격
    p.adjustHp(-result.damageTaken);
    p.adjustVigor(-result.vigorCost);
    if (result.damageTaken > 0) {
      combatState.combatLog.push(
        `${combatState.currentEnemy.name}\uc758 \ubc18\uaca9! ${result.damageTaken} \ub370\ubbf8\uc9c0`,
      );
    }

    if (result.playerDead || p.base.hp <= 0) {
      combatState.combatLog.push(`${p.name}\uc774(\uac00) \uc4f0\ub7ec\uc84c\ub2e4...`);
      p.base.hp = Math.max(1, p.getEffectiveMaxHp() * 0.1);
      session.backlog.add(session.gameTime, `${p.name}\uc774(\uac00) \ub358\uc804\uc5d0\uc11c \ud328\ubc30\ud588\ub2e4.`, '\ud589\ub3d9');
      combatMessages.push('\ud328\ubc30... \uac04\uc2e0\ud788 \uc0b4\uc544\ub0a8.');
      phase = 'list';
      combatState = null;
      selectedDungeon = null;
      renderList(el);
      return;
    }

    renderCombat(el);
  }

  function showContinueChoice(el: HTMLElement) {
    if (!selectedDungeon) return;
    phase = 'continue';
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const progress = p.getDungeonProgress(selectedDungeon.id);
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);

    wrap.innerHTML = `
      <h2>${selectedDungeon.name}</h2>
      <div style="text-align:center;margin:12px 0">
        <p>진행도: ${progress}%</p>
        <div class="stat-bar">
          <span class="stat-label">HP</span>
          <div class="bar"><div class="bar-fill hp-bar" style="width:${hpPct}%"></div></div>
          <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
        </div>
        <p style="color:var(--text-dim);margin-top:8px">기력: ${Math.round(p.base.vigor)}/${Math.round(p.getEffectiveMaxVigor())}</p>
      </div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn btn-primary" data-choice="advance">1. 더 깊이 나아가기</button>
        <button class="btn" data-choice="rest">2. 휴식하기 (HP+10, 기력+20)</button>
        <button class="btn" data-choice="retreat">3. 돌아 나가기</button>
      </div>
      <p class="hint">1=나아가기 2=휴식 3=후퇴</p>
    `;

    wrap.querySelector('[data-choice="advance"]')?.addEventListener('click', () => {
      startCombat(allDungeons.indexOf(selectedDungeon!), el);
    });
    wrap.querySelector('[data-choice="rest"]')?.addEventListener('click', () => {
      p.adjustHp(10);
      p.adjustVigor(20);
      session.gameTime.advance(15);
      session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 휴식했다.`, '행동');
      showContinueChoice(el);
    });
    wrap.querySelector('[data-choice="retreat"]')?.addEventListener('click', () => {
      session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedDungeon!.name}에서 후퇴했다.`, '행동');
      phase = 'list';
      combatState = null;
      selectedDungeon = null;
      renderList(el);
    });

    el.appendChild(wrap);
  }

  return {
    id: 'dungeon',
    render(el) {
      if (phase === 'combat') renderCombat(el);
      else if (phase === 'continue') showContinueChoice(el);
      else renderList(el);
    },
    onKey(key) {
      const container = document.querySelector('.dungeon-combat-screen')?.parentElement
        ?? document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (phase === 'combat') {
          handleCombatAction('flee', container);
        } else if (phase === 'continue') {
          session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedDungeon?.name ?? '던전'}에서 후퇴했다.`, '행동');
          phase = 'list';
          combatState = null;
          selectedDungeon = null;
          renderList(container);
        } else {
          onDone();
        }
        return;
      }

      if (phase === 'continue') {
        if (key === '1') {
          startCombat(allDungeons.indexOf(selectedDungeon!), container);
        } else if (key === '2') {
          p.adjustHp(10);
          p.adjustVigor(20);
          session.gameTime.advance(15);
          session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 휴식했다.`, '행동');
          showContinueChoice(container);
        } else if (key === '3') {
          session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedDungeon?.name ?? '던전'}에서 후퇴했다.`, '행동');
          phase = 'list';
          combatState = null;
          selectedDungeon = null;
          renderList(container);
        }
        return;
      }

      if (phase === 'list') {
        if (/^[1-9]$/.test(key)) {
          const idx = parseInt(key, 10) - 1;
          if (idx < allDungeons.length) {
            startCombat(idx, container);
          }
        }
      } else if (phase === 'combat') {
        if (key === '1') handleCombatAction('attack', container);
        else if (key === '2') handleCombatAction('skill', container);
        else if (key === '3') handleCombatAction('flee', container);
      }
    },
  };
}
