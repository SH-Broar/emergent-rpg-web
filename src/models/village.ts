// village.ts — 마을 상태 모델

export type VillageFacilityStatus = 'active' | 'suspended'; // suspended = 유지비 미납

export interface VillageFacilityInstance {
  facilityId: string;   // village-facilities.txt 섹션 ID
  builtDay: number;     // 건설 완료 일자
  status: VillageFacilityStatus;
  tier: 1 | 2 | 3;     // Phase 2 추가: 기본 1
  upgradedDay?: number; // 마지막 업그레이드 일자
}

export type VillageRoadStatus = 'active' | 'suspended';

export interface VillageRoadInstance {
  roadId: string;       // village-roads.txt 섹션 ID
  connectedLocationId: string; // 연결 대상 LocationID
  builtDay: number;
  status: VillageRoadStatus;
}

export type VillageStage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface VillageFinance {
  totalIncomePerDay: number;     // 활성 시설 합산 수입
  totalMaintenancePerDay: number;// 활성 시설 합산 유지비
  treasury: number;              // 마을 금고 (플레이어 골드와 별개)
  lastSettledDay: number;        // 마지막 정산일
}

// 마을 이벤트 인스턴스 (활성 이벤트)
export interface VillageActiveEvent {
  eventId: string;
  triggeredDay: number;
  resolvedDay?: number;
  outcome?: 'success' | 'failure';
}

// 마을 전문화
export type VillageSpecialization = 'none' | 'production' | 'trade' | 'defense' | 'culture';

export interface VillageState {
  locationId: string;         // 월드에 등록된 LocationID (예: "PlayerVillage_Aster")
  name: string;               // 플레이어가 입력한 마을 이름
  foundedDay: number;         // 건설 완료 일자
  stage: VillageStage;        // 현재 성장 단계 (1~7)
  population: number;         // 현재 인구
  happiness: number;          // 행복도 (0~100)
  defense: number;            // 방어도 (0~100)
  facilities: VillageFacilityInstance[];
  roads: VillageRoadInstance[];
  finance: VillageFinance;
  // Phase 2 추가
  reputation: number;                    // 명성 0~100
  specialization: VillageSpecialization;
  activeEvent: VillageActiveEvent | null; // 현재 진행 중인 이벤트
  eventHistory: VillageActiveEvent[];
  benzenAppeared: boolean;               // 벤젠 첫 등장 여부
  lastPopGrowthDay: number;              // 마지막 인구 증가 처리일
}

export function createVillageState(
  locationId: string,
  name: string,
  foundedDay: number,
): VillageState {
  return {
    locationId,
    name,
    foundedDay,
    stage: 1,
    population: 1,
    happiness: 50,
    defense: 0,
    facilities: [],
    roads: [],
    finance: {
      totalIncomePerDay: 0,
      totalMaintenancePerDay: 0,
      treasury: 0,
      lastSettledDay: foundedDay,
    },
    reputation: 0,
    specialization: 'none',
    activeEvent: null,
    eventHistory: [],
    benzenAppeared: false,
    lastPopGrowthDay: foundedDay,
  };
}

/** 활성 시설 목록 */
export function getActiveFacilities(v: VillageState): VillageFacilityInstance[] {
  return v.facilities.filter(f => f.status === 'active');
}

/** 일일 수입 재계산 (시설 추가/제거/업그레이드 시 호출) */
export function recalcVillageFinance(
  v: VillageState,
  getFacilityDef: (id: string) => { incomePerDay: number; maintenancePerDay: number; tiers?: { incomePerDay: number; maintenancePerDay: number }[] } | undefined,
): void {
  let income = 0;
  let maintenance = 0;

  // 전문화 배율
  const specCategory = v.specialization;

  for (const f of v.facilities) {
    if (f.status !== 'active') continue;
    const def = getFacilityDef(f.facilityId);
    if (!def) continue;

    let tierIncome = def.incomePerDay;
    let tierMaint = def.maintenancePerDay;

    // 티어별 수치 우선 사용
    if (def.tiers && def.tiers.length >= (f.tier ?? 1)) {
      const tierDef = def.tiers[(f.tier ?? 1) - 1];
      if (tierDef) {
        tierIncome = tierDef.incomePerDay;
        tierMaint = tierDef.maintenancePerDay;
      }
    }

    income += tierIncome;
    maintenance += tierMaint;
  }

  // 전문화 보너스 (수입에만 적용)
  if (specCategory !== 'none') {
    let boostedIncome = 0;
    let normalIncome = 0;
    for (const f of v.facilities) {
      if (f.status !== 'active') continue;
      const def = getFacilityDef(f.facilityId) as any;
      if (!def) continue;
      let tierIncome = def.incomePerDay;
      if (def.tiers && def.tiers.length >= (f.tier ?? 1)) {
        const tierDef = def.tiers[(f.tier ?? 1) - 1];
        if (tierDef) tierIncome = tierDef.incomePerDay;
      }
      const facCategory = def.category ?? '';
      const matchesSpec =
        (specCategory === 'production' && facCategory === 'production') ||
        (specCategory === 'trade' && (facCategory === 'amenity' || facCategory === 'admin')) ||
        (specCategory === 'defense' && facCategory === 'defense') ||
        (specCategory === 'culture' && facCategory === 'culture');

      if (matchesSpec) {
        boostedIncome += tierIncome * 1.3;
      } else {
        normalIncome += tierIncome * 0.9;
      }
    }
    income = boostedIncome + normalIncome;
  }

  v.finance.totalIncomePerDay = Math.floor(income);
  v.finance.totalMaintenancePerDay = Math.floor(maintenance);
}

/** 단계 승급 조건 체크 */
export function checkVillageStageUp(v: VillageState): boolean {
  const activeFacilityCount = getActiveFacilities(v).length;
  if (v.stage === 1 && activeFacilityCount >= 1) return true;
  if (v.stage === 2 && activeFacilityCount >= 3 && v.population >= 5) return true;
  if (v.stage === 3 && activeFacilityCount >= 8 && v.population >= 15) return true;
  return false;
}

/** 매력도 계산 */
export function calcVillageAttraction(v: VillageState): number {
  const activeFacCount = getActiveFacilities(v).length;
  return activeFacCount * 3 + v.happiness * 0.5;
}

/** 일일 인구 증가량 계산 */
export function calcPopGrowth(v: VillageState): number {
  const attraction = calcVillageAttraction(v);
  const raw = (attraction - v.population * 1.5) * 0.08;
  return Math.min(2, Math.max(0, Math.floor(raw)));
}
