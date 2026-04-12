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
  // Phase 3 추가
  visitingNpcCount: number;             // 오늘 방문 중인 NPC 수
  totalVisitorIncome: number;           // 누계 방문자 수입 (칭호용)
  totalVisitorDays: number;             // 누계 방문자-일 (주민의 친구 칭호용)
  crisisEventSuccessCount: number;      // 위기 이벤트 성공 횟수
  springFestivalCount: number;          // 봄 축제 성공 횟수
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
    visitingNpcCount: 0,
    totalVisitorIncome: 0,
    totalVisitorDays: 0,
    crisisEventSuccessCount: 0,
    springFestivalCount: 0,
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
  // Phase 3 신규
  if (v.stage === 4 && activeFacilityCount >= 15 && v.population >= 35) return true;
  if (v.stage === 5 && activeFacilityCount >= 25 && v.population >= 70) return true;
  if (v.stage === 6 && activeFacilityCount >= 50 && v.population >= 200) return true;
  // stage === 7은 최대 단계
  return false;
}

/**
 * 마을 도로 중 특정 연결에 적용되는 최고 등급 도로의 speedMultiplier 반환.
 * 도로가 없으면 1.0 반환.
 */
export function getVillageRoadMultiplier(
  v: VillageState,
  targetLocationId: string,
  getRoadDef: (id: string) => { grade: number; travelSpeedMultiplier: number } | undefined,
): number {
  const roadsToTarget = v.roads.filter(
    r => r.status === 'active' && r.connectedLocationId === targetLocationId,
  );
  if (roadsToTarget.length === 0) return 1.0;
  let best = 1.0;
  for (const r of roadsToTarget) {
    const def = getRoadDef(r.roadId);
    if (def && def.travelSpeedMultiplier < best) best = def.travelSpeedMultiplier;
  }
  return best;
}

/** 활성 시설의 happiness/defense 보너스 합산 후 마을 stats 반영 */
export function recalcVillageStats(
  v: VillageState,
  getFacilityDef: (id: string) => { happinessBonus?: number; defenseBonus?: number; tiers?: { happinessBonus: number; defenseBonus: number }[] } | undefined,
): void {
  let happinessBonus = 0;
  let defenseBonus = 0;
  for (const f of v.facilities) {
    if (f.status !== 'active') continue;
    const def = getFacilityDef(f.facilityId);
    if (!def) continue;
    const tier = f.tier ?? 1;
    const tierDef = def.tiers?.[tier - 1];
    happinessBonus += tierDef?.happinessBonus ?? def.happinessBonus ?? 0;
    defenseBonus += tierDef?.defenseBonus ?? def.defenseBonus ?? 0;
  }
  v.happiness = Math.min(100, Math.max(0, 50 + happinessBonus));
  v.defense = Math.min(100, Math.max(0, defenseBonus));
}

/** 매력도 계산 (M4: 시설 티어 합산 + 행복도/명성 반영) */
export function calcVillageAttraction(v: VillageState): number {
  const activeFacilities = getActiveFacilities(v);
  const facilityScore = activeFacilities.reduce((sum, f) => sum + (f.tier ?? 1), 0);
  return facilityScore * 4 + v.happiness * 0.5 + v.reputation * 0.3;
}

/** 일일 인구 증가량 계산 */
export function calcPopGrowth(v: VillageState): number {
  const attraction = calcVillageAttraction(v);
  const raw = (attraction - v.population * 1.5) * 0.08;
  const maxGrowthPerDay = Math.min(v.stage + 1, 5); // stage 1→2명, stage 4+→5명
  return Math.min(maxGrowthPerDay, Math.max(0, Math.floor(raw)));
}
