// village-simulation.ts — 마을 전용 일일 틱 로직

import {
  VillageState,
  calcPopGrowth,
  checkVillageStageUp,
  recalcVillageFinance,
} from '../models/village';
import { getAllVillageEventDefs, getFacilityDef, getVillageEventDef } from '../data/village-defs';
import { VillageEventDef } from '../models/village-event';
import { Backlog } from '../models/backlog';
import { GameTime } from '../types/game-time';

export interface VillageTickResult {
  stageUp: boolean;
  newStage: number;
  popGrowth: number;
  eventTriggered: VillageEventDef | null;
  financeDelta: number;
}

// 계절 번호 → 영문 키
export function toSeasonKey(season: number): string {
  const map = ['spring', 'summer', 'autumn', 'winter'];
  return map[season % 4] ?? 'spring';
}

export function tickVillage(
  village: VillageState,
  currentDay: number,
  currentSeason: string, // 'spring'|'summer'|'autumn'|'winter'
  log: Backlog,
  gameTime: GameTime,
): VillageTickResult {
  const result: VillageTickResult = {
    stageUp: false,
    newStage: village.stage,
    popGrowth: 0,
    eventTriggered: null,
    financeDelta: 0,
  };

  // 1. 재무 정산
  recalcVillageFinance(village, getFacilityDef);
  const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;
  if (net !== 0) {
    village.finance.treasury += net;
    result.financeDelta = net;
  }
  village.finance.lastSettledDay = currentDay;

  // 2. 인구 성장
  if (village.lastPopGrowthDay < currentDay) {
    const growth = calcPopGrowth(village);
    if (growth > 0) {
      village.population += growth;
      result.popGrowth = growth;
      log.add(gameTime, `[${village.name}] 인구 ${growth}명 증가 → 총 ${village.population}명`, '마을');
    }
    village.lastPopGrowthDay = currentDay;
  }

  // 3. 단계 승급 체크
  if (checkVillageStageUp(village)) {
    village.stage = (village.stage + 1) as any;
    result.stageUp = true;
    result.newStage = village.stage;
    log.add(gameTime, `[${village.name}] 마을이 단계 ${village.stage}로 성장했다!`, '마을');
  }

  // 4. 벤젠 등장 트리거 (시설 1개 이상 건설 후 1회)
  if (!village.benzenAppeared && village.facilities.length >= 1) {
    village.benzenAppeared = true;
    const benzenEvent = getAllVillageEventDefs().find(e => e.id === 'benzen_arrival');
    if (benzenEvent && !village.activeEvent) {
      village.activeEvent = {
        eventId: 'benzen_arrival',
        triggeredDay: currentDay,
      };
      result.eventTriggered = benzenEvent;
      log.add(gameTime, `[${village.name}] 이벤트 발생: ${benzenEvent.name}`, '마을');
    }
  }

  // 5. 이벤트 트리거 체크 (activeEvent 없을 때만)
  if (!village.activeEvent) {
    const triggered = rollVillageEvent(village, currentDay, currentSeason);
    if (triggered) {
      village.activeEvent = {
        eventId: triggered.id,
        triggeredDay: currentDay,
      };
      result.eventTriggered = triggered;
      log.add(gameTime, `[${village.name}] 이벤트 발생: ${triggered.name}`, '마을');
    }
  }

  return result;
}

function rollVillageEvent(
  village: VillageState,
  currentDay: number,
  currentSeason: string,
): VillageEventDef | null {
  const defs = getAllVillageEventDefs();
  const completedIds = new Set(village.eventHistory.map(e => e.eventId));

  const candidates = defs.filter(def => {
    // special 이벤트는 별도 트리거
    if (def.category === 'special') return false;

    // 성장 이벤트: 1회성
    if (def.category === 'growth') {
      if (completedIds.has(def.id)) return false;
      return village.population >= def.triggerPopMin;
    }

    // 쿨다운 체크
    const lastOccurrence = village.eventHistory
      .filter(e => e.eventId === def.id)
      .sort((a, b) => b.triggeredDay - a.triggeredDay)[0];
    if (lastOccurrence && currentDay - lastOccurrence.triggeredDay < def.cooldownDays) return false;

    // 조건 체크
    if (village.stage < def.triggerStageMin) return false;
    if (village.stage > def.triggerStageMax) return false;
    if (village.population < def.triggerPopMin) return false;
    if (village.reputation < def.triggerRepMin) return false;
    if (def.triggerSeason && def.triggerSeason !== currentSeason) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  // 성장 이벤트는 조건 충족 시 즉시 발생
  const growthCandidate = candidates.find(c => c.category === 'growth');
  if (growthCandidate) return growthCandidate;

  // 일반 이벤트: 5% 확률
  if (Math.random() > 0.05) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 이벤트 선택지 결과 적용
 */
export function applyVillageEventChoice(
  village: VillageState,
  choiceIndex: 0 | 1,
  currentDay: number,
  log: Backlog,
  gameTime: GameTime,
): string {
  if (!village.activeEvent) return '';

  const def = getVillageEventDef(village.activeEvent.eventId);
  if (!def) {
    village.activeEvent = null;
    return '';
  }

  const choice = def.choices[choiceIndex];
  const success = Math.random() < choice.successChance;
  const effects = success ? choice.onSuccess : choice.onFailure;
  const msg = success ? choice.successMsg : choice.failureMsg;

  // 효과 적용
  if (effects.populationDelta) {
    village.population = Math.max(0, village.population + effects.populationDelta);
  }
  if (effects.happinessDelta) {
    village.happiness = Math.max(0, Math.min(100, village.happiness + effects.happinessDelta));
  }
  if (effects.defenseDelta) {
    village.defense = Math.max(0, Math.min(100, village.defense + effects.defenseDelta));
  }
  if (effects.reputationDelta) {
    village.reputation = Math.max(0, Math.min(100, village.reputation + effects.reputationDelta));
  }
  if (effects.treasuryDelta) {
    village.finance.treasury += effects.treasuryDelta;
  }

  // 이벤트 완료 처리
  village.activeEvent.resolvedDay = currentDay;
  village.activeEvent.outcome = success ? 'success' : 'failure';
  village.eventHistory.push({ ...village.activeEvent });
  village.activeEvent = null;

  log.add(gameTime, `[${village.name}] 이벤트 결과: ${msg}`, '마을');
  return msg;
}
