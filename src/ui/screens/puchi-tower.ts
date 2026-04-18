// puchi-tower.ts — 푸치 탑 보스 러시 화면

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { MonsterDef, LootEntry } from '../../models/dungeon';
import { rollLoot } from '../../models/dungeon';
import {
  RealtimeCombatState,
  createCombatState,
  stopCombatTimer,
  processTick,
  usePlayerSkill,
  getCombatTickMs,
} from '../../systems/combat-engine';
import { canUseSkill } from '../../systems/skill-combat';
import {
  TOWER_FLOOR_DEFS,
  TOWER_TOTAL_FLOORS,
  TOWER_CHECKPOINT_LOCK_FLOOR,
  getAvailableStartFloors,
} from '../../data/puchi-tower-defs';
import { iGa } from '../../data/josa';

type TowerPhase = 'menu' | 'combat' | 'floor_clear' | 'defeat' | 'all_clear';

export function createPuchiTowerScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  let phase: TowerPhase = 'menu';
  let currentFloor = 1;
  let combatState: RealtimeCombatState | null = null;
  let currentBoss: MonsterDef | null = null;
  let runLoot: LootEntry[] = [];
  let runFloorsCleared = 0;
  let screenEl: HTMLElement | null = null;

  function getTotalHyperion(): number {
    return session.actors.reduce((sum, a) => sum + a.hyperionLevel, 0);
  }

  function getPartyActors() {
    return session.knowledge.partyMembers
      .map(name => session.actors.find(a => a.name === name))
      .filter((a): a is NonNullable<typeof a> => a !== undefined && a !== null);
  }

  function getFloorDef(floor: number) {
    return TOWER_FLOOR_DEFS.find(f => f.floor === floor);
  }

  function getFloorName(floor: number): string {
    return getFloorDef(floor)?.floorName ?? `${floor}층`;
  }

  function getSourceDungeon(floor: number): string {
    return getFloorDef(floor)?.sourceDungeon ?? '';
  }


  function collectFloorLoot(floor: number): void {
    const def = getFloorDef(floor);
    if (!def) return;
    const boss = session.dungeonSystem.getMonster(def.bossId);
    if (!boss) return;
    const drops = rollLoot(boss.lootTable);
    runLoot.push(...drops);
  }

  function giveRunLoot(): string[] {
    const lines: string[] = [];
    const summary = new Map<string, number>();
    for (const entry of runLoot) {
      if (entry.itemId) {
        p.items.set(entry.itemId, (p.items.get(entry.itemId) ?? 0) + entry.amount);
        summary.set(entry.itemId, (summary.get(entry.itemId) ?? 0) + entry.amount);
      } else {
        p.addItem(entry.item, entry.amount);
        const key = String(entry.item);
        summary.set(key, (summary.get(key) ?? 0) + entry.amount);
      }
    }
    for (const [k, v] of summary) {
      lines.push(`${k} x${v}`);
    }
    return lines;
  }

  function updateHighestFloor(floor: number): void {
    if (floor > p.puchiTowerHighestFloor) {
      p.puchiTowerHighestFloor = floor;
    }
  }

  // ================================================================ menu
  function renderMenu(el: HTMLElement): void {
    const highestDisplay = p.puchiTowerHighestFloor > 0 ? `${p.puchiTowerHighestFloor}층` : '미도달';
    const totalHyp = getTotalHyperion();
    const available = getAvailableStartFloors(p.puchiTowerHighestFloor);
    const lockedAt40 = p.puchiTowerHighestFloor >= TOWER_CHECKPOINT_LOCK_FLOOR;

    const floorBtns = available.map(f =>
      `<button class="btn" data-startfloor="${f}" style="min-width:70px">${f}층</button>`,
    ).join('');

    el.innerHTML = `
      <div class="screen info-screen">
        <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
        <h2>🗼 푸치 탑</h2>
        <div style="background:rgba(20,20,40,0.7);border:1px solid #9b59b6;border-radius:8px;padding:14px;margin:12px 0;line-height:1.8">
          <p style="color:#c39bd3;margin:0 0 8px 0">극남서쪽에 솟은 거대한 탑. 도전자들이 층을 올라가며 시련에 맞서는 보스 러시.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div>최고 도달 층: <span style="color:#f1c40f;font-weight:bold">${highestDisplay}</span></div>
            <div>히페리온 총합: <span style="color:#e67e22;font-weight:bold">${totalHyp}</span></div>
            <div>총 층수: <span style="color:#aaaacc">52층</span></div>
          </div>
        </div>
        <div style="background:rgba(20,20,40,0.5);border:1px solid #333355;border-radius:6px;padding:10px;margin-bottom:12px;font-size:11px;color:#aaaacc;line-height:1.6">
          <div>• 보스 러시: 각 층은 보스전으로만 구성됩니다.</div>
          <div>• 선택한 층부터 쓰러질 때까지 연속 전투합니다.</div>
          <div>• 쓰러지면 클리어한 층의 보상을 받고 탑으로 돌아옵니다.</div>
          <div>• 층 클리어 시 HP·MP +10%, TP +1 회복됩니다.</div>
          <div>• 5층 단위 도달 시 그 아래 5층 구간부터 선택 가능합니다.</div>
          ${lockedAt40 ? '<div style="color:#e67e22">• 40층 이상 도달: 반드시 40층부터 시작합니다.</div>' : ''}
        </div>
        <div style="margin-bottom:8px;font-size:12px;color:#9b59b6;font-weight:bold">시작 층 선택</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          ${floorBtns}
        </div>
        <p class="hint">Esc 뒤로</p>
      </div>
    `;

    el.querySelector('[data-back]')?.addEventListener('click', onDone);
    el.querySelectorAll<HTMLButtonElement>('[data-startfloor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const floor = parseInt(btn.dataset.startfloor!, 10);
        runLoot = [];
        runFloorsCleared = 0;
        currentFloor = floor;
        startFloorFight(floor, el);
      });
    });
  }

  function startFloorFight(floor: number, el: HTMLElement): void {
    const def = getFloorDef(floor);
    if (!def) {
      handleAllClear(el);
      return;
    }
    const boss = session.dungeonSystem.getMonster(def.bossId);
    if (!boss) {
      // Boss not found — skip to next or end
      handleAllClear(el);
      return;
    }
    currentBoss = boss;
    currentFloor = floor;
    const party = getPartyActors();
    combatState = createCombatState(p, boss, party, 'puchi_tower', true);
    phase = 'combat';
    renderCombat(el);
    beginCombatTickLoop(el);
  }

  // ================================================================ combat tick loop
  function runOneCombatTick(el: HTMLElement): void {
    if (!combatState || combatState.finished) {
      if (combatState) stopCombatTimer(combatState);
      return;
    }
    const msgs = processTick(combatState, p);
    for (const m of msgs) combatState.combatLog.push(m);

    if (combatState.finished) {
      stopCombatTimer(combatState);
      if (combatState.victory) {
        handleFloorClear(el);
      } else {
        handleDefeat(el);
      }
    } else {
      renderCombat(el);
    }
  }

  function beginCombatTickLoop(el: HTMLElement): void {
    if (!combatState || combatState.finished) return;
    stopCombatTimer(combatState);
    combatState.tickTimer = setInterval(() => {
      runOneCombatTick(el);
    }, getCombatTickMs(p));
  }

  // ================================================================ combat render
  function renderCombat(el: HTMLElement): void {
    if (!combatState || !currentBoss) return;
    const cs = combatState;
    const boss = currentBoss;
    const hpPct = Math.max(0, Math.round((cs.enemyHp / cs.enemyMaxHp) * 100));
    const pHpPct = Math.max(0, Math.min(100, Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100)));
    const pMpPct = Math.max(0, Math.min(100, Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100)));

    const ss = cs.playerSkills;
    const skillBtns = ss.slots.map((skill, i) => {
      if (!skill) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div><div class="skill-key">[${i + 1}]</div>
        </button>`;
      }
      const blocked = ss.preDelayTurns > 0 || ss.postDelayTurns > 0;
      const cooldown = cs.skillUsedThisTurn;
      const check = canUseSkill(skill, p, ss);
      const disabled = blocked || cooldown || !check.ok;
      const tpLabel = skill.tpCost > 0 ? ` TP${skill.tpCost}` : '';
      return `<button class="btn skill-btn${disabled ? ' disabled' : ''}" data-slot="${i}"${disabled ? ' disabled' : ''}>
        <div class="skill-name">${skill.name}</div>
        <div class="skill-cost">MP${skill.mpCost}${tpLabel}</div>
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

    el.innerHTML = `
      <div class="screen info-screen dungeon-combat-screen">
        <div class="combat-header">
          <h2>★ ${getFloorName(currentFloor)}</h2>
          <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
            <button type="button" class="btn" data-action="skip-tick" style="font-size:12px;padding:4px 12px">Skip</button>
            <span class="combat-turn">턴 ${cs.turn}</span>
          </div>
        </div>
        <div style="font-size:11px;color:#aaaacc;margin-bottom:6px">${getSourceDungeon(currentFloor)}</div>

        <div class="combat-enemy">
          <div style="font-weight:bold;color:#e74c3c;margin-bottom:4px">${boss.name} (보스)</div>
          <div class="stat-bar">
            <div class="bar"><div class="bar-fill enemy-hp-bar" style="width:${hpPct}%"></div></div>
            <span class="stat-val">${Math.max(0, Math.round(cs.enemyHp))}/${cs.enemyMaxHp}</span>
          </div>
        </div>

        <div class="combat-log">
          ${cs.combatLog.slice(-8).reverse().map(l => {
            const isEnemy = l.includes('의 공격!') || l.includes('의 ');
            const color = isEnemy ? 'color:var(--warning)' : '';
            return `<div class="log-entry" style="${color}">${l}</div>`;
          }).join('')}
        </div>

        ${delayHtml}

        <div class="combat-player">
          <div class="combat-resource-list">
            <div class="stat-bar combat-stat-bar">
              <span class="combat-stat-label">HP</span>
              <div class="bar"><div class="bar-fill hp-bar combat-player-hp-bar" style="width:${pHpPct}%"></div></div>
              <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
            </div>
            <div class="stat-bar combat-stat-bar">
              <span class="combat-stat-label">MP</span>
              <div class="bar"><div class="bar-fill combat-player-mp-bar" style="width:${pMpPct}%"></div></div>
              <span class="stat-val">${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</span>
            </div>
          </div>
          <div class="combat-tp-line">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</div>
        </div>
        ${partyHtml}

        <div class="skill-slots">
          ${skillBtns}
          <button class="btn skill-btn flee-btn" data-action="retreat">
            <div class="skill-name">물러나기</div><div class="skill-key">[Esc]</div>
          </button>
        </div>

        <div class="tick-bar">
          <div class="tick-bar-fill" style="animation:tick-countdown ${getCombatTickMs(p)}ms linear forwards;animation-delay:-${Date.now() - cs.lastTickTime}ms"></div>
        </div>
        <p class="hint">1/2/3=스킬 · Skip=즉시 턴 · Esc=물러나기</p>
      </div>
    `;

    // Skill buttons
    el.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!combatState) return;
        const slotIdx = parseInt(btn.dataset.slot ?? '0', 10);
        const skillDef = combatState.playerSkills.slots[slotIdx];
        if (skillDef && skillDef.tpCost > 0 && p.hasAp(skillDef.tpCost)) {
          session.knowledge.trackVigorSpent(skillDef.tpCost);
        }
        const msgs = usePlayerSkill(combatState, slotIdx, p);
        for (const m of msgs) combatState.combatLog.push(m);
        renderCombat(el);
      });
    });

    // Skip tick
    el.querySelector('[data-action="skip-tick"]')?.addEventListener('click', () => {
      if (!combatState || combatState.finished) return;
      stopCombatTimer(combatState);
      runOneCombatTick(el);
      if (combatState && !combatState.finished) beginCombatTickLoop(el);
    });

    // Retreat
    el.querySelector('[data-action="retreat"]')?.addEventListener('click', () => {
      if (combatState) stopCombatTimer(combatState);
      handleRetreat(el);
    });
  }

  // ================================================================ floor clear
  function handleFloorClear(el: HTMLElement): void {
    if (combatState) stopCombatTimer(combatState);

    collectFloorLoot(currentFloor);
    runFloorsCleared++;
    updateHighestFloor(currentFloor);

    session.backlog.add(session.gameTime, `푸치 탑 ${getFloorName(currentFloor)} 클리어!`, '행동');

    const nextFloor = currentFloor + 1;
    const isComplete = currentFloor >= TOWER_TOTAL_FLOORS;

    if (isComplete) {
      handleAllClear(el);
      return;
    }

    // Per-floor restore: HP +10%, MP +10%, TP +1
    const hpRestore = Math.round(p.getEffectiveMaxHp() * 0.10);
    const mpRestore = Math.round(p.getEffectiveMaxMp() * 0.10);
    p.adjustHp(hpRestore);
    p.adjustMp(mpRestore);
    p.adjustAp(1);

    phase = 'floor_clear';
    el.innerHTML = `
      <div class="screen info-screen">
        <h2 style="color:#4ecca3">⚔ ${getFloorName(currentFloor)} 클리어!</h2>
        <div style="text-align:center;margin:12px 0">
          <div style="color:#f1c40f;font-size:15px;margin-bottom:8px">최고 도달: ${p.puchiTowerHighestFloor}층</div>
          <div style="color:#aaaacc;font-size:12px;margin-bottom:8px">회복: HP +${hpRestore} | MP +${mpRestore} | TP +1</div>
          <div style="font-size:12px">현재 상태: HP ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())} | MP ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}</div>
        </div>
        <div style="background:rgba(20,20,40,0.7);border:1px solid #333355;border-radius:6px;padding:10px;margin-bottom:12px;font-size:12px;color:#9b59b6">
          다음: ${getFloorName(nextFloor)}
        </div>
        <div class="menu-buttons">
          <button class="btn btn-primary" data-action="next" style="background:linear-gradient(135deg,#6c3483,#9b59b6);border-color:#9b59b6">
            ${nextFloor}층으로 진격
          </button>
          <button class="btn" data-action="retreat">여기서 물러나기</button>
        </div>
      </div>
    `;

    el.querySelector('[data-action="next"]')?.addEventListener('click', () => {
      currentFloor = nextFloor;
      startFloorFight(currentFloor, el);
    });
    el.querySelector('[data-action="retreat"]')?.addEventListener('click', () => {
      handleRetreat(el);
    });
  }

  // ================================================================ retreat (voluntary exit)
  function handleRetreat(el: HTMLElement): void {
    const lootLines = giveRunLoot();
    runLoot = [];
    phase = 'defeat';

    el.innerHTML = `
      <div class="screen info-screen">
        <h2>🗼 등반 종료</h2>
        <div style="text-align:center;margin:16px 0">
          <div style="color:#4ecca3;font-size:16px;margin-bottom:8px">최고 도달: ${p.puchiTowerHighestFloor}층</div>
          <div style="color:#aaaacc;font-size:12px">${runFloorsCleared}층 클리어</div>
        </div>
        ${lootLines.length > 0 ? `
          <div style="background:rgba(20,20,40,0.7);border:1px solid #f1c40f;border-radius:6px;padding:10px;margin-bottom:12px">
            <div style="color:#f1c40f;margin-bottom:6px;font-size:12px">획득 보상</div>
            ${lootLines.map(l => `<div style="font-size:11px;color:#aaaacc">${l}</div>`).join('')}
          </div>
        ` : '<p class="hint">획득 보상 없음</p>'}
        <button class="btn btn-primary" data-action="ok">탑으로 돌아가기 [Enter]</button>
      </div>
    `;

    el.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      p.currentLocation = 'Puchi_Tower';
      onDone();
    });
  }

  // ================================================================ defeat
  function handleDefeat(el: HTMLElement): void {
    if (combatState) stopCombatTimer(combatState);

    // HP to 50% max on defeat
    p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.5));

    const lootLines = giveRunLoot();
    runLoot = [];

    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 푸치 탑 ${currentFloor}층에서 쓰러졌다. 탑 입구로 돌아왔다.`, '행동');

    phase = 'defeat';
    el.innerHTML = `
      <div class="screen info-screen">
        <h2 style="color:#e74c3c">패배...</h2>
        <div style="text-align:center;margin:16px 0">
          <p style="color:#c39bd3">${currentFloor}층에서 쓰러졌다.</p>
          <p style="color:#f1c40f">최고 도달: ${p.puchiTowerHighestFloor}층</p>
          <p style="color:#aaaacc;font-size:12px">${runFloorsCleared}층 클리어</p>
          <p style="font-size:12px">HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</p>
        </div>
        ${lootLines.length > 0 ? `
          <div style="background:rgba(20,20,40,0.7);border:1px solid #f1c40f;border-radius:6px;padding:10px;margin-bottom:12px">
            <div style="color:#f1c40f;margin-bottom:6px;font-size:12px">획득 보상 (클리어한 층)</div>
            ${lootLines.map(l => `<div style="font-size:11px;color:#aaaacc">${l}</div>`).join('')}
          </div>
        ` : '<p class="hint">획득 보상 없음</p>'}
        <button class="btn btn-primary" data-action="ok">탑 입구로 돌아가기 [Enter]</button>
      </div>
    `;

    el.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      p.currentLocation = 'Puchi_Tower';
      onDone();
    });
  }

  // ================================================================ all clear
  function handleAllClear(el: HTMLElement): void {
    if (combatState) stopCombatTimer(combatState);

    // Final floor loot already collected in handleFloorClear before calling here
    // But if called from startFloorFight (boss not found), collect final loot
    collectFloorLoot(currentFloor);
    updateHighestFloor(currentFloor);

    const lootLines = giveRunLoot();
    runLoot = [];

    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 푸치 탑 전 52층을 클리어했다!`, '행동');

    phase = 'all_clear';
    el.innerHTML = `
      <div class="screen info-screen">
        <h2 style="color:#f1c40f">🏆 푸치 탑 완전 정복!</h2>
        <div style="text-align:center;margin:20px 0">
          <p style="color:#9b59b6;font-size:16px">전 52층을 돌파했다!</p>
          <p style="color:#c39bd3">드래곤 리제를 쓰러뜨리고, 탑의 꼭대기에서 세계의 끝을 바라본다.</p>
        </div>
        ${lootLines.length > 0 ? `
          <div style="background:rgba(20,20,40,0.7);border:1px solid #f1c40f;border-radius:6px;padding:10px;margin-bottom:12px">
            <div style="color:#f1c40f;margin-bottom:6px;font-size:12px">전 층 클리어 보상</div>
            ${lootLines.map(l => `<div style="font-size:11px;color:#aaaacc">${l}</div>`).join('')}
          </div>
        ` : ''}
        <button class="btn btn-primary" data-action="ok">탑 입구로 돌아가기 [Enter]</button>
      </div>
    `;

    el.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      p.currentLocation = 'Puchi_Tower';
      onDone();
    });
  }

  return {
    id: 'puchi-tower',
    render(el) {
      screenEl = el;
      phase = 'menu';
      renderMenu(el);
    },
    onKey(key) {
      if (!screenEl) return;
      const el = screenEl;
      if (key === 'Escape') {
        if (phase === 'menu') {
          onDone();
        } else if (phase === 'combat') {
          if (combatState) stopCombatTimer(combatState);
          handleRetreat(el);
        }
      } else if (key === 's') {
        if (phase === 'combat' && combatState && !combatState.finished) {
          stopCombatTimer(combatState);
          runOneCombatTick(el);
          if (combatState && !combatState.finished) beginCombatTickLoop(el);
        }
      } else if (key >= '1' && key <= '3') {
        if (phase === 'combat' && combatState && !combatState.finished) {
          const slotIdx = parseInt(key, 10) - 1;
          const skillDef = combatState.playerSkills.slots[slotIdx];
          if (skillDef && skillDef.tpCost > 0 && p.hasAp(skillDef.tpCost)) {
            session.knowledge.trackVigorSpent(skillDef.tpCost);
          }
          const msgs = usePlayerSkill(combatState, slotIdx, p);
          for (const m of msgs) combatState.combatLog.push(m);
          renderCombat(el);
        }
      } else if (key === 'Enter') {
        if (phase === 'defeat' || phase === 'all_clear') {
          p.currentLocation = 'Puchi_Tower';
          onDone();
        }
      }
    },
    onExit() {
      if (combatState) stopCombatTimer(combatState);
    },
  };
}
