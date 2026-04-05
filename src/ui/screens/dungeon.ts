// dungeon.ts — 던전 화면 (목록 + 전투)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { CombatState, DungeonDef } from '../../models/dungeon';
import type { CombatSkillState } from '../../systems/skill-combat';
import {
  rollInitialSkills,
  canUseSkill,
  useSkill,
  tickPreDelay,
  tickEffects,
  getBuffedAttack,
  getBuffedDefense,
  getEnemyAttackMod,
} from '../../systems/skill-combat';

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
  let skillState: CombatSkillState | null = null;
  let selectedDungeon: DungeonDef | null = null;
  let combatMessages: string[] = [];

  // ------------------------------------------------------------------ list --

  function renderList(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>던전</h2>
      ${allDungeons.length === 0
        ? '<p class="hint">접근 가능한 던전이 없습니다.</p>'
        : `<div class="dungeon-list">
            ${allDungeons.map((d, i) => {
              const stars = ds.calcDifficultyStars(d);
              const progress = p.getDungeonProgress(d.id);
              return `<button class="btn dungeon-item" data-idx="${i}">
                <div class="dungeon-name">${i + 1}. ${d.name}</div>
                <div class="dungeon-meta">
                  <span>난이도: ${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}</span>
                  <span>진행: ${progress}%</span>
                </div>
                <div class="dungeon-desc">${d.description}</div>
              </button>`;
            }).join('')}
          </div>`
      }
      <p class="hint">1~9 선택, Esc 뒤로</p>
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

  // ----------------------------------------------------------------- combat --

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
      combatLog: [`${enemy.name}이(가) 나타났다!`],
    };
    combatMessages = [];

    // Initialise skill system — rollInitialSkills uses actor.skillOrder / learnedSkills
    skillState = rollInitialSkills(p);

    phase = 'combat';

    session.backlog.add(
      session.gameTime,
      `${p.name}이(가) ${dungeon.name}에 입장했다.`,
      '행동',
    );

    renderCombat(el);
  }

  function renderCombat(el: HTMLElement) {
    if (!combatState || !selectedDungeon || !skillState) return;
    el.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-combat-screen';

    const cs = combatState;
    const ss = skillState;

    const enemyHpPct = Math.max(0, Math.round((cs.enemyHp / cs.currentEnemy.hp) * 100));
    const playerHpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);
    const maxMp = p.getEffectiveMaxMp();
    const mpPct = Math.round((p.base.mp / maxMp) * 100);

    // Buff / debuff tags
    const buffTags = ss.activeBuffs.map(b =>
      `<span class="buff-tag">${b.type} ${b.turnsLeft}턴</span>`
    ).join('');
    const debuffTags = ss.activeDebuffs.map(d =>
      `<span class="debuff-tag">${d.type} ${d.turnsLeft}턴</span>`
    ).join('');

    // Skill slot buttons (3 + flee)
    const skillBtns = ss.slots.map((def, i) => {
      if (!def) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div>
          <div class="skill-key">[${i + 1}]</div>
        </button>`;
      }
      const blocked = ss.preDelayTurns > 0 || ss.postDelayTurns > 0;
      const noMp = p.base.mp < def.mpCost;
      const noTp = def.tpCost > 0 && p.base.vigor < def.tpCost * 20;
      const disabled = blocked || noMp || noTp;
      const tpLabel = def.tpCost > 0 ? ` TP${def.tpCost}` : '';
      return `<button class="btn skill-btn${disabled ? ' disabled' : ''}" data-slot="${i}"${disabled ? ' disabled' : ''}>
        <div class="skill-name">${def.name}</div>
        <div class="skill-cost">MP${def.mpCost}${tpLabel}</div>
        <div class="skill-key">[${i + 1}]</div>
      </button>`;
    }).join('');

    // Delay indicator
    let delayHtml = '';
    if (ss.preDelayTurns > 0) {
      delayHtml = `<div class="delay-indicator">준비 중... (${ss.preDelayTurns}턴)</div>`;
    } else if (ss.postDelayTurns > 0) {
      delayHtml = `<div class="delay-indicator">회복 중... (${ss.postDelayTurns}턴)</div>`;
    }

    wrap.innerHTML = `
      <div class="combat-header">
        <h2>${selectedDungeon.name} - 전투</h2>
        <span class="combat-turn">Turn ${cs.combatTurn}</span>
      </div>

      <div class="combat-enemy">
        <div class="combat-name">${cs.currentEnemy.name}</div>
        <div class="stat-bar">
          <div class="bar"><div class="bar-fill enemy-hp-bar" style="width:${enemyHpPct}%"></div></div>
          <span class="stat-val">${Math.max(0, Math.round(cs.enemyHp))}/${cs.currentEnemy.hp}</span>
        </div>
        <div class="combat-debuffs">${debuffTags}</div>
      </div>

      <div class="combat-player">
        <div class="combat-name">${p.name}</div>
        <div class="stat-bar">
          <div class="bar"><div class="bar-fill hp-bar" style="width:${playerHpPct}%"></div></div>
          <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
        </div>
        <div style="display:flex;gap:12px;font-size:12px;margin-top:4px">
          <span>MP: ${Math.round(p.base.mp)}/${maxMp}
            <span style="display:inline-block;width:${mpPct}px;max-width:60px;height:4px;background:var(--accent2);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
          </span>
          <span style="color:var(--warning)">기력: ${Math.round(p.base.vigor)}/${Math.round(p.getEffectiveMaxVigor())}</span>
        </div>
        <div class="combat-buffs">${buffTags}</div>
      </div>

      <div class="combat-log">
        ${cs.combatLog.slice(-6).map(l => `<div class="log-entry">${l}</div>`).join('')}
        ${combatMessages.map(m => `<div class="log-msg">${m}</div>`).join('')}
      </div>

      ${delayHtml}

      <div class="skill-slots">
        ${skillBtns}
        <button class="btn skill-btn flee-btn" data-action="flee">
          <div class="skill-name">도주</div>
          <div class="skill-key">[Esc]</div>
        </button>
      </div>

      <p class="hint">1/2/3=스킬 사용 (자동 공격 진행) Esc=도주</p>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.slot!, 10);
        handleSkillUse(slot, el);
      });
    });

    wrap.querySelector('[data-action="flee"]')?.addEventListener('click', () => {
      handleFlee(el);
    });

    el.appendChild(wrap);
  }

  /**
   * Execute one full auto-attack turn (player + enemy), tick effects,
   * apply pending skill activation if preDelay reaches 0.
   * Returns false if combat ended.
   */
  function executeCombatTurn(el: HTMLElement): boolean {
    if (!combatState || !selectedDungeon || !skillState) return false;

    const cs = combatState;
    const ss = skillState;
    // --- Pre-delay tick (may activate pending skill) ---
    const preDelayMessages = tickPreDelay(p, cs, ss);
    for (const msg of preDelayMessages) cs.combatLog.push(msg);

    // --- Player auto-attack ---
    const buffedAtk = getBuffedAttack(p.getEffectiveAttack(), ss);
    const buffedDef = getBuffedDefense(p.getEffectiveDefense(), ss);
    const enemyAtkMult = getEnemyAttackMod(ss); // multiplier: 1.0 = normal, <1 = weakened

    const result = ds.simulateCombatTurn(
      buffedAtk,
      buffedDef,
      p.base.hp,
      p.color.values,
      cs,
    );

    cs.combatLog.push(`${p.name}의 공격! ${result.damageDealt} 데미지`);

    // --- Enemy dead? ---
    if (result.enemyDead) {
      cs.combatLog.push(`${cs.currentEnemy.name}을(를) 쓰러뜨렸다!`);
      const expGain = 20 + selectedDungeon.difficulty * 10;
      const goldGain = 10 + selectedDungeon.difficulty * 5;
      p.addGold(goldGain);
      const leveledUp = p.gainExp(expGain);
      p.addDungeonProgress(selectedDungeon.id, selectedDungeon.progressPerAdvance);
      session.backlog.add(
        session.gameTime,
        `${p.name}이(가) ${cs.currentEnemy.name}을(를) 토벌했다. EXP+${expGain}, ${goldGain}G 획득`,
        '행동',
      );
      combatMessages.push(`승리! EXP+${expGain}, ${goldGain}G`);
      if (leveledUp) combatMessages.push(`레벨 업! Lv.${p.base.level}`);
      session.gameTime.advance(30);
      p.adjustVigor(-10);
      const progress = p.getDungeonProgress(selectedDungeon.id);
      combatMessages.push(`진행도: ${progress}%`);
      cs.combatLog.push(...combatMessages);
      combatMessages = [];
      showContinueChoice(el);
      return false;
    }

    // --- Enemy counter-attack (weaken multiplier applied) ---
    const rawEnemyAtk = Math.max(0, Math.round(result.damageTaken * enemyAtkMult));
    p.adjustHp(-rawEnemyAtk);
    p.adjustVigor(-result.vigorCost);
    if (rawEnemyAtk > 0) {
      cs.combatLog.push(`${cs.currentEnemy.name}의 반격! ${rawEnemyAtk} 데미지`);
    }

    // --- Tick effects (poison etc.) — returns log messages ---
    const effectMessages = tickEffects(ss, cs);
    for (const msg of effectMessages) cs.combatLog.push(msg);

    // Check if enemy died from poison
    if (cs.enemyHp <= 0) {
      cs.combatLog.push(`${cs.currentEnemy.name}을(를) 쓰러뜨렸다!`);
      const expGain = 20 + selectedDungeon.difficulty * 10;
      const goldGain = 10 + selectedDungeon.difficulty * 5;
      p.addGold(goldGain);
      const leveledUp = p.gainExp(expGain);
      p.addDungeonProgress(selectedDungeon.id, selectedDungeon.progressPerAdvance);
      session.backlog.add(session.gameTime, `${p.name}이(가) ${cs.currentEnemy.name}을(를) 토벌했다. EXP+${expGain}, ${goldGain}G 획득`, '행동');
      combatMessages.push(`승리! EXP+${expGain}, ${goldGain}G`);
      if (leveledUp) combatMessages.push(`레벨 업! Lv.${p.base.level}`);
      session.gameTime.advance(30);
      p.adjustVigor(-10);
      combatMessages.push(`진행도: ${p.getDungeonProgress(selectedDungeon.id)}%`);
      cs.combatLog.push(...combatMessages);
      combatMessages = [];
      showContinueChoice(el);
      return false;
    }

    // --- Player dead? ---
    if (result.playerDead || p.base.hp <= 0) {
      cs.combatLog.push(`${p.name}이(가) 쓰러졌다...`);
      p.base.hp = Math.max(1, p.getEffectiveMaxHp() * 0.1);
      session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 패배했다.`, '행동');
      combatMessages.push('패배... 간신히 살아남.');
      phase = 'list';
      combatState = null;
      skillState = null;
      selectedDungeon = null;
      renderList(el);
      return false;
    }

    return true;
  }

  function handleSkillUse(slot: number, el: HTMLElement) {
    if (!combatState || !skillState) return;

    const ss = skillState;
    const def = ss.slots[slot];
    combatMessages = [];

    // canUseSkill takes (skillDef, actor, state); if no def in slot, bail
    if (!def || !canUseSkill(def, p, ss).ok) {
      renderCombat(el);
      return;
    }

    // useSkill handles resource deduction, pre/post delay setup, rerollSlot, and returns log messages
    const msgs = useSkill(slot, p, combatState, ss);
    for (const msg of msgs) combatState.combatLog.push(msg);

    // Execute the auto-attack turn (tickPreDelay inside will handle pending activation)
    const ongoing = executeCombatTurn(el);
    if (ongoing) renderCombat(el);
  }

  function handleFlee(el: HTMLElement) {
    if (!combatState) return;
    combatState.combatLog.push(`${p.name}이(가) 도주했다!`);
    session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 도주했다.`, '행동');
    phase = 'list';
    combatState = null;
    skillState = null;
    selectedDungeon = null;
    renderList(el);
  }

  // --------------------------------------------------------- continue screen --

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
      skillState = null;
      selectedDungeon = null;
      renderList(el);
    });

    el.appendChild(wrap);
  }

  // ------------------------------------------------------------------ screen --

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
          handleFlee(container);
        } else if (phase === 'continue') {
          session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedDungeon?.name ?? '던전'}에서 후퇴했다.`, '행동');
          phase = 'list';
          combatState = null;
          skillState = null;
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
          skillState = null;
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
        if (key === '1') handleSkillUse(0, container);
        else if (key === '2') handleSkillUse(1, container);
        else if (key === '3') handleSkillUse(2, container);
      }
    },
  };
}
