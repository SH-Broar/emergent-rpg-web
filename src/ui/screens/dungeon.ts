// dungeon.ts — 던전 화면 (층·진행도 기반 탐색 + 실시간 전투)

import type { Screen } from '../screen-manager';
import type { GameSession } from '../../systems/game-session';
import type { DungeonDef, DungeonRunState, DungeonRoom, DungeonEventDef, LootEntry } from '../../models/dungeon';
import { RoomType, rollLoot } from '../../models/dungeon';
import { getItemDef, getWeaponDef, getArmorDef, categoryName } from '../../types/item-defs';
import { isTimeWindowOpen } from '../../types/game-time';
import {
  RealtimeCombatState, getCombatTickMs,
  createCombatState, stopCombatTimer, processTick, usePlayerSkill,
} from '../../systems/combat-engine';
import { canUseSkill } from '../../systems/skill-combat';
import { locationName } from '../../types/registry';
import { moveCompanions } from '../../systems/npc-interaction';
import { iGa, eulReul, eunNeun } from '../../data/josa';
import { randomFloat } from '../../types/rng';

type DungeonPhase = 'list' | 'entry' | 'navigate' | 'combat' | 'event' | 'rest' | 'victory' | 'defeat' | 'midBoss' | 'map' | 'giveUpConfirm';

