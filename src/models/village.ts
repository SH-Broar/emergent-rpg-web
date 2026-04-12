// village.ts — 마을 상태 모델

export type VillageFacilityStatus = 'active' | 'suspended'; // suspended = 유지비 미납

export interface VillageFacilityInstance {
  facilityId: string;   // village-facilities.txt 섹션 ID
  builtDay: number;     // 건설 완료 일자
  status: VillageFacilityStatus;
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
  };
}

/** 활성 시설 목록 */
export function getActiveFacilities(v: VillageState): VillageFacilityInstance[] {
  return v.facilities.filter(f => f.status === 'active');
}

/** 일일 수입 재계산 (시설 추가/제거 시 호출) */
export function recalcVillageFinance(
  v: VillageState,
  getFacilityDef: (id: string) => { incomePerDay: number; maintenancePerDay: number } | undefined,
): void {
  let income = 0;
  let maintenance = 0;
  for (const f of v.facilities) {
    if (f.status !== 'active') continue;
    const def = getFacilityDef(f.facilityId);
    if (!def) continue;
    income += def.incomePerDay;
    maintenance += def.maintenancePerDay;
  }
  v.finance.totalIncomePerDay = income;
  v.finance.totalMaintenancePerDay = maintenance;
}

/** 단계 승급 조건 체크 (Phase 1: stage 1만 존재하므로 stub) */
export function checkVillageStageUp(_v: VillageState): boolean {
  // Phase 2에서 구현
  return false;
}
