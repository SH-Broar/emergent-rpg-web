// dungeon.ts — 던전 화면 (방 기반 탐색 + 실시간 전투)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { DungeonDef, DungeonRunState, DungeonRoom, DungeonEventDef } from '../../models/dungeon';
import { RoomType } from '../../models/dungeon';
import { isTimeWindowOpen } from '../../types/game-time';
import {
  RealtimeCombatState, getCombatTickMs,
  createCombatState, stopCombatTimer, processTick, usePlayerSkill,
} from '../../systems/combat-engine';
import { canUseSkill } from '../../systems/skill-combat';
import { randomFloat } from '../../types/rng';
import { locationName } from '../../types/registry';
import { moveCompanions } from '../../systems/npc-interaction';

type DungeonPhase = 'list' | 'entry' | 'navigate' | 'combat' | 'event' | 'rest' | 'victory' | 'defeat';

export function createDungeonScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const ds = session.dungeonSystem;
  function roomIcon(room: DungeonRoom): string {
    switch (room.type) {
      case RoomType.Combat: return '⚔';
      case RoomType.Event: return '✦';
      case RoomType.Rest: return '💤';
    }
  }

  function getDifficultyPoints(dungeon: DungeonDef): number {
    return Math.max(1, Math.min(20, Math.round(dungeon.difficulty * 20)));
  }

  function renderDifficultyIcons(dungeon: DungeonDef): string {
    const points = getDifficultyPoints(dungeon);
    const major = Math.floor(points / 10);
    const remainder = points % 10;
    const full = Math.floor(remainder / 2);
    const half = remainder % 2;
    const majorStars = Array.from(
      { length: major },
      () => '<span style="color:#ff6b6b;font-size:16px;font-weight:700">★</span>',
    ).join('');
    return `${majorStars}${'★'.repeat(full)}${'☆'.repeat(half)}`;
  }

  function isZeroGravityDungeon(dungeon: DungeonDef | null | undefined): boolean {
    return dungeon?.accessFrom === 'Void_Forest';
  }

  function getSkillUseOptions(dungeon: DungeonDef | null | undefined) {
    if (!isZeroGravityDungeon(dungeon)) return {};
    return { mpCostMultiplier: 1 / 3, ignoreMaxUses: true };
  }

  function getDisplayedSkillMpCost(mpCost: number, dungeon: DungeonDef | null | undefined): number {
    const multiplier = isZeroGravityDungeon(dungeon) ? 1 / 3 : 1;
    return Math.max(0, Math.ceil(mpCost * multiplier));
  }

  function isDungeonAvailableNow(d: DungeonDef): boolean {
    return isTimeWindowOpen(d.availableHours, session.gameTime.hour, session.gameTime.minute);
  }

  function isHiddenLocationAvailable(locationId?: string): boolean {
    if (!locationId) return false;
    const location = session.world.getLocation(locationId);
    return !!location && isTimeWindowOpen(location.timeVisible, session.gameTime.hour, session.gameTime.minute);
  }

  const localDungeons = ds.getAllDungeons().filter(d => d.accessFrom === p.currentLocation);
  const allDungeons = localDungeons.filter(isDungeonAvailableNow);
  function getRuleStatusText(): string {
    if (!selectedDungeon || !runState) return '';
    return ds.getRuleStatus(selectedDungeon, runState, session.gameTime.hour);
  }

  function isFoggedRoom(side: 'left' | 'right'): boolean {
    if (!selectedDungeon?.rule || !runState) return false;
    if (selectedDungeon.rule.template !== 'DeepFog') return false;
    if (runState.depth >= runState.maxDepth) return false;
    const rank = selectedDungeon.rule.rank;
    if (rank <= 2) return false;
    const maskLeft = ((runState.depth + runState.roomsCleared) % 2) === 0;
    return side === 'left' ? maskLeft : !maskLeft;
  }

  function getRoomButtonLabel(room: DungeonRoom, side: 'left' | 'right'): string {
    if (!isFoggedRoom(side)) return `${roomIcon(room)} ${room.label}`;
    switch (room.type) {
      case RoomType.Combat: return `${roomIcon(room)} 짙은 안개 속 기척`;
      case RoomType.Event: return `${roomIcon(room)} 짙은 안개 속 흔들림`;
      case RoomType.Rest: return `${roomIcon(room)} 안개 낀 쉼터`;
    }
  }

  function getPredatorRestPenalty(): { hp: number; mp: number; note: string } {
    let hp = 20;
    let mp = 10;
    let note = '안전한 장소를 찾아 쉬어간다.';
    if (!selectedDungeon?.rule || !runState) return { hp, mp, note };

    switch (selectedDungeon.rule.template) {
      case 'PredatorTerritory': {
        const rank = selectedDungeon.rule.rank;
        hp = Math.max(14, hp - rank * 2);
        mp = Math.max(7, mp - rank);
        note = '짐승의 울음이 가까워 깊게 쉬지 못한다.';
        break;
      }
      case 'FrostPressure': {
        const chill = Math.max(1, Math.round(selectedDungeon.rule.valueA + runState.depth * 0.5));
        hp = Math.max(12, hp - chill);
        mp = Math.max(6, mp - Math.ceil(chill / 2));
        note = '차가운 공기 때문에 회복 효율이 조금 떨어진다.';
        break;
      }
      case 'PurityCurrent': {
        hp += Math.min(10, runState.purity * 2 + selectedDungeon.rule.rank);
        mp += Math.min(6, runState.purity + selectedDungeon.rule.rank);
        note = '정화의 흐름이 몸을 감싸 회복이 조금 더 좋아진다.';
        break;
      }
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(selectedDungeon.rule.valueA || 3));
        if (runState.depth % cycle === 0) {
          hp += 8 + selectedDungeon.rule.rank;
          mp += 4 + Math.floor(selectedDungeon.rule.rank / 2);
          note = '은신처 구간이라 편하게 숨을 고를 수 있다.';
        } else {
          note = '아직 제대로 쉴 만한 은신처는 보이지 않는다.';
        }
        break;
      }
      case 'HeatGauge': {
        hp += Math.min(6, runState.heat);
        mp += Math.min(4, Math.floor(runState.heat / 2));
        note = '열기가 빠져나가며 몸이 조금 가벼워진다.';
        break;
      }
    }
    return { hp, mp, note };
  }

  function getSidePathConfig(): { hpCostRatio: number; note: string } {
    let hpCostRatio = 0.1;
    let note = '샛길을 탐색한다.';
    if (!selectedDungeon?.rule || !runState) return { hpCostRatio, note };
    switch (selectedDungeon.rule.template) {
      case 'TidalRoute': {
        const cycle = Math.max(2, Math.round(selectedDungeon.rule.valueA || 2));
        const highTide = runState.depth % cycle === 0;
        hpCostRatio = highTide ? 0.12 : 0.07;
        note = highTide ? '밀물 사이를 비집고 샛길을 탐색한다.' : '썰물에 드러난 샛길을 탐색한다.';
        break;
      }
      case 'CollapsingPath':
        hpCostRatio = 0.12 + selectedDungeon.rule.rank * 0.005;
        note = '무너지는 길 틈으로 억지로 몸을 비집고 들어간다.';
        break;
      case 'FrostPressure':
        hpCostRatio = 0.11;
        note = '차가운 바람을 버티며 샛길을 더듬는다.';
        break;
      case 'GreedRisk':
        hpCostRatio = 0.10;
        note = '더 많은 보상을 노리고 위험한 샛길을 고른다.';
        break;
    }
    return { hpCostRatio, note };
  }

  function applyRuleAdvanceEffects(el: HTMLElement): boolean {
    if (!selectedDungeon?.rule || !runState) return false;
    const rule = selectedDungeon.rule;
    switch (rule.template) {
      case 'CollapsingPath': {
        const chip = Math.max(1, Math.round(rule.rank + runState.depth * 0.5));
        p.adjustHp(-chip);
        if (chip > 0) {
          session.backlog.add(session.gameTime, `무너지는 잔해가 스쳐 HP ${chip}를 잃었다.`, '행동');
        }
        break;
      }
      case 'FrostPressure': {
        const mpLoss = Math.max(1, Math.round(rule.rank / 2));
        p.adjustMp(-mpLoss);
        session.backlog.add(session.gameTime, `혹한 때문에 MP ${mpLoss}가 줄었다.`, '행동');
        break;
      }
      case 'TraceHunt': {
        runState.tracePoints += Math.max(1, Math.round(rule.valueA || 1));
        const target = Math.max(2, Math.round(rule.valueB || 3));
        if (runState.tracePoints >= target) {
          runState.hasSidePath = true;
          session.backlog.add(session.gameTime, '충분한 흔적을 모아 다음 층에서 샛길을 포착했다.', '행동');
          runState.tracePoints -= target;
        }
        break;
      }
      case 'HeatGauge': {
        runState.heat = Math.min(9, runState.heat + Math.max(1, Math.round(rule.valueA || 1)));
        if (runState.heat >= 5) {
          const chip = Math.max(1, Math.floor(runState.heat / 2));
          p.adjustHp(-chip);
          session.backlog.add(session.gameTime, `축적된 열기로 HP ${chip}를 잃었다.`, '행동');
        }
        break;
      }
      case 'PurityCurrent':
        runState.purity = Math.min(9, runState.purity + 1);
        break;
      case 'ShelterWindow': {
        const cycle = Math.max(2, Math.round(rule.valueA || 3));
        if (runState.depth % cycle === 0) {
          p.adjustHp(4 + rule.rank);
          p.adjustMp(2 + Math.floor(rule.rank / 2));
          session.backlog.add(session.gameTime, '은신처 구간을 지나며 잠시 호흡을 가다듬었다.', '행동');
        }
        break;
      }
    }

    if (p.base.hp <= 0) {
      handleDefeat(el);
      return true;
    }
    return false;
  }

  function hasHiddenRoute(dungeon: DungeonDef | null): dungeon is DungeonDef {
    if (!dungeon?.hiddenLocation) return false;
    const unlock = dungeon.hiddenUnlockProgress ?? 100;
    return p.getDungeonProgress(dungeon.id) >= unlock;
  }

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
        ? `<p class="hint">${
          localDungeons.length > 0
            ? '지금 시간에는 입장 가능한 던전이 없습니다.'
            : '접근 가능한 던전이 없습니다.'
        }</p>`
        : `<div class="dungeon-list">
            ${allDungeons.map((d, i) => {
              const maxDepth = ds.calcMaxDepth(d);
              const progress = p.getDungeonProgress(d.id);
              const isCleared = progress >= 100;
              const progressColor = isCleared ? 'var(--success)' : 'var(--warning)';
              const progressLabel = isCleared ? `✦ 클리어 (${progress}%)` : `진행: ${progress}%`;
              const best = p.dungeonBestTurns.get(d.id);
              const bestLabel = best ? `최단: ${best}턴` : '';
              const hiddenOpen = hasHiddenRoute(d) && isHiddenLocationAvailable(d.hiddenLocation);
              const hiddenLabel = hasHiddenRoute(d)
                ? hiddenOpen
                  ? `숨은 지역: ${locationName(d.hiddenLocation!)}`
                  : `숨은 지역: ${locationName(d.hiddenLocation!)} (지금은 닫힘)`
                : '';
              return `<button class="btn dungeon-item" data-idx="${i}" style="${isCleared ? 'border-color:var(--success)' : ''}">
                <div class="dungeon-name">${i + 1}. ${d.name} ${isCleared ? '<span style="color:var(--success);font-size:12px">✦</span>' : ''}</div>
                <div class="dungeon-meta">
                  <span>난이도: ${renderDifficultyIcons(d)}</span>
                  <span>${maxDepth}층</span>
                  <span style="color:${progressColor}">${progressLabel}</span>
                  ${d.rule ? `<span style="color:var(--accent2)">규칙 ${d.rule.rank}: ${d.rule.template}</span>` : ''}
                  ${hiddenLabel ? `<span style="color:${hiddenOpen ? 'var(--accent2)' : 'var(--text-dim)'}">${hiddenLabel}</span>` : ''}
                  ${bestLabel ? `<span style="color:var(--warning)">${bestLabel}</span>` : ''}
                </div>
                <div class="dungeon-desc">${isCleared ? d.deepDescription || d.description : d.description}</div>
                ${d.rule?.hint ? `<div class="dungeon-desc" style="color:var(--accent2)">${d.rule.hint}</div>` : ''}
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
        chooseDungeon(idx, el);
      });
    });

    el.appendChild(wrap);
  }

  function chooseDungeon(dungeonIdx: number, el: HTMLElement) {
    const dungeon = allDungeons[dungeonIdx];
    if (!dungeon) return;
    selectedDungeon = dungeon;
    if (hasHiddenRoute(dungeon)) {
      phase = 'entry';
      renderEntry(el);
      return;
    }
    enterDungeon(dungeon, el);
  }

  function renderEntry(el: HTMLElement) {
    if (!selectedDungeon) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    const hiddenName = selectedDungeon.hiddenLocation ? locationName(selectedDungeon.hiddenLocation) : '';
    const hiddenOpen = isHiddenLocationAvailable(selectedDungeon.hiddenLocation);

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>${selectedDungeon.name}</h2>
      <p class="hint">완전히 공략한 던전이다. 어디로 들어갈지 선택한다.</p>
      ${selectedDungeon.rule ? `<p class="hint" style="color:var(--accent2)">규칙 ${selectedDungeon.rule.rank}: ${selectedDungeon.rule.hint || selectedDungeon.rule.template}</p>` : ''}
      ${hiddenName && !hiddenOpen ? `<p class="hint" style="color:var(--text-dim)">${hiddenName}은(는) 지금 시간에는 모습을 드러내지 않는다.</p>` : ''}
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn btn-primary" data-action="dungeon">1. 던전 입장</button>
        ${hiddenName ? `<button class="btn" data-action="hidden" ${hiddenOpen ? '' : 'disabled style="opacity:0.45;cursor:not-allowed"'}>2. 숨겨진 지역 입장: ${hiddenName}</button>` : ''}
      </div>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      selectedDungeon = null;
      phase = 'list';
      renderList(el);
    });
    wrap.querySelector('[data-action="dungeon"]')?.addEventListener('click', () => enterDungeon(selectedDungeon!, el));
    wrap.querySelector('[data-action="hidden"]')?.addEventListener('click', () => enterHiddenArea(el));
    el.appendChild(wrap);
  }

  function enterDungeon(dungeon: DungeonDef, el: HTMLElement) {
    const progress = p.getDungeonProgress(dungeon.id);
    runState = ds.createRunState(dungeon, progress, session.gameTime.hour);

    session.backlog.add(session.gameTime, `${p.name}이(가) ${dungeon.name}에 입장했다.`, '행동');
    phase = 'navigate';
    renderNavigate(el);
  }

  function enterHiddenArea(_el: HTMLElement) {
    if (!selectedDungeon?.hiddenLocation) return;
    const hidden = selectedDungeon.hiddenLocation;
    if (!isHiddenLocationAvailable(hidden)) return;
    p.currentLocation = hidden;
    moveCompanions(session.actors, session.knowledge, hidden);
    session.knowledge.trackVisit(hidden);
    session.backlog.add(session.gameTime, `${p.name}이(가) ${locationName(hidden)}에 입장했다.`, '행동');
    onDone();
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
      ${getRuleStatusText() ? `<p class="hint" style="color:var(--accent2);margin:6px 0">${getRuleStatusText()}</p>` : ''}

      ${isBossFloor ? `
        <div class="menu-buttons" style="margin:16px 0">
          <button class="btn btn-primary" data-choice="boss">1. ${roomIcon(runState.leftRoom)} ${runState.leftRoom.label} [보스]</button>
          <button class="btn" data-choice="retreat">2. ↩ 되돌아가기</button>
        </div>
        <p class="hint">1=보스 도전, 2=후퇴</p>
      ` : `
        <div class="menu-buttons" style="margin:16px 0">
          <button class="btn" data-choice="left">1. ← ${getRoomButtonLabel(runState.leftRoom, 'left')}</button>
          <button class="btn" data-choice="right">2. → ${getRoomButtonLabel(runState.rightRoom, 'right')}</button>
          ${runState.hasSidePath ? `<button class="btn" data-choice="side">3. ↗ 샛길 (HP -${Math.round(getSidePathConfig().hpCostRatio * 100)}%)</button>` : ''}
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
    const sidePath = getSidePathConfig();
    const hpCost = Math.round(p.getEffectiveMaxHp() * sidePath.hpCostRatio);
    p.adjustHp(-hpCost);
    if (selectedDungeon.rule?.template === 'AncientResonance') {
      runState.resonance += Math.max(1, Math.round(selectedDungeon.rule.valueA || 1));
    }
    if (selectedDungeon.rule?.template === 'GreedRisk') {
      runState.greed = Math.min(9, runState.greed + 1);
    }
    if (selectedDungeon.rule?.template === 'HeatGauge') {
      runState.heat = Math.min(9, runState.heat + 1);
    }
    if (selectedDungeon.rule?.template === 'TraceHunt') {
      runState.tracePoints += 1;
    }

    if (p.base.hp <= 0) {
      handleDefeat(el);
      return;
    }

    // 랜덤 이벤트
    const event = ds.rollDungeonEvent(selectedDungeon);
    if (event) {
      currentEvent = event;
      eventMessage = `${sidePath.note} (HP -${hpCost})`;
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
    ds.advanceRun(runState, selectedDungeon, progress, session.gameTime.hour);
    if (applyRuleAdvanceEffects(el)) return;
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
    }, getCombatTickMs(p));
    if (isZeroGravityDungeon(selectedDungeon)) {
      const regenTick = setInterval(() => {
        if (!combatState || combatState.finished) {
          clearInterval(regenTick);
          return;
        }
        const before = p.base.mp;
        p.adjustMp(1);
        if (p.base.mp !== before) renderCombat(el);
      }, 1000);
    }
  }

  function renderCombat(el: HTMLElement) {
    if (!combatState || !selectedDungeon) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-combat-screen';

    const cs = combatState;
    const ss = cs.playerSkills;
    const enemyHpPct = Math.max(0, Math.round((cs.enemyHp / cs.enemyMaxHp) * 100));
    const playerHpPct = Math.max(0, Math.min(100, Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100)));
    const mpPct = Math.max(0, Math.min(100, Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100)));

    // 스킬 슬롯
    const skillBtns = ss.slots.map((def, i) => {
      if (!def) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div><div class="skill-key">[${i + 1}]</div>
        </button>`;
      }
      const blocked = ss.preDelayTurns > 0 || ss.postDelayTurns > 0;
      const skillUseOptions = getSkillUseOptions(selectedDungeon);
      const noMp = !canUseSkill(def, p, ss, skillUseOptions).ok
        && p.base.mp < getDisplayedSkillMpCost(def.mpCost, selectedDungeon);
      const noTp = def.tpCost > 0 && !p.hasAp(def.tpCost);
      const disabled = blocked || noMp || noTp;
      const tpLabel = def.tpCost > 0 ? ` TP${def.tpCost}` : '';
      const mpCostLabel = getDisplayedSkillMpCost(def.mpCost, selectedDungeon);
      return `<button class="btn skill-btn${disabled ? ' disabled' : ''}" data-slot="${i}"${disabled ? ' disabled' : ''}>
        <div class="skill-name">${def.name}</div>
        <div class="skill-cost">MP${mpCostLabel}${tpLabel}</div>
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
          <div class="combat-tp-line">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</div>
        </div>
        ${buffTags ? `<div class="combat-buffs">${buffTags}</div>` : ''}
        ${partyHtml}
        ${isZeroGravityDungeon(selectedDungeon) ? '<div class="combat-buffs"><span class="buff-tag">저중력 · MP 1/3 · 횟수 제한 해제 · MP 1초 회복</span></div>' : ''}
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
    const skillUseOptions = getSkillUseOptions(selectedDungeon);
    if (!def || !canUseSkill(def, p, ss, skillUseOptions).ok) return;

    const msgs = usePlayerSkill(combatState, slot, p, skillUseOptions);
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
    const baseExpGain = isBoss ? 50 + selectedDungeon.difficulty * 30 : 20 + selectedDungeon.difficulty * 10;
    const baseGoldGain = isBoss ? 30 + selectedDungeon.difficulty * 20 : 10 + selectedDungeon.difficulty * 5;
    const prevProgress = p.getDungeonProgress(selectedDungeon.id);
    let expGain = baseExpGain;
    let goldGain = baseGoldGain;
    let bonusText = '';

    if (selectedDungeon.rule?.template === 'GreedRisk' && runState.greed > 0) {
      const greedBonus = Math.round(runState.greed * (4 + selectedDungeon.rule.rank));
      goldGain += greedBonus;
      bonusText = `욕심 보너스 +${greedBonus}G`;
    }
    if (selectedDungeon.rule?.template === 'PurityCurrent' && runState.purity > 0) {
      p.adjustHp(runState.purity * 2);
      p.adjustMp(runState.purity);
      bonusText = bonusText ? `${bonusText} | 정화 회복` : '정화 회복';
    }
    if (selectedDungeon.rule?.template === 'AncientResonance' && runState.resonance >= 3) {
      p.adjustHp(8 + selectedDungeon.rule.rank);
      p.adjustMp(4 + Math.floor(selectedDungeon.rule.rank / 2));
      runState.resonance = Math.max(0, runState.resonance - 3);
      bonusText = bonusText ? `${bonusText} | 공명 회복` : '공명 회복';
    }

    p.addGold(Math.round(goldGain));
    const leveledUp = p.gainExp(Math.round(expGain));
    p.addDungeonProgress(selectedDungeon.id, selectedDungeon.progressPerAdvance);
    const curProgress = p.getDungeonProgress(selectedDungeon.id);
    const unlockedHidden = isBoss && hasHiddenRoute(selectedDungeon) && prevProgress < (selectedDungeon.hiddenUnlockProgress ?? 100);
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
        ${bonusText ? `<p style="color:var(--accent2)">${bonusText}</p>` : ''}
        ${leveledUp ? `<p style="color:var(--success)">레벨 업! Lv.${p.base.level}</p>` : ''}
        <p style="color:var(--text-dim)">진행도: ${curProgress}%</p>
        ${unlockedHidden && selectedDungeon.hiddenLocation ? `<p style="color:var(--accent2)">숨겨진 지역 ${locationName(selectedDungeon.hiddenLocation)} 이(가) 열렸다.</p>` : ''}
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
      if (selectedDungeon?.rule?.template === 'GreedRisk' && runState) {
        runState.greed = Math.min(9, runState.greed + 1);
      }
      combatState = null;
      advanceToNext(el);
    });
    wrap.querySelector('[data-action="retreat"]')?.addEventListener('click', () => handleRetreat(el));

    el.appendChild(wrap);
  }

  // ================================================================ defeat
  function handleDefeat(el: HTMLElement) {
    if (combatState) stopCombatTimer(combatState);

    // 자택 복귀: 이동 시간 + 8시간 회복 시간 경과
    p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.5));
    const travelMins = session.world.getShortestMinutes(p.currentLocation, p.homeLocation, session.gameTime.day);
    const recoveryMins = 8 * 60;
    session.gameTime.advance(travelMins + recoveryMins);
    p.currentLocation = p.homeLocation;
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
    if (selectedDungeon?.rule?.template === 'AncientResonance' && runState) {
      runState.resonance += 1;
    }
    if (selectedDungeon?.rule?.template === 'PurityCurrent' && runState) {
      runState.purity = Math.min(9, runState.purity + 1);
    }
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
    const restRecovery = getPredatorRestPenalty();

    wrap.innerHTML = `
      <h2>휴식</h2>
      <div style="text-align:center;margin:16px 0">
        <p>${restRecovery.note}</p>
        <div class="stat-bar" style="margin:8px auto;max-width:200px">
          <span class="stat-label">HP</span>
          <div class="bar"><div class="bar-fill hp-bar" style="width:${hpPct}%"></div></div>
          <span class="stat-val">${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}</span>
        </div>
        <p style="color:var(--text-dim)">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</p>
      </div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn btn-primary" data-action="rest">1. 휴식하기 (HP+${restRecovery.hp}, MP+${restRecovery.mp}, TP 소모 없음)</button>
        <button class="btn" data-action="skip">2. 그냥 지나치기</button>
      </div>
      <p class="hint">1=휴식, 2=지나침</p>
    `;

    wrap.querySelector('[data-action="rest"]')?.addEventListener('click', () => {
      if (!selectedDungeon) return;
      p.adjustHp(restRecovery.hp);
      p.adjustMp(restRecovery.mp);
      if (selectedDungeon?.rule?.template === 'HeatGauge' && runState) {
        runState.heat = Math.max(0, runState.heat - (2 + Math.floor(selectedDungeon.rule.rank / 2)));
      }
      if (selectedDungeon?.rule?.template === 'PurityCurrent' && runState) {
        runState.purity = Math.min(9, runState.purity + 2);
      }
      session.gameTime.advance(10);
      session.backlog.add(session.gameTime, `${p.name}이(가) 던전에서 휴식했다.`, '행동');

      // 특수 이벤트 10% 확률
      if (randomFloat(0, 1) < 0.10) {
        const event = ds.rollDungeonEvent(selectedDungeon);
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
        case 'entry': renderEntry(el); break;
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
        } else if (phase === 'entry') {
          selectedDungeon = null;
          phase = 'list';
          renderList(container);
        } else if (phase === 'list') {
          onDone();
        }
        return;
      }

      if (phase === 'list') {
        if (/^[1-9]$/.test(key)) {
          const idx = parseInt(key, 10) - 1;
          if (idx < allDungeons.length) chooseDungeon(idx, container);
        }
      } else if (phase === 'entry') {
        if (key === '1') {
          const btn = container.querySelector('[data-action="dungeon"]') as HTMLButtonElement | null;
          btn?.click();
        } else if (key === '2') {
          const btn = container.querySelector('[data-action="hidden"]') as HTMLButtonElement | null;
          btn?.click();
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
