// event-battle.ts — 이벤트 전투 UI 화면
//
// dungeon.ts의 전투 턴 UI를 재활용해 단발 전투를 진행한다.
// pre_battle_dialogue → 전투 → post_victory_dialogue / post_defeat_dialogue 순.

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import {
  RealtimeCombatState, getCombatTickMs,
  createCombatState, stopCombatTimer, processTick, usePlayerSkill,
} from '../../systems/combat-engine';
import { canUseSkill } from '../../systems/skill-combat';
import { getEventBattle, toMonsterDef, type EventBattleDef } from '../../models/event-battle';
import { getItemDef } from '../../types/item-defs';
import { iGa, eulReul } from '../../data/josa';

type Phase = 'intro' | 'combat' | 'victory' | 'defeat';

export function createEventBattleScreen(
  session: GameSession,
  battleIdOrDef: string | EventBattleDef,
  onDone: () => void,
): Screen {
  const p = session.player;
  const def = typeof battleIdOrDef === 'string' ? getEventBattle(battleIdOrDef) : battleIdOrDef;

  function getPartyActors() {
    return session.knowledge.partyMembers
      .map(name => session.actors.find(a => a.name === name))
      .filter((a): a is NonNullable<typeof a> => a !== undefined && a !== null);
  }

  let phase: Phase = 'intro';
  let combatState: RealtimeCombatState | null = null;

  function renderIntro(el: HTMLElement) {
    if (!def) { onDone(); return; }
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <h2>${def.name}</h2>
      <div style="margin:16px 0;padding:12px;background:var(--bg-card);border-radius:8px;font-size:13px;line-height:1.7">
        <p style="color:var(--text-dim);margin-bottom:10px">${def.description}</p>
        ${def.preBattleDialogue ? `<p style="color:var(--warning);font-style:italic">${def.preBattleDialogue}</p>` : ''}
      </div>
      <div style="margin:8px 0;padding:8px;background:var(--bg-panel);border-radius:6px;font-size:12px">
        <div style="color:var(--accent);font-weight:600">상대: ${def.enemyName}</div>
        <div style="color:var(--text-dim);margin-top:4px">HP ${def.enemyMaxHp} · ATK ${def.enemyAttack} · DEF ${def.enemyDefense}</div>
      </div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn btn-primary" data-action="fight">전투 시작 [Enter]</button>
        <button class="btn" data-action="flee">${def.retryAllowed ? '나중에 하기' : '물러나기'} [Esc]</button>
      </div>
    `;
    wrap.querySelector('[data-action="fight"]')?.addEventListener('click', () => startCombat(el));
    wrap.querySelector('[data-action="flee"]')?.addEventListener('click', () => onDone());
    el.appendChild(wrap);
  }

  function startCombat(el: HTMLElement) {
    if (!def) return;
    session.backlog.add(session.gameTime, `${def.name} — ${p.name}${iGa(p.name)} ${def.enemyName}${eulReul(def.enemyName)} 마주했다.`, '이벤트');

    const monster = toMonsterDef(def);
    const partyActors = getPartyActors();
    combatState = createCombatState(p, monster, partyActors, `event_battle:${def.id}`, true);

    phase = 'combat';
    renderCombat(el);
    beginCombatTickLoop(el);
  }

  function runOneCombatTick(el: HTMLElement): void {
    if (!combatState || combatState.finished) {
      if (combatState) stopCombatTimer(combatState);
      return;
    }
    const msgs = processTick(combatState, p);
    for (const m of msgs) combatState.combatLog.push(m);
    if (combatState.finished) {
      stopCombatTimer(combatState);
      if (combatState.victory) handleVictory(el);
      else handleDefeat(el);
    } else {
      renderCombat(el);
    }
  }

  function beginCombatTickLoop(el: HTMLElement): void {
    if (!combatState || combatState.finished) return;
    stopCombatTimer(combatState);
    combatState.tickTimer = setInterval(() => runOneCombatTick(el), getCombatTickMs(p));
  }

  function skipCombatWait(el: HTMLElement): void {
    if (!combatState || combatState.finished) return;
    stopCombatTimer(combatState);
    runOneCombatTick(el);
    if (combatState && !combatState.finished) beginCombatTickLoop(el);
  }

  function renderCombat(el: HTMLElement) {
    if (!combatState || !def) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-combat-screen';

    const cs = combatState;
    const ss = cs.playerSkills;
    const enemyHpPct = Math.max(0, Math.round((cs.enemyHp / cs.enemyMaxHp) * 100));
    const playerHpPct = Math.max(0, Math.min(100, Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100)));
    const mpPct = Math.max(0, Math.min(100, Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100)));

    const skillBtns = ss.slots.map((sdef, i) => {
      if (!sdef) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div><div class="skill-key">[${i + 1}]</div>
        </button>`;
      }
      const blocked = ss.preDelayTurns > 0 || ss.postDelayTurns > 0;
      const cooldown = cs.skillUsedThisTurn;
      const check = canUseSkill(sdef, p, ss);
      const disabled = blocked || cooldown || !check.ok;
      const tpLabel = sdef.tpCost > 0 ? ` TP${sdef.tpCost}` : '';
      return `<button class="btn skill-btn${disabled ? ' disabled' : ''}" data-slot="${i}"${disabled ? ' disabled' : ''}>
        <div class="skill-name">${sdef.name}</div>
        <div class="skill-cost">MP${sdef.mpCost}${tpLabel}</div>
        <div class="skill-key">[${i + 1}]</div>
      </button>`;
    }).join('');

    let delayHtml = '';
    if (ss.preDelayTurns > 0) delayHtml = `<div class="delay-indicator">준비 중... (${ss.preDelayTurns}턴)</div>`;
    else if (ss.postDelayTurns > 0) delayHtml = `<div class="delay-indicator">회복 중... (${ss.postDelayTurns}턴)</div>`;

    const partyHtml = cs.partySlots.length > 0
      ? `<div style="font-size:11px;margin-top:4px;color:var(--accent2)">동료: ${cs.partySlots.map(s =>
          `${s.actor.name}(${'★'.repeat(s.hyperionLevel)})`
        ).join(' ')}</div>`
      : '';

    const buffTags = ss.activeBuffs.map(b =>
      `<span class="buff-tag">${b.type === 'attack' ? '공↑' : '방↑'} ${b.turnsLeft}턴</span>`
    ).join('');
    const debuffTags = ss.activeDebuffs.map(d =>
      `<span class="debuff-tag">${d.type} ${d.turnsLeft}턴</span>`
    ).join('');

    wrap.innerHTML = `
      <div class="combat-header">
        <h2>⚔ ${def.name}</h2>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span class="combat-turn">턴 ${cs.turn}</span>
        </div>
      </div>

      <div class="combat-enemy">
        <div class="stat-bar">
          <div class="bar"><div class="bar-fill enemy-hp-bar" style="width:${enemyHpPct}%"></div></div>
          <span class="stat-val">${Math.max(0, Math.round(cs.enemyHp))}/${cs.enemyMaxHp}</span>
        </div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:2px">${cs.enemy.name}</div>
        ${debuffTags ? `<div class="combat-debuffs">${debuffTags}</div>` : ''}
      </div>

      <div class="combat-log">
        ${cs.combatLog.slice(-8).reverse().map(l => {
          const isParty = l.startsWith('★');
          const isEnemy = l.includes('의 공격!') || l.includes('의 ');
          const color = isParty ? 'color:var(--accent2)' : isEnemy ? 'color:var(--warning)' : '';
          return `<div class="log-entry" style="${color}">${l}</div>`;
        }).join('')}
      </div>

      ${delayHtml}

      <div class="combat-player">
        <div class="combat-resource-list">
          <div class="stat-bar combat-stat-bar">
            <span class="combat-stat-label">HP</span>
            <div class="bar"><div class="bar-fill hp-bar combat-player-hp-bar" style="width:${playerHpPct}%"></div></div>
            <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
          </div>
          <div class="stat-bar combat-stat-bar">
            <span class="combat-stat-label">MP</span>
            <div class="bar"><div class="bar-fill combat-player-mp-bar" style="width:${mpPct}%"></div></div>
            <span class="stat-val">${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</span>
          </div>
        </div>
        <div class="combat-tp-line">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</div>
        ${buffTags ? `<div class="combat-buffs">${buffTags}</div>` : ''}
        ${partyHtml}
      </div>

      <div class="skill-slots">
        ${skillBtns}
        <button class="btn skill-btn" data-action="skip-tick">
          <div class="skill-name">Skip</div><div class="skill-key">[Space]</div>
        </button>
      </div>

      <div class="tick-bar">
        <div class="tick-bar-fill" style="animation:tick-countdown ${getCombatTickMs(p)}ms linear forwards;animation-delay:-${Date.now() - cs.lastTickTime}ms"></div>
      </div>
      <p class="hint">1/2/3=스킬 · s=즉시 턴</p>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.slot!, 10);
        handleSkillUse(slot, el);
      });
    });
    wrap.querySelector('[data-action="skip-tick"]')?.addEventListener('click', () => skipCombatWait(el));
    el.appendChild(wrap);
  }

  function handleSkillUse(slot: number, el: HTMLElement) {
    if (!combatState || combatState.finished) return;
    const ss = combatState.playerSkills;
    const sdef = ss.slots[slot];
    if (!sdef || !canUseSkill(sdef, p, ss).ok) return;

    if (sdef.tpCost > 0 && p.hasAp(sdef.tpCost)) {
      session.knowledge.trackVigorSpent(sdef.tpCost);
    }
    const msgs = usePlayerSkill(combatState, slot, p);
    for (const m of msgs) combatState.combatLog.push(m);

    if (combatState.finished) {
      stopCombatTimer(combatState);
      if (combatState.victory) handleVictory(el);
      else handleDefeat(el);
    } else {
      renderCombat(el);
    }
  }

  function handleVictory(el: HTMLElement) {
    if (!def) return;
    // 완료 이벤트 기록
    if (def.onVictoryEvent) {
      session.knowledge.markEventDone(def.onVictoryEvent);
    }
    // 히페리온 플래그 세팅
    if (def.onVictoryHyperionFlag) {
      const [actorName, lvlStr] = def.onVictoryHyperionFlag.split(':').map(s => s.trim());
      const lvl = parseInt(lvlStr, 10);
      const target = session.actors.find(a => a.name === actorName);
      if (target && !Number.isNaN(lvl) && lvl >= 0 && lvl < target.hyperionFlags.length) {
        target.hyperionFlags[lvl] = true;
      }
    }
    // 보상
    if (def.rewardGold > 0) p.addGold(def.rewardGold);
    const rewardLines: string[] = [];
    if (def.rewardItem) {
      p.addItemById(def.rewardItem, 1);
      session.knowledge.discoverItem(def.rewardItem);
      const n = getItemDef(def.rewardItem)?.name ?? def.rewardItem;
      rewardLines.push(`${n} ×1`);
    }

    session.backlog.add(session.gameTime, `${def.name} 승리! ${def.onVictoryEvent ? '(이벤트 플래그: ' + def.onVictoryEvent + ')' : ''}`, '이벤트');

    phase = 'victory';
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <h2>★ 승리!</h2>
      <div style="margin:20px 0;padding:12px;background:var(--bg-card);border-radius:8px;text-align:center">
        ${def.postVictoryDialogue ? `<p style="color:var(--warning);font-style:italic;line-height:1.7">${def.postVictoryDialogue}</p>` : ''}
      </div>
      ${(def.rewardGold > 0 || rewardLines.length > 0) ? `
        <div style="text-align:center;margin:12px 0">
          ${def.rewardGold > 0 ? `<p>${def.rewardGold}G 획득</p>` : ''}
          ${rewardLines.length > 0 ? `<p style="color:var(--accent)">획득: ${rewardLines.join(', ')}</p>` : ''}
        </div>
      ` : ''}
      <button class="btn btn-primary" data-action="close">확인 [Enter]</button>
    `;
    wrap.querySelector('[data-action="close"]')?.addEventListener('click', onDone);
    el.appendChild(wrap);
  }

  function handleDefeat(el: HTMLElement) {
    if (!def) return;
    // 패배: 체력 1로 회복 (던전과 달리 사망이 아님, 재시도 가능)
    p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.2));
    session.backlog.add(session.gameTime, `${def.name} — ${p.name}${iGa(p.name)} 쓰러졌다. 정신을 차리니 현장에서 벗어나 있었다.`, '이벤트');

    phase = 'defeat';
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <h2>패배...</h2>
      <div style="margin:20px 0;padding:12px;background:var(--bg-card);border-radius:8px;text-align:center">
        ${def.postDefeatDialogue ? `<p style="color:var(--warning);font-style:italic;line-height:1.7">${def.postDefeatDialogue}</p>` : ''}
        ${def.retryAllowed ? '<p style="color:var(--text-dim);margin-top:8px">다시 도전할 수 있다.</p>' : ''}
      </div>
      <button class="btn btn-primary" data-action="close">확인 [Enter]</button>
    `;
    wrap.querySelector('[data-action="close"]')?.addEventListener('click', onDone);
    el.appendChild(wrap);
  }

  return {
    id: 'event-battle',
    render(el) {
      switch (phase) {
        case 'combat': renderCombat(el); break;
        case 'victory':
        case 'defeat':
          // victory/defeat 화면은 handleVictory/handleDefeat에서 직접 렌더링되므로
          // 재진입 시에는 intro를 다시 표시하지 않는다. 그냥 닫기.
          onDone();
          break;
        default: renderIntro(el); break;
      }
    },
    onKey(key) {
      const container = document.querySelector('.dungeon-combat-screen')?.parentElement
        ?? document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (phase === 'intro') {
        if (key === 'Enter') {
          (container.querySelector('[data-action="fight"]') as HTMLButtonElement | null)?.click();
        } else if (key === 'Escape') {
          onDone();
        }
      } else if (phase === 'combat') {
        if (key === '1') handleSkillUse(0, container);
        else if (key === '2') handleSkillUse(1, container);
        else if (key === '3') handleSkillUse(2, container);
        else if (key === 's' || key === 'S') skipCombatWait(container);
      } else {
        if (key === 'Enter' || key === 'Escape') onDone();
      }
    },
    onExit() {
      if (combatState) stopCombatTimer(combatState);
    },
  };
}