export function createDungeonScreen(
  session: GameSession,
  onDone: () => void,
): Screen {
  const p = session.player;
  const ds = session.dungeonSystem;

  function choiceIcon(type: RoomType): string {
    switch (type) {
      case RoomType.Combat: return '⚔';
      case RoomType.Event: return '✦';
      case RoomType.Rest: return '💤';
    }
  }

  function choiceLabel(type: RoomType): string {
    switch (type) {
      case RoomType.Combat: return '전투';
      case RoomType.Event: return '이벤트';
      case RoomType.Rest: return '휴식';
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

  function ruleLevel(rank: number): string {
    const lv = rank <= 2 ? 1 : rank <= 4 ? 2 : 3;
    return '◆'.repeat(lv) + '◇'.repeat(3 - lv);
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
        const chill = Math.max(1, Math.round(selectedDungeon.rule.valueA + runState.floor * 0.5));
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
        if (runState.floor % cycle === 0) {
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

  function applyRuleAdvanceEffects(el: HTMLElement): boolean {
    if (!selectedDungeon?.rule || !runState) return false;
    const rule = selectedDungeon.rule;
    const depth = ds.getEffectiveDepth(runState);
    switch (rule.template) {
      case 'CollapsingPath': {
        const chip = Math.max(1, Math.round(rule.rank + depth * 0.5));
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
        if (runState.floor % cycle === 0) {
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

  // ================================================================ color influence
  // Fire=0, Water=1, Electric=2, Iron=3, Earth=4, Wind=5, Light=6, Dark=7
  function nudgeColor(changes: [number, number][]): void {
    for (const [i, amt] of changes) {
      p.color.values[i] = Math.max(0, Math.min(1, (p.color.values[i] ?? 0.5) + amt));
    }
  }

  // ================================================================ state
  let phase: DungeonPhase = 'list';
  let selectedDungeon: DungeonDef | null = null;
  let runState: DungeonRunState | null = null;
  let combatState: RealtimeCombatState | null = null;
  let currentEvent: DungeonEventDef | null = null;
  let eventMessage = '';
  let pendingProgress = 0;
  let selectedChoiceIdx = -1;
  let isBossFight = false;
  let isMidBossFight = false;
  let tutorialShown = false;

  function applyDungeonColorScaled(scale: number): void {
    if (!selectedDungeon) return;
    const inf = selectedDungeon.colorInfluence;
    for (let i = 0; i < inf.length; i++) {
      if (inf[i] !== 0) {
        p.color.values[i] = Math.max(0, Math.min(1, (p.color.values[i] ?? 0.5) + inf[i] * scale));
      }
    }
  }

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
              const progress = p.getDungeonProgress(d.id);
              const isCleared = progress >= 100;
              const progressColor = isCleared ? 'var(--success)' : 'var(--warning)';
              const progressLabel = isCleared ? `✦ 클리어 (${progress}%)` : `진행: ${progress}%`;
              const best = p.dungeonBestTurns.get(d.id);
              const sr = d.sRankTurnLimit;
              const sEarned = sr != null && best != null && best <= sr;
              const bestLabel = best ? `최단: ${best}턴` : '';
              const sRankLabel = sr != null ? (sEarned ? `S랭크 달성(≤${sr}턴)` : `S랭크: ≤${sr}턴`) : '';
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
                  <span>${d.floors}층</span>
                  <span style="color:${progressColor}">${progressLabel}</span>
                  ${d.rule ? `<span style="color:#6ba3d6">특수 ${ruleLevel(d.rule.rank)}</span>` : ''}
                  ${hiddenLabel ? `<span style="color:${hiddenOpen ? '#6ba3d6' : 'var(--text-dim)'}">${hiddenLabel}</span>` : ''}
                  ${bestLabel ? `<span style="color:var(--warning)">${bestLabel}</span>` : ''}
                  ${sRankLabel ? `<span style="color:${sEarned ? 'var(--success)' : '#e6b422'}">${sRankLabel}</span>` : ''}
                </div>
                <div class="dungeon-desc">${isCleared ? d.deepDescription || d.description : d.description}</div>
                ${d.rule?.hint ? `<div class="dungeon-desc" style="color:#6ba3d6">${d.rule.hint}</div>` : ''}
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
      ${selectedDungeon.rule ? `<p class="hint" style="color:#6ba3d6">특수 ${ruleLevel(selectedDungeon.rule.rank)} — ${selectedDungeon.rule.hint || selectedDungeon.rule.template}</p>` : ''}
      ${hiddenName && !hiddenOpen ? `<p class="hint" style="color:var(--text-dim)">${hiddenName}${eunNeun(hiddenName)} 지금 시간에는 모습을 드러내지 않는다.</p>` : ''}
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
    runState = ds.createRunState(dungeon, session.gameTime.hour);
    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} ${dungeon.name}에 입장했다.`, '행동');
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
    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} ${locationName(hidden)}에 입장했다.`, '행동');
    onDone();
  }

  // ================================================================ navigate
  function renderTutorial(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';
    wrap.innerHTML = `
      <h2>던전 탐색 안내</h2>
      <div style="margin:12px 0;font-size:13px;line-height:1.8">
        <p>던전은 <b>층</b>과 <b>진행 단계</b>로 이루어져 있습니다.</p>
        <p style="margin-top:8px">각 단계에서 여러 선택지가 나타나며, 일정 수를 클리어하면 다음으로 넘어갑니다.</p>
        <div style="margin:12px 0;padding:8px 12px;background:var(--bg-card);border-radius:6px;font-size:12px">
          <p>⚔ <b>전투</b> — 적과 실시간 전투</p>
          <p>✦ <b>이벤트</b> — 탐험 중 일어나는 사건</p>
          <p>💤 <b>휴식</b> — HP와 MP를 회복</p>
        </div>
        <p style="margin-top:8px"><b>하단 버튼:</b></p>
        <p>· <b>탐색</b> — HP를 소모하고 즉시 다음 단계로 진행</p>
        <p>· <b>던전 지도</b> — 현재 위치와 전체 구조 확인</p>
        <p>· <b>포기</b> — 던전에서 나갑니다 (진행도 미저장)</p>
        <p style="margin-top:8px;color:var(--warning)">마지막 층을 모두 통과하면 보스가 나타납니다!</p>
      </div>
      <button class="btn btn-primary" data-action="start">시작 [Enter]</button>
    `;
    wrap.querySelector('[data-action="start"]')?.addEventListener('click', () => {
      tutorialShown = true;
      renderNavigate(el);
    });
    el.appendChild(wrap);
  }

  function renderNavigate(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    if (!tutorialShown) {
      renderTutorial(el);
      return;
    }
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen dungeon-navigate';

    const clearedCount = runState.choices.filter(c => c.cleared).length;
    const canAdvance = clearedCount >= runState.requiredClears;
    const hpPct = Math.round((p.base.hp / p.getEffectiveMaxHp()) * 100);
    const mpPct = Math.round((p.base.mp / p.getEffectiveMaxMp()) * 100);
    const overallProgress = Math.round(((runState.floor * runState.maxStep + runState.step) / (runState.maxFloor * runState.maxStep)) * 100);
    const remainingCount = runState.choices.filter(c => !c.cleared).length;
    const exploreCost = Math.round(remainingCount * 0.10 * p.getEffectiveMaxHp());

    const choiceButtons = runState.choices.map((c, i) => {
      const icon = choiceIcon(c.type);
      const label = choiceLabel(c.type);
      if (c.cleared) {
        return `<button class="btn" disabled style="opacity:0.35">${icon} ${label} ✓</button>`;
      }
      return `<button class="btn" data-choice="${i}">${i + 1}. ${icon} ${label}</button>`;
    }).join('');

    const advanceHtml = canAdvance
      ? `<button class="btn btn-primary" data-action="advance" style="margin-top:8px">→ 다음으로 [Enter]</button>`
      : `<div class="hint" style="margin-top:8px">${runState.requiredClears - clearedCount}개 더 클리어 필요</div>`;

    wrap.innerHTML = `
      <h2>${selectedDungeon.name} — ${runState.floor + 1}/${runState.maxFloor}층 · ${runState.step + 1}/${runState.maxStep}단계</h2>
      <div style="display:flex;gap:12px;font-size:12px;margin:8px 0">
        <span>HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())}
          <span style="display:inline-block;width:${Math.min(80, hpPct)}px;height:4px;background:var(--hp-color,#e94560);border-radius:2px;vertical-align:middle;margin-left:2px"></span>
        </span>
        <span>MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}
          <span style="display:inline-block;width:${Math.min(60, mpPct)}px;height:4px;background:#4a6fa5;border-radius:2px;vertical-align:middle;margin-left:2px"></span>
        </span>
        <span style="color:var(--warning)">TP: ${p.base.ap}/${p.getEffectiveMaxAp()}</span>
      </div>
      ${getRuleStatusText() ? `<p class="hint" style="color:#6ba3d6;margin:6px 0">${getRuleStatusText()}</p>` : ''}

      <div class="menu-buttons" style="margin:12px 0;gap:6px">
        ${choiceButtons}
      </div>
      ${advanceHtml}

      <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span>${runState.floor + 1}/${runState.maxFloor}층 · ${runState.step + 1}/${runState.maxStep}단계</span>
          <span style="color:var(--text-dim)">처치 ${runState.roomsCleared} · ${runState.totalTurns}턴</span>
        </div>
        <div style="height:6px;background:var(--bg-panel);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${overallProgress}%;background:var(--warning);border-radius:3px;transition:width 0.3s"></div>
        </div>
        ${getPartyActors().length > 0 ? `<div style="font-size:11px;color:var(--text-dim);margin-top:4px">동료: ${getPartyActors().map(a => `${a.name}(★${a.hyperionLevel})`).join(', ')}</div>` : ''}
        <div class="menu-buttons" style="margin-top:8px;gap:6px">
          <button class="btn" data-action="explore" ${remainingCount === 0 ? 'disabled' : ''}>탐색 (HP -${exploreCost})</button>
          <button class="btn" data-action="map">던전 지도</button>
          <button class="btn" data-action="giveup" style="border-color:var(--accent)">포기</button>
        </div>
      </div>
    `;

    wrap.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.choice!, 10);
        enterChoice(idx, el);
      });
    });
    wrap.querySelector('[data-action="advance"]')?.addEventListener('click', () => handleAdvanceStep(el));
    wrap.querySelector('[data-action="explore"]')?.addEventListener('click', () => handleExplore(el));
    wrap.querySelector('[data-action="map"]')?.addEventListener('click', () => { phase = 'map'; renderDungeonMap(el); });
    wrap.querySelector('[data-action="giveup"]')?.addEventListener('click', () => { phase = 'giveUpConfirm'; renderGiveUpConfirm(el); });

    el.appendChild(wrap);
  }

  function enterChoice(idx: number, el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    const choice = runState.choices[idx];
    if (!choice || choice.cleared) return;
    selectedChoiceIdx = idx;
    isBossFight = false;
    isMidBossFight = false;

    const room: DungeonRoom = { type: choice.type, label: choice.label, enemyId: choice.enemyId, eventIdx: choice.eventIdx };
    // 선택 유형별 컬러 영향
    switch (choice.type) {
      case RoomType.Combat:
        nudgeColor([[0, 0.005], [3, 0.003]]); // Fire+, Iron+
        startCombat(room, false, el);
        break;
      case RoomType.Event:
        nudgeColor([[5, 0.005], [2, 0.003]]); // Wind+, Electric+
        startEvent(room, el);
        break;
      case RoomType.Rest:
        nudgeColor([[1, 0.005], [6, 0.003]]); // Water+, Light+
        startRest(el);
        break;
    }
  }

  function markChoiceCleared() {
    if (!runState || selectedChoiceIdx < 0) return;
    const choice = runState.choices[selectedChoiceIdx];
    if (choice) choice.cleared = true;
    runState.roomsCleared++;
    selectedChoiceIdx = -1;
  }

  function handleAdvanceStep(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    applyDungeonColorScaled(0.01); // 단계 진행 시 던전 영향
    pendingProgress += selectedDungeon.progressPerAdvance;

    const result = ds.advanceStep(runState, selectedDungeon, session.gameTime.hour);
    if (applyRuleAdvanceEffects(el)) return;
    switch (result) {
      case 'nextStep':
      case 'nextFloor':
        phase = 'navigate';
        renderNavigate(el);
        break;
      case 'midBoss': {
        const mb = ds.getMidBoss(selectedDungeon, runState.floor - 1);
        if (mb) {
          phase = 'midBoss';
          renderMidBoss(el, mb);
        } else {
          ds.continueAfterMidBoss(runState, selectedDungeon, session.gameTime.hour);
          phase = 'navigate';
          renderNavigate(el);
        }
        break;
      }
      case 'boss': {
        isBossFight = true;
        isMidBossFight = false;
        selectedChoiceIdx = -1;
        const bossRoom = ds.generateBossRoom(selectedDungeon);
        startCombat(bossRoom, true, el);
        break;
      }
    }
  }

  function handleExplore(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    const remainingCount = runState.choices.filter(c => !c.cleared).length;
    if (remainingCount === 0) return;
    const hpCost = Math.round(remainingCount * 0.10 * p.getEffectiveMaxHp());
    p.adjustHp(-hpCost);
    nudgeColor([[5, 0.01], [4, 0.005]]); // Wind+, Earth+ (탐험심)
    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 탐색을 강행했다. (HP -${hpCost})`, '행동');

    if (p.base.hp <= 0) {
      handleDefeat(el);
      return;
    }
    handleAdvanceStep(el);
  }

  function handleGiveUp(el: HTMLElement) {
    nudgeColor([[7, 0.03], [6, -0.02]]); // Dark+, Light- (포기의 그림자)
    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} ${selectedDungeon?.name ?? '던전'}에서 포기했다.`, '행동');
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
    pendingProgress = 0;
    selectedChoiceIdx = -1;
    isBossFight = false;
    isMidBossFight = false;
  }

  // ================================================================ giveup confirm
  function renderGiveUpConfirm(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <h2>포기</h2>
      <div style="text-align:center;margin:24px 0">
        <p>정말 포기하시겠습니까?</p>
        <p style="color:var(--warning);margin-top:8px">진행도와 기록은 저장되지 않습니다.</p>
      </div>
      <div class="menu-buttons" style="margin-top:12px">
        <button class="btn" data-action="cancel">1. 아니오</button>
        <button class="btn" data-action="confirm" style="border-color:var(--accent)">2. 예, 포기</button>
      </div>
      <p class="hint">1=취소, 2=포기</p>
    `;

    wrap.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      phase = 'navigate';
      renderNavigate(el);
    });
    wrap.querySelector('[data-action="confirm"]')?.addEventListener('click', () => handleGiveUp(el));
    el.appendChild(wrap);
  }

  // ================================================================ dungeon map
  function renderDungeonMap(el: HTMLElement) {
    if (!selectedDungeon || !runState) return;
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    const floorRows = [];
    for (let f = 0; f < runState.maxFloor; f++) {
      const isCurrent = f === runState.floor;
      const isCleared = f < runState.floor;
      const marker = isCurrent ? '▶' : isCleared ? '✓' : '·';
      const color = isCurrent ? 'var(--warning)' : isCleared ? 'var(--success)' : 'var(--text-dim)';
      const stepInfo = isCurrent ? ` (${runState.step + 1}/${runState.maxStep}단계)` : '';
      floorRows.push(`<div style="padding:4px 8px;color:${color};font-size:13px">${marker} ${f + 1}층${stepInfo}</div>`);

      // mid-boss indicator
      const mb = selectedDungeon.midBosses.find(m => m.afterFloor === f);
      if (mb) {
        const mbMonster = (ds as any).monsters?.get(mb.enemyId);
        const mbName = mbMonster?.name ?? mb.enemyId;
        const mbCleared = f < runState.floor;
        const mbColor = mbCleared ? 'var(--success)' : 'var(--accent)';
        floorRows.push(`<div style="padding:2px 20px;color:${mbColor};font-size:12px">⚔ 중간 보스: ${mbName}${mbCleared ? ' ✓' : ''}</div>`);
      }
    }
    // Boss
    const bossRoom = ds.generateBossRoom(selectedDungeon);
    floorRows.push(`<div style="padding:4px 8px;color:${runState.bossDefeated ? 'var(--success)' : 'var(--accent)'};font-size:13px;font-weight:600">★ 보스: ${bossRoom.label.replace('보스: ', '')}${runState.bossDefeated ? ' ✓' : ''}</div>`);

    wrap.innerHTML = `
      <h2>${selectedDungeon.name} — 던전 지도</h2>
      <div style="margin:16px 0;padding:12px;background:var(--bg-card);border-radius:6px">
        ${floorRows.join('')}
      </div>
      <div style="font-size:12px;color:var(--text-dim);text-align:center">
        처치 ${runState.roomsCleared} · ${runState.totalTurns}턴
      </div>
      <button class="btn btn-primary" data-action="close" style="margin-top:12px">닫기 [Esc]</button>
    `;

    wrap.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      phase = 'navigate';
      renderNavigate(el);
    });
    el.appendChild(wrap);
  }

  // ================================================================ mid-boss
  function renderMidBoss(el: HTMLElement, boss: import('../../models/dungeon').MonsterDef) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen';

    wrap.innerHTML = `
      <h2>⚔ 중간 보스!</h2>
      <div style="text-align:center;margin:24px 0">
        <p style="font-size:18px;font-weight:600">${boss.name}</p>
        <p style="color:var(--text-dim);margin-top:8px">다음 층으로 가려면 이 적을 쓰러뜨려야 한다.</p>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">
          HP: ${Math.round(p.base.hp)}/${Math.round(p.getEffectiveMaxHp())} · MP: ${Math.round(p.base.mp)}/${Math.round(p.getEffectiveMaxMp())}
        </div>
      </div>
      <button class="btn btn-primary" data-action="fight">전투 시작 [Enter]</button>
    `;

    wrap.querySelector('[data-action="fight"]')?.addEventListener('click', () => {
      isMidBossFight = true;
      isBossFight = false;
      selectedChoiceIdx = -1;
      const room: DungeonRoom = { type: RoomType.Combat, label: `중간 보스: ${boss.name}`, enemyId: boss.id };
      startCombat(room, true, el);
    });
    el.appendChild(wrap);
  }

  // ================================================================ combat
  function startCombat(room: DungeonRoom, isBoss: boolean, el: HTMLElement) {
    if (!selectedDungeon || !runState) return;

    const enemyId = room.enemyId ?? selectedDungeon.enemyIds[0];
    const enemy = ds.selectEnemy(selectedDungeon, runState.floor);
    const actualEnemy = isBoss
      ? (ds as any).monsters?.get(selectedDungeon.enemyIds[selectedDungeon.enemyIds.length - 1]) ?? enemy
      : (ds as any).monsters?.get(enemyId) ?? enemy;

    // 중간 보스는 mid-boss 전용 적 사용
    const combatEnemy = isMidBossFight
      ? ((ds as any).monsters?.get(enemyId) ?? actualEnemy)
      : actualEnemy;

    const partyActors = getPartyActors();
    combatState = createCombatState(p, combatEnemy, partyActors, selectedDungeon.id, isBoss || isMidBossFight);

    phase = 'combat';
    renderCombat(el);

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

    const skillBtns = ss.slots.map((def, i) => {
      if (!def) {
        return `<button class="btn skill-btn disabled" disabled>
          <div class="skill-name">—</div><div class="skill-key">[${i + 1}]</div>
        </button>`;
      }
      const blocked = ss.preDelayTurns > 0 || ss.postDelayTurns > 0;
      const cooldown = cs.skillUsedThisTurn;
      const skillUseOptions = getSkillUseOptions(selectedDungeon);
      const noMp = !canUseSkill(def, p, ss, skillUseOptions).ok
        && p.base.mp < getDisplayedSkillMpCost(def.mpCost, selectedDungeon);
      const noTp = def.tpCost > 0 && !p.hasAp(def.tpCost);
      const disabled = blocked || cooldown || noMp || noTp;
      const tpLabel = def.tpCost > 0 ? ` TP${def.tpCost}` : '';
      const mpCostLabel = getDisplayedSkillMpCost(def.mpCost, selectedDungeon);
      return `<button class="btn skill-btn${disabled ? ' disabled' : ''}" data-slot="${i}"${disabled ? ' disabled' : ''}>
        <div class="skill-name">${def.name}</div>
        <div class="skill-cost">MP${mpCostLabel}${tpLabel}</div>
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

    const bossLabel = isMidBossFight ? '⚔ 중간 보스: ' : isBossFight ? '★ 보스: ' : '';

    wrap.innerHTML = `
      <div class="combat-header">
        <h2>${bossLabel}${cs.enemy.name}</h2>
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

      <div class="tick-bar">
        <div class="tick-bar-fill" style="animation:tick-countdown ${getCombatTickMs(p)}ms linear forwards;animation-delay:-${Date.now() - cs.lastTickTime}ms"></div>
      </div>
      <p class="hint">1/2/3=스킬 (자동 공격 진행 중)${cs.skillUsedThisTurn ? ' · 스킬 대기 중' : ''} Esc=도주</p>
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
      combatState.combatLog.push(`${p.name}${iGa(p.name)} 도주했다!`);
    }
    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 전투에서 도주했다.`, '행동');
    combatState = null;

    nudgeColor([[7, 0.01], [5, 0.005]]); // Dark+, Wind+ (도주 본능)

    if (isBossFight || isMidBossFight) {
      // 보스/중간보스 도주 → 포기
      handleGiveUp(el);
    } else {
      // 일반 전투 도주 → 선택지 미클리어로 되돌아감
      selectedChoiceIdx = -1;
      phase = 'navigate';
      renderNavigate(el);
    }
  }

  /** 루트 결과를 플레이어에게 지급하고 텍스트 반환 */
  function applyLoot(drops: LootEntry[]): string[] {
    const lines: string[] = [];
    for (const d of drops) {
      if (d.itemId) {
        p.addItemById(d.itemId, d.amount);
        session.knowledge.discoverItem(d.itemId);
        const name = getItemDef(d.itemId)?.name ?? getWeaponDef(d.itemId)?.name ?? getArmorDef(d.itemId)?.name ?? d.itemId;
        lines.push(`${name} ×${d.amount}`);
      } else {
        p.addItem(d.item, d.amount);
        lines.push(`${categoryName(d.item)} ×${d.amount}`);
      }
    }
    return lines;
  }

  // ================================================================ victory
  function handleVictory(el: HTMLElement) {
    if (!selectedDungeon || !runState || !combatState) return;
    stopCombatTimer(combatState);

    const isBoss = isBossFight;
    const isMidBoss = isMidBossFight;
    const baseExpGain = (isBoss || isMidBoss) ? 50 + selectedDungeon.difficulty * 30 : 20 + selectedDungeon.difficulty * 10;
    const baseGoldGain = (isBoss || isMidBoss) ? 30 + selectedDungeon.difficulty * 20 : 10 + selectedDungeon.difficulty * 5;
    const prevProgress = p.getDungeonProgress(selectedDungeon.id);
    let expGain = baseExpGain;
    let goldGain = baseGoldGain;
    let bonusText = '';

    if (selectedDungeon.rule?.template === 'GreedRisk' && runState.greed > 0) {
      const greedBonus = Math.round(runState.greed * (4 + selectedDungeon.rule.rank));
      goldGain += greedBonus;
      bonusText = `욕심 보너스 +${greedBonus}G`;
    }
    if (selectedDungeon.rule?.template === 'PurityCurrent' && runState.purity > 0 && (isBoss || isMidBoss)) {
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
    session.gameTime.advance(30);

    // 전투 보상 아이템 (매 전투)
    const lootLines: string[] = [];
    const advLoot = rollLoot(selectedDungeon.lootPerAdvance);
    lootLines.push(...applyLoot(advLoot));

    // 보스/중간보스 추가 보상
    if (isBoss) {
      const clearLoot = rollLoot(selectedDungeon.lootOnClear);
      lootLines.push(...applyLoot(clearLoot));
    }

    // 레어 드롭
    if (selectedDungeon.lootRare.length > 0 && randomFloat(0, 1) < selectedDungeon.lootRareChance) {
      const rareLoot = rollLoot(selectedDungeon.lootRare);
      lootLines.push(...applyLoot(rareLoot));
    }

    // 몬스터 고유 루트
    if (combatState.enemy.lootTable.length > 0) {
      const monsterLoot = rollLoot(combatState.enemy.lootTable);
      lootLines.push(...applyLoot(monsterLoot));
    }

    const lootText = lootLines.length > 0 ? ` | 획득: ${lootLines.join(', ')}` : '';

    session.backlog.add(
      session.gameTime,
      `${p.name}${iGa(p.name)} ${combatState.enemy.name}${eulReul(combatState.enemy.name)} 토벌했다. EXP+${Math.round(expGain)}, ${Math.round(goldGain)}G${lootText}`,
      '행동',
    );

    runState.totalTurns += combatState.turn;

    if (isBoss) {
      // 최종 보스 격파 → 클리어
      applyDungeonColorScaled(0.08); // 던전 특성 강하게 반영
      nudgeColor([[6, 0.02]]); // Light+ (승리의 빛)
      pendingProgress += selectedDungeon.progressPerAdvance;
      runState.bossDefeated = true;
      session.knowledge.trackDungeonClear();
      p.addDungeonProgress(selectedDungeon.id, pendingProgress);
      const prev = p.dungeonBestTurns.get(selectedDungeon.id);
      const isNewRecord = !prev || runState.totalTurns < prev;
      if (isNewRecord) p.dungeonBestTurns.set(selectedDungeon.id, runState.totalTurns);
      session.backlog.add(session.gameTime, `${selectedDungeon.name} 클리어! (${runState.totalTurns}턴)${isNewRecord ? ' ★신기록!' : ''}`, '행동');

      const curProgress = p.getDungeonProgress(selectedDungeon.id);
      const unlockedHidden = hasHiddenRoute(selectedDungeon) && prevProgress < (selectedDungeon.hiddenUnlockProgress ?? 100);
      const bestTurns = p.dungeonBestTurns.get(selectedDungeon.id);
      const srLimit = selectedDungeon.sRankTurnLimit;
      const sRankThisRun = srLimit != null && runState.totalTurns <= srLimit;

      phase = 'victory';
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';
      wrap.innerHTML = `
        <h2>★ 보스 격파!</h2>
        <div style="text-align:center;margin:12px 0">
          <p>${combatState.enemy.name}${eulReul(combatState.enemy.name)} 쓰러뜨렸다!</p>
          <p>EXP +${Math.round(expGain)} | ${Math.round(goldGain)}G</p>
          ${lootLines.length > 0 ? `<p style="color:var(--accent)">획득: ${lootLines.join(', ')}</p>` : ''}
          ${bonusText ? `<p style="color:var(--accent2)">${bonusText}</p>` : ''}
          ${leveledUp ? `<p style="color:var(--success)">레벨 업! Lv.${p.base.level}</p>` : ''}
          <p style="color:var(--text-dim)">진행도: ${curProgress}%</p>
          ${unlockedHidden && selectedDungeon.hiddenLocation ? `<p style="color:#6ba3d6">숨겨진 지역 ${locationName(selectedDungeon.hiddenLocation)}${iGa(locationName(selectedDungeon.hiddenLocation!))} 열렸다.</p>` : ''}
          ${sRankThisRun ? `<p style="color:var(--success);font-weight:700">★ S랭크! (클리어 ${runState.totalTurns}턴 / 제한 ${srLimit}턴 이내)</p>` : ''}
          <p style="color:var(--warning);font-size:13px">클리어 턴: ${runState.totalTurns}${bestTurns === runState.totalTurns ? ' ★신기록!' : ` (최단: ${bestTurns}턴)`}</p>
        </div>
        <button class="btn btn-primary" data-action="clear">던전 클리어! [Enter]</button>
      `;
      wrap.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
        resetDungeon();
        renderList(el);
      });
      el.appendChild(wrap);

    } else if (isMidBoss) {
      // 중간 보스 격파 → 다음 층으로
      applyDungeonColorScaled(0.04); // 중간 보스 영향
      nudgeColor([[6, 0.01]]); // Light+
      phase = 'victory';
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';
      wrap.innerHTML = `
        <h2>⚔ 중간 보스 격파!</h2>
        <div style="text-align:center;margin:12px 0">
          <p>${combatState.enemy.name}${eulReul(combatState.enemy.name)} 쓰러뜨렸다!</p>
          <p>EXP +${Math.round(expGain)} | ${Math.round(goldGain)}G</p>
          ${lootLines.length > 0 ? `<p style="color:var(--accent)">획득: ${lootLines.join(', ')}</p>` : ''}
          ${bonusText ? `<p style="color:var(--accent2)">${bonusText}</p>` : ''}
          ${leveledUp ? `<p style="color:var(--success)">레벨 업! Lv.${p.base.level}</p>` : ''}
        </div>
        <button class="btn btn-primary" data-action="continue">${runState.floor + 1}층으로 전진 [Enter]</button>
      `;
      wrap.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
        combatState = null;
        isMidBossFight = false;
        ds.continueAfterMidBoss(runState!, selectedDungeon!, session.gameTime.hour);
        phase = 'navigate';
        renderNavigate(el);
      });
      el.appendChild(wrap);

    } else {
      // 일반 전투 승리 → 선택지 클리어, 탐색 화면으로
      applyDungeonColorScaled(0.02); // 전투 승리 영향
      markChoiceCleared();
      combatState = null;

      phase = 'victory';
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'screen info-screen';
      wrap.innerHTML = `
        <h2>승리!</h2>
        <div style="text-align:center;margin:12px 0">
          <p>적을 쓰러뜨렸다!</p>
          <p>EXP +${Math.round(expGain)} | ${Math.round(goldGain)}G</p>
          ${lootLines.length > 0 ? `<p style="color:var(--accent)">획득: ${lootLines.join(', ')}</p>` : ''}
          ${bonusText ? `<p style="color:var(--accent2)">${bonusText}</p>` : ''}
          ${leveledUp ? `<p style="color:var(--success)">레벨 업! Lv.${p.base.level}</p>` : ''}
        </div>
        <button class="btn btn-primary" data-action="continue">계속 [Enter]</button>
      `;
      wrap.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
        phase = 'navigate';
        renderNavigate(el);
      });
      el.appendChild(wrap);
    }
  }

  // ================================================================ defeat
  function handleDefeat(el: HTMLElement) {
    if (combatState) stopCombatTimer(combatState);

    p.base.hp = Math.max(1, Math.round(p.getEffectiveMaxHp() * 0.5));
    const travelMins = session.world.getShortestMinutes(p.currentLocation, p.homeLocation, session.gameTime.day);
    const recoveryMins = 8 * 60;
    session.gameTime.advance(travelMins + recoveryMins);
    p.currentLocation = p.homeLocation;
    p.color.values[7] = Math.min(1, (p.color.values[7] ?? 0.5) + 0.05);
    p.color.values[6] = Math.max(0, (p.color.values[6] ?? 0.5) - 0.03);

    session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 쓰러져 자택에서 깨어났다...`, '행동');

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
      markChoiceCleared();
      phase = 'navigate';
      renderNavigate(el);
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
        markChoiceCleared();
        phase = 'navigate';
        renderNavigate(el);
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
        <button class="btn btn-primary" data-action="rest">1. 휴식하기 (HP+${restRecovery.hp}, MP+${restRecovery.mp})</button>
        <button class="btn" data-action="skip">2. 그냥 지나치기</button>
      </div>
      <p class="hint">1=휴식, 2=지나침</p>
    `;

    wrap.querySelector('[data-action="rest"]')?.addEventListener('click', () => {
      if (!selectedDungeon) return;
      nudgeColor([[1, 0.01], [6, 0.005], [0, -0.003]]); // Water+, Light+, Fire- (평온한 휴식)
      p.adjustHp(restRecovery.hp);
      p.adjustMp(restRecovery.mp);
      if (selectedDungeon?.rule?.template === 'HeatGauge' && runState) {
        runState.heat = Math.max(0, runState.heat - (2 + Math.floor(selectedDungeon.rule.rank / 2)));
      }
      if (selectedDungeon?.rule?.template === 'PurityCurrent' && runState) {
        runState.purity = Math.min(9, runState.purity + 2);
      }
      session.gameTime.advance(10);
      session.backlog.add(session.gameTime, `${p.name}${iGa(p.name)} 던전에서 휴식했다.`, '행동');
      markChoiceCleared();
      phase = 'navigate';
      renderNavigate(el);
    });

    wrap.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
      markChoiceCleared();
      phase = 'navigate';
      renderNavigate(el);
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
        case 'midBoss': break; // rendered inline
        case 'map': renderDungeonMap(el); break;
        case 'giveUpConfirm': renderGiveUpConfirm(el); break;
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
          phase = 'giveUpConfirm';
          renderGiveUpConfirm(container);
        } else if (phase === 'giveUpConfirm') {
          phase = 'navigate';
          renderNavigate(container);
        } else if (phase === 'map') {
          phase = 'navigate';
          renderNavigate(container);
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
      } else if (phase === 'navigate' && !tutorialShown) {
        if (key === 'Enter') {
          tutorialShown = true;
          renderNavigate(container);
        }
      } else if (phase === 'navigate') {
        if (/^[1-9]$/.test(key)) {
          const idx = parseInt(key, 10) - 1;
          if (runState && idx < runState.choices.length && !runState.choices[idx].cleared) {
            enterChoice(idx, container);
          }
        } else if (key === 'Enter') {
          const btn = container.querySelector('[data-action="advance"]') as HTMLButtonElement | null;
          btn?.click();
        }
      } else if (phase === 'combat') {
        if (key === '1') handleSkillUse(0, container);
        else if (key === '2') handleSkillUse(1, container);
        else if (key === '3') handleSkillUse(2, container);
      } else if (phase === 'victory' || phase === 'midBoss') {
        if (key === 'Enter' || key === '1') {
          const btn = container.querySelector('[data-action="clear"]') as HTMLButtonElement
            ?? container.querySelector('[data-action="continue"]') as HTMLButtonElement
            ?? container.querySelector('[data-action="fight"]') as HTMLButtonElement;
          btn?.click();
        }
      } else if (phase === 'giveUpConfirm') {
        if (key === '1') {
          phase = 'navigate';
          renderNavigate(container);
        } else if (key === '2') {
          handleGiveUp(container);
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
      if (combatState) stopCombatTimer(combatState);
    },
  };
}
