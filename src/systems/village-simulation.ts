// village-simulation.ts — 마을 전용 일일 틱 로직

import {
  VillageState,
  calcPopGrowth,
  checkVillageStageUp,
  recalcVillageFinance,
  recalcVillageStats,
} from '../models/village';
import { getAllVillageEventDefs, getFacilityDef, getRoadDef, getVillageEventDef, getBenzenLine } from '../data/village-defs';
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

  // 1. 재무 정산 + stats 갱신
  recalcVillageFinance(village, getFacilityDef, getRoadDef);
  recalcVillageStats(village, getFacilityDef);
  const net = village.finance.totalIncomePerDay - village.finance.totalMaintenancePerDay;
  if (net !== 0) {
    village.finance.treasury += net;
    result.financeDelta = net;
  }
  village.finance.lastSettledDay = currentDay;

  // C1+C2: 금고 마이너스 시 유지비 높은 시설부터 suspended 처리
  if (village.finance.treasury < 0) {
    const activeFacilities = village.facilities
      .filter(f => f.status === 'active')
      .sort((a, b) => (getFacilityDef(b.facilityId)?.maintenancePerDay ?? 0) - (getFacilityDef(a.facilityId)?.maintenancePerDay ?? 0));
    for (const f of activeFacilities) {
      if (village.finance.treasury >= 0) break;
      f.status = 'suspended';
      recalcVillageFinance(village, getFacilityDef, getRoadDef);
      log.add(gameTime, `[${village.name}] ${getFacilityDef(f.facilityId)?.name ?? f.facilityId} 시설이 유지비 부족으로 정지됨`, '마을');
    }
    village.happiness = Math.max(0, village.happiness - 5);
  }

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
  const STAGE_NAMES = ['', '야영지', '작은마을', '마을', '읍', '소도시', '도시', '왕도'];
  if (checkVillageStageUp(village)) {
    village.stage = (village.stage + 1) as any;
    result.stageUp = true;
    result.newStage = village.stage;
    const stageName = STAGE_NAMES[village.stage] ?? `단계 ${village.stage}`;
    log.add(gameTime, `[${village.name}] 마을이 "${stageName}"(으)로 성장했다!`, '마을');
    const stageKey = `stage:${village.stage - 1}to${village.stage}`;
    const benzenComment = getBenzenLine(stageKey);
    if (benzenComment && benzenComment !== '...') {
      log.add(gameTime, `[벤젠] "${benzenComment}"`, '마을');
    }
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

  // 5. NPC 방문 수입 (단계 3+)
  if (village.stage >= 3) {
    // visitingNpcCount는 tickVillage 호출 전 외부에서 갱신됨
    const visitCount = village.visitingNpcCount;
    if (visitCount > 0) {
      const incomePerVisitor = Math.max(2, Math.floor(2 + village.stage * 0.5 + village.reputation * 0.05));
      const income = visitCount * incomePerVisitor;
      village.finance.treasury += income;
      village.totalVisitorIncome += income;
      village.totalVisitorDays += visitCount;
      result.financeDelta += income;
    }
  }

  // 6. 이벤트 트리거 체크 (activeEvent 없을 때만)
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

  // 일반 이벤트: 명성·단계 반영 동적 확률 (최소 3%, 최대 15%)
  const eventChance = Math.min(0.15, 0.03 + village.reputation * 0.0004 + village.stage * 0.002);
  if (Math.random() > eventChance) return null;
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

  // C7: goldCost 차감
  const cost = choice.goldCost ?? 0;
  if (cost > 0) {
    village.finance.treasury -= cost;
  }

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

  // C4: 칭호 카운터 갱신
  if (success && def.category === 'crisis') {
    village.crisisEventSuccessCount = (village.crisisEventSuccessCount ?? 0) + 1;
  }
  if (def.id === 'spring_festival' && success) {
    village.springFestivalCount = (village.springFestivalCount ?? 0) + 1;
  }

  // 이벤트 완료 처리
  village.activeEvent.resolvedDay = currentDay;
  village.activeEvent.outcome = success ? 'success' : 'failure';
  village.eventHistory.push({ ...village.activeEvent });
  village.activeEvent = null;

  log.add(gameTime, `[${village.name}] 이벤트 결과: ${msg}`, '마을');
  return msg;
}
