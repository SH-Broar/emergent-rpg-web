// dungeon.ts — 던전 화면 (방 기반 탐색 + 실시간 전투)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { DungeonDef, DungeonRunState, DungeonRoom, DungeonEventDef } from '../../models/dungeon';
import { RoomType } from '../../models/dungeon';
import {
  RealtimeCombatState, TICK_MS,
  createCombatState, stopCombatTimer, processTick, usePlayerSkill,
} from '../../systems/combat-engine';
import { canUseSkill } from '../../systems/skill-combat';
import { randomFloat } from '../../types/rng';

type DungeonPhase = 'list' | 'navigate' | 'combat' | 'event' | 'rest' | 'victory' | 'defeat';

export function createDungeonScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const ds = session.dungeonSystem;
  const allDungeons = ds.getAllDungeons().filter(d => d.accessFrom === p.currentLocation);

  let phase: DungeonPhase = 'list';
  let selectedDungeon: DungeonDef | null = null;
  let runState: DungeonRunState | null = null;
  let combatState: RealtimeCombatState | null = null;
  let currentEvent: DungeonEventDef | null = null;
  let eventMessage = '';

  // 동료 목록
  function getPartyActors() {
    return session.knowledge.partyMembers
      .map(name => session.actors.find(a => a.name === name))
      .filter((a): a is NonNullable<typeof a> => a !== undefined && a !== null);
  }

  // ================================================================ list
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
              const maxDepth = ds.calcMaxDepth(d);
              const progress = p.getDungeonProgress(d.id);
              const isCleared = progress >= 100;
              const progressColor = isCleared ? 'var(--success)' : 'var(--warning)';
              const progressLabel = isCleared ? `✦ 클리어 (${progress}%)` : `진행: ${progress}%`;
              const best = p.dungeonBestTurns.get(d.id);
              const bestLabel = best ? `최단: ${best}턴` : '';
              return `<button class="btn dungeon-item" data-idx="${i}" style="${isCleared ? 'border-color:var(--success)' : ''}">
                <div class="dungeon-name">${i + 1}. ${d.name} ${isCleared ? '<span style="color:var(--success);font-size:12px">✦</span>' : ''}</div>
                <div class="dungeon-meta">
                  <span>난이도: ${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}</span>
                  <span>${maxDepth}층</span>
                  <span style="color:${progressColor}">${progressLabel}</span>
                  ${bestLabel ? `<span style="color:var(--warning)">${bestLabel}</span>` : ''}
                </div>
                <div class="dungeon-desc">${isCleared ? d.deepDescription || d.description : d.description}</div>
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
        enterDungeon(idx, el);
      });
    });

    el.appendChild(wrap);
  }

  function enterDungeon(dungeonIdx: number, el: HTMLElement) {
    const dungeon = allDungeons[dungeonIdx];
    if (!dungeon) return;
    selectedDungeon = dungeon;
    const progress = p.getDungeonProgress(dungeon.id);
    runState = ds.createRunState(dungeon, progress);

    session.backlog.add(session.gameTime, `${p.name}이(가) ${dungeon.name}에 입장했다.`, '행동');
    phase = 'navigate';
    renderNavigate(el);
  }

  // ================================================================ navigate
  function renderNavigate(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-navigate';

    const isBossFloor = runState.depth >= runState.maxDepth;
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);
    const mpPct = Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100);

    const roomIcon = (room: DungeonRoom) => {
      switch (room.type) {
        case RoomType.Combat: return '⚔';
        case RoomType.Event: return '✦';
        case RoomType.Rest: return '💤';
      }
    };

    wrap.innerHTML = `
      <h2>${selectedDungeon.name} — ${isBossFloor ? '보스 출현!' : `${runState.depth + 1}층`}</h2>
      <div style="display:flex;gap:12px;font-size:12px;margin:8px 0">
        <span>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}
          <span style="display:inline-block;width:${Math.min(80, hpPct)}px;height:4px;background:var(--hp-color,#e94560);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
        </span>
        <span>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}
          <span style="display:inline-block;width:${Math.min(60, mpPct)}px;height:4px;background:var(--accent2);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
        </span>
        <span style="color:var(--warning)">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</span>
      </div>

      ${isBossFloor ? `
        <div class="menu-buttons" style="margin:16px 0">
          <button class="btn btn-primary" data-choice="boss">1. ${roomIcon(runState.leftRoom)} ${runState.leftRoom.label} [보스]</button>
          <button class="btn" data-choice="retreat">2. ↩ 되돌아가기</button>
        </div>
        <p class="hint">1=보스 도전, 2=후퇴</p>
      ` : `
        <div class="menu-buttons" style="margin:16px 0">
          <button class="btn" data-choice="left">1. ← ${roomIcon(runState.leftRoom)} ${runState.leftRoom.label}</button>
          <button class="btn" data-choice="right">2. → ${roomIcon(runState.rightRoom)} ${runState.rightRoom.label}</button>
          ${runState.hasSidePath ? '<button class="btn" data-choice="side">3. ↗ 샛길 (HP -10%)</button>' : ''}
          <button class="btn" data-choice="retreat">${runState.hasSidePath ? '4' : '3'}. ↩ 되돌아가기</button>
        </div>
        <p class="hint">1=왼쪽, 2=오른쪽${runState.hasSidePath ? ', 3=샛길, 4=후퇴' : ', 3=후퇴'}</p>
      `}

      <div style="font-size:11px;color:var(--text-dim);margin-top:8px">
        진행: ${runState.roomsCleared}방 / 보스: ${runState.maxDepth}층
        ${getPartyActors().length > 0 ? ` | 동료: ${getPartyActors().map(a => `${a.name}(★${a.hyperionLevel})`).join(', ')}` : ''}
      </div>
    `;

    wrap.querySelector('[data-choice="left"]')?.addEventListener('click', () => enterRoom(runState!.leftRoom, false, el));
    wrap.querySelector('[data-choice="right"]')?.addEventListener('click', () => enterRoom(runState!.rightRoom, false, el));
    wrap.querySelector('[data-choice="side"]')?.addEventListener('click', () => handleSidePath(el));
    wrap.querySelector('[data-choice="boss"]')?.addEventListener('click', () => enterRoom(runState!.leftRoom, true, el));
    wrap.querySelector('[data-choice="retreat"]')?.addEventListener('click', () => handleRetreat(el));

    el.appendChild(wrap);
  }

  function enterRoom(room: DungeonRoom, isBoss: boolean, el: HTMLElement) {
    if (!selectedDungeon || !runState) return;

    switch (room.type) {
      case RoomType.Combat:
        startCombat(room, isBoss, el);
        break;
      case RoomType.Event:
        startEvent(room, el);
        break;
      case RoomType.Rest:
        startRest(el);
        break;
    }
  }

  function handleSidePath(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    // HP 10% 소모
    const hpCost = Math.round(p.getEffectiveMaxHp() * 0.1);
    p.adjustHp(-hpCost);

    if (p.base.hp <= 0) {
      handleDefeat(el);
      return;
    }

    // 랜덤 이벤트
    const event = ds.rollDungeonEvent();
    if (event) {
      currentEvent = event;
      eventMessage = `샛길을 탐색했다. (HP -${hpCost})`;
      phase = 'event';
      renderEvent(el);
    } else {
      // 이벤트 없으면 보상 없이 다음 층
      session.backlog.add(session.gameTime, `${p.name}이(가) 샛길을 탐색했지만 아무것도 없었다. (HP -${hpCost})`, '행동');
      advanceToNext(el);
    }
  }

  function handleRetreat(el: HTMLElement) {
    session.backlog.add(session.gameTime, `${p.name}이(가) ${selectedDungeon?.name ?? '던전'}에서 후퇴했다.`, '행동');
    resetDungeon();
    renderList(el);
  }

  function resetDungeon() {
    if (combatState) stopCombatTimer(combatState);
    phase = 'list';
    combatState = null;
    runState = null;
    selectedDungeon = null;
    currentEvent = null;
  }

  function advanceToNext(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    const progress = p.getDungeonProgress(selectedDungeon.id);
    ds.advanceRun(runState, selectedDungeon, progress);
    phase = 'navigate';
    renderNavigate(el);
  }

  // ================================================================ combat
  function startCombat(room: DungeonRoom, isBoss: boolean, el: HTMLElement) {
    if (!selectedDungeon || !runState) return;

    const enemyId = room.enemyId ?? selectedDungeon.enemyIds[0];
    const enemy = ds.selectEnemy(selectedDungeon, p.getDungeonProgress(selectedDungeon.id));
    // 보스면 마지막 적 사용
    const actualEnemy = isBoss
      ? (ds as any).monsters?.get(selectedDungeon.enemyIds[selectedDungeon.enemyIds.length - 1]) ?? enemy
      : (ds as any).monsters?.get(enemyId) ?? enemy;

    const partyActors = getPartyActors();
    combatState = createCombatState(p, actualEnemy, partyActors, selectedDungeon.id, isBoss);

    phase = 'combat';
    renderCombat(el);

    // 실시간 틱 시작
    combatState.tickTimer = setInterval(() => {
      if (!combatState || combatState.finished) {
        if (combatState) stopCombatTimer(combatState);
        return;
      }
      const msgs = processTick(combatState, p);
      for (const m of msgs) combatState.combatLog.push(m);

      if (combatState.finished) {
        stopCombatTimer(combatState);
        if (combatState.victory) {
          handleVictory(el);
        } else {
          handleDefeat(el);
        }
      } else {
        renderCombat(el);
      }
    }, TICK_MS);
  }

  function renderCombat(el: HTMLElement) {
    if (!combatState || !selectedDungeon) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-combat-screen';

    const cs = combatState;
    const ss = cs.playerSkills;
    const enemyHpPct = Math.max(0, Math.round((cs.enemyHp / cs.enemyMaxHp) * 100));
    const playerHpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);
    const mpPct = Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100);

    // 스킬 슬롯
    const skillBtns = ss.slots.map((def, i) => {
      if (!def) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div><div class="skill-key">[${i + 1}]</div>
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

    // 딜레이 표시
    let delayHtml = '';
    if (ss.preDelayTurns > 0) delayHtml = `<div class="delay-indicator">준비 중... (${ss.preDelayTurns}턴)</div>`;
    else if (ss.postDelayTurns > 0) delayHtml = `<div class="delay-indicator">회복 중... (${ss.postDelayTurns}턴)</div>`;

    // 동료 표시
    const partyHtml = cs.partySlots.length > 0
      ? `<div style="font-size:11px;margin-top:4px;color:var(--accent2)">동료: ${cs.partySlots.map(s =>
          `${s.actor.name}(${'★'.repeat(s.hyperionLevel)})`
        ).join(' ')}</div>`
      : '';

    // 버프/디버프
    const buffTags = ss.activeBuffs.map(b =>
      `<span class="buff-tag">${b.type === 'attack' ? '공↑' : '방↑'} ${b.turnsLeft}턴</span>`
    ).join('');
    const debuffTags = ss.activeDebuffs.map(d =>
      `<span class="debuff-tag">${d.type} ${d.turnsLeft}턴</span>`
    ).join('');

    wrap.innerHTML = `
      <div class="combat-header">
        <h2>${cs.isBoss ? '★ 보스: ' : ''}${cs.enemy.name}</h2>
        <span class="combat-turn">턴 ${cs.turn}</span>
      </div>

      <div class="combat-enemy">
        <div class="stat-bar">
          <div class="bar"><div class="bar-fill enemy-hp-bar" style="width:${enemyHpPct}%"></div></div>
          <span class="stat-val">${Math.max(0, Math.round(cs.enemyHp))}/${cs.enemyMaxHp}</span>
        </div>
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
        <div style="display:flex;gap:12px;font-size:12px;margin:4px 0">
          <span>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}
            <span style="display:inline-block;width:${Math.min(80, playerHpPct)}px;height:4px;background:var(--hp-color,#e94560);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
          </span>
          <span>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}
            <span style="display:inline-block;width:${Math.min(60, mpPct)}px;height:4px;background:var(--accent2);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
          </span>
          <span style="color:var(--warning)">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</span>
        </div>
        ${buffTags ? `<div class="combat-buffs">${buffTags}</div>` : ''}
        ${partyHtml}
      </div>

      <div class="skill-slots">
        ${skillBtns}
        <button class="btn skill-btn flee-btn" data-action="flee">
          <div class="skill-name">도주</div><div class="skill-key">[Esc]</div>
        </button>
      </div>

      <p class="hint">1/2/3=스킬 (자동 공격 진행 중) Esc=도주</p>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = parseInt(btn.dataset.slot!, 10);
        handleSkillUse(slot, el);
      });
    });
    wrap.querySelector('[data-action="flee"]')?.addEventListener('click', () => handleFlee(el));

    el.appendChild(wrap);
  }

  function handleSkillUse(slot: number, el: HTMLElement) {
    if (!combatState || combatState.finished) return;
    const ss = combatState.playerSkills;
    const def = ss.slots[slot];
    if (!def || !canUseSkill(def, p, ss).ok) return;

    const msgs = usePlayerSkill(combatState, slot, p);
    for (const m of msgs) combatState.combatLog.push(m);

    if (combatState.finished) {
      stopCombatTimer(combatState);
      if (combatState.victory) {
        handleVictory(el);
      } else {
        handleDefeat(el);
      }
    } else {
      renderCombat(el);
    }
  }

  function handleFlee(el: HTMLElement) {
    if (combatState) {
      stopCombatTimer(combatState);
      combatState.combatLog.push(`${p.name}이(가) 도주했다!`);
    }
    session.backlog.add(session.gameTime, `${p.name}이(가) 전투에서 도주했다.`, '행동');
    // 도주 → 한 층 올라가기 (후퇴)
    handleRetreat(el);
  }

  // ================================================================ victory
  function handleVictory(el: HTMLElement) {
    if (!selectedDungeon || !runState || !combatState) return;
    stopCombatTimer(combatState);

    const isBoss = combatState.isBoss;
    const expGain = isBoss ? 50 + selectedDungeon.difficulty * 30 : 20 + selectedDungeon.difficulty * 10;
    const goldGain = isBoss ? 30 + selectedDungeon.difficulty * 20 : 10 + selectedDungeon.difficulty * 5;

    p.addGold(Math.round(goldGain));
    const leveledUp = p.gainExp(Math.round(expGain));
    p.addDungeonProgress(selectedDungeon.id, selectedDungeon.progressPerAdvance);
    session.gameTime.advance(30);

    session.backlog.add(
      session.gameTime,
      `${p.name}이(가) ${combatState.enemy.name}을(를) 토벌했다. EXP+${Math.round(expGain)}, ${Math.round(goldGain)}G`,
      '행동',
    );

    // 전투 턴 누적
    runState.totalTurns += combatState.turn;

    if (isBoss) {
      runState.bossDefeated = true;
      session.knowledge.trackDungeonClear();
      // 최단 기록 갱신
      const prev = p.dungeonBestTurns.get(selectedDungeon.id);
      const isNewRecord = !prev || runState.totalTurns < prev;
      if (isNewRecord) p.dungeonBestTurns.set(selectedDungeon.id, runState.totalTurns);
      session.backlog.add(session.gameTime, `${selectedDungeon.name} 클리어! (${runState.totalTurns}턴)${isNewRecord ? ' ★신기록!' : ''}`, '행동');
    }

    phase = 'victory';
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const bestTurns = p.dungeonBestTurns.get(selectedDungeon.id);
    const recordHtml = isBoss
      ? `<p style="color:var(--warning);font-size:13px">클리어 턴: ${runState.totalTurns}${bestTurns === runState.totalTurns ? ' ★신기록!' : ` (최단: ${bestTurns}턴)`}</p>`
      : '';

    wrap.innerHTML = `
      <h2>${isBoss ? '★ 보스 격파!' : '승리!'}</h2>
      <div style="text-align:center;margin:12px 0">
        <p>${combatState.enemy.name}을(를) 쓰러뜨렸다!</p>
        <p>EXP +${Math.round(expGain)} | ${Math.round(goldGain)}G</p>
        ${leveledUp ? `<p style="color:var(--success)">레벨 업! Lv.${p.base.level}</p>` : ''}
        <p style="color:var(--text-dim)">진행도: ${p.getDungeonProgress(selectedDungeon.id)}%</p>
        ${recordHtml}
      </div>
      ${isBoss ? `
        <button class="btn btn-primary" data-action="clear">던전 클리어! [Enter]</button>
      ` : `
        <div class="menu-buttons" style="margin-top:12px">
          <button class="btn btn-primary" data-action="continue">1. 계속 전진</button>
          <button class="btn" data-action="retreat">2. 돌아 나가기</button>
        </div>
        <p class="hint">1=전진, 2=후퇴</p>
      `}
    `;

    wrap.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      resetDungeon();
      renderList(el);
    });
    wrap.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
      combatState = null;
      advanceToNext(el);
    });
    wrap.querySelector('[data-action="retreat"]')?.addEventListener('click', () => handleRetreat(el));

    el.appendChild(wrap);
  }

  // ================================================================ defeat
  function handleDefeat(el: HTMLElement) {
    if (combatState) stopCombatTimer(combatState);

    // 자택 복귀, 하루 경과, HP 50% 회복
    p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.5));
    p.currentLocation = p.homeLocation;
    session.gameTime.advance(60 * 24); // 하루
    // 컬러 영향
    p.color.values[7] = Math.min(1, (p.color.values[7] ?? 0.5) + 0.05); // Dark +0.05
    p.color.values[6] = Math.max(0, (p.color.values[6] ?? 0.5) - 0.03); // Light -0.03

    session.backlog.add(session.gameTime, `${p.name}이(가) 쓰러져 자택에서 깨어났다...`, '행동');

    phase = 'defeat';
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <h2>패배...</h2>
      <div style="text-align:center;margin:16px 0">
        <p>의식이 흐려지고... 눈을 떠보니 자택이었다.</p>
        <p style="color:var(--text-dim)">하루가 지났다.</p>
        <p>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</p>
      </div>
      <button class="btn btn-primary" data-action="ok">확인 [Enter]</button>
    `;

    wrap.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      resetDungeon();
      onDone();
    });

    el.appendChild(wrap);
  }

  // ================================================================ event
  function startEvent(room: DungeonRoom, el: HTMLElement) {
    const evtIdx = room.eventIdx;
    currentEvent = evtIdx !== undefined ? ds.getDungeonEventByIndex(evtIdx) : null;
    if (!currentEvent) {
      // 이벤트 없으면 다음 방
      advanceToNext(el);
      return;
    }
    eventMessage = '';
    phase = 'event';
    renderEvent(el);
  }

  function renderEvent(el: HTMLElement) {
    if (!currentEvent) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const evt = currentEvent;
    // 이벤트 효과 적용
    let resultText = '';
    if (evt.hpDamage > 0) {
      p.adjustHp(-evt.hpDamage);
      resultText += `HP -${evt.hpDamage} `;
    }
    if (evt.vigorDamage > 0) {
      const tpCost = Math.ceil(evt.vigorDamage / 10);
      p.adjustAp(-tpCost);
      resultText += `TP -${tpCost} `;
    }
    if (evt.hpHeal > 0) {
      p.adjustHp(evt.hpHeal);
      resultText += `HP +${evt.hpHeal} `;
    }
    if (evt.vigorHeal > 0) {
      const tpGain = Math.ceil(evt.vigorHeal / 10);
      p.adjustAp(tpGain);
      resultText += `TP +${tpGain} `;
    }
    // 컬러 영향
    for (let i = 0; i < evt.colorInfluence.length; i++) {
      if (evt.colorInfluence[i] !== 0) {
        p.color.values[i] = Math.max(0, Math.min(1, (p.color.values[i] ?? 0.5) + evt.colorInfluence[i] * 0.1));
      }
    }

    session.backlog.add(session.gameTime, `${evt.name}: ${evt.description}`, '행동');

    wrap.innerHTML = `
      <h2>${evt.name}</h2>
      <div style="text-align:center;margin:16px 0">
        ${eventMessage ? `<p style="color:var(--warning)">${eventMessage}</p>` : ''}
        <p>${evt.description}</p>
        ${resultText ? `<p style="margin-top:8px;color:var(--text-dim)">${resultText.trim()}</p>` : ''}
      </div>
      <button class="btn btn-primary" data-action="ok">확인 [Enter]</button>
    `;

    wrap.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      currentEvent = null;
      if (p.base.hp <= 0) {
        handleDefeat(el);
      } else {
        advanceToNext(el);
      }
    });

    el.appendChild(wrap);
  }

  // ================================================================ rest
  function startRest(el: HTMLElement) {
    phase = 'rest';
    renderRest(el);
  }

  function renderRest(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);

    wrap.innerHTML = `
      <h2>휴식</h2>
      <div style="text-align:center;margin:16px 0">
        <p>안전한 장소를 찾아 쉬어간다.</p>
        <div class="stat-bar" style="margin:8px auto;max-width:200px">
          <span class="stat-label">HP</span>
          <div class="bar"><div class="bar-fill hp-bar" style="width:${hpPct}%"></div></div>
          <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
        </div>
        <p style="color:var(--text-dim)">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</p>
      </div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn btn-primary" data-action="rest">1. 휴식하기 (HP+20, MP+10, 기력 소모 없음)</button>
        <button class="btn" data-action="skip">2. 그냥 지나치기</button>
      </div>
      <p class="hint">1=휴식, 2=지나침</p>
    `;

    wrap.querySelector('[data-action="rest"]')?.addEventListener('click', () => {
      p.adjustHp(20);
      p.adjustMp(10);
      session.gameTime.advance(10);
      session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 휴식했다.`, '행동');

      // 특수 이벤트 10% 확률
      if (randomFloat(0, 1) < 0.10) {
        const event = ds.rollDungeonEvent();
        if (event) {
          currentEvent = event;
          eventMessage = '휴식 중 무언가가 일어났다!';
          phase = 'event';
          renderEvent(el);
          return;
        }
      }
      advanceToNext(el);
    });

    wrap.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
      advanceToNext(el);
    });

    el.appendChild(wrap);
  }

  // ================================================================ screen
  return {
    id: 'dungeon',
    render(el) {
      switch (phase) {
        case 'combat': renderCombat(el); break;
        case 'navigate': renderNavigate(el); break;
        case 'event': renderEvent(el); break;
        case 'rest': renderRest(el); break;
        default: renderList(el); break;
      }
    },
    onKey(key) {
      const container = document.querySelector('.dungeon-combat-screen')?.parentElement
        ?? document.querySelector('.dungeon-navigate')?.parentElement
        ?? document.querySelector('.info-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        if (phase === 'combat') {
          handleFlee(container);
        } else if (phase === 'navigate') {
          handleRetreat(container);
        } else if (phase === 'list') {
          onDone();
        }
        return;
      }

      if (phase === 'list') {
        if (/^[1-9]$/.test(key)) {
          const idx = parseInt(key, 10) - 1;
          if (idx < allDungeons.length) enterDungeon(idx, container);
        }
      } else if (phase === 'navigate') {
        const isBossFloor = runState && runState.depth >= runState.maxDepth;
        if (isBossFloor) {
          if (key === '1') {
            const btn = container.querySelector('[data-choice="boss"]') as HTMLButtonElement | null;
            btn?.click();
          } else if (key === '2') handleRetreat(container);
        } else {
          if (key === '1') enterRoom(runState!.leftRoom, false, container);
          else if (key === '2') enterRoom(runState!.rightRoom, false, container);
          else if (key === '3' && runState?.hasSidePath) handleSidePath(container);
          else if (key === '3' && !runState?.hasSidePath) handleRetreat(container);
          else if (key === '4' && runState?.hasSidePath) handleRetreat(container);
        }
      } else if (phase === 'combat') {
        if (key === '1') handleSkillUse(0, container);
        else if (key === '2') handleSkillUse(1, container);
        else if (key === '3') handleSkillUse(2, container);
      } else if (phase === 'victory') {
        if (key === 'Enter' || key === '1') {
          const btn = container.querySelector('[data-action="clear"]') as HTMLButtonElement
            ?? container.querySelector('[data-action="continue"]') as HTMLButtonElement;
          btn?.click();
        } else if (key === '2') {
          const btn = container.querySelector('[data-action="retreat"]') as HTMLButtonElement;
          btn?.click();
        }
      } else if (phase === 'event' || phase === 'defeat') {
        if (key === 'Enter') {
          const btn = container.querySelector('[data-action="ok"]') as HTMLButtonElement;
          btn?.click();
        }
      } else if (phase === 'rest') {
        if (key === '1') {
          const btn = container.querySelector('[data-action="rest"]') as HTMLButtonElement;
          btn?.click();
        } else if (key === '2') {
          const btn = container.querySelector('[data-action="skip"]') as HTMLButtonElement;
          btn?.click();
        }
      }
    },
    onExit() {
      // 화면 떠날 때 타이머 정리
      if (combatState) stopCombatTimer(combatState);
    },
  };
}
