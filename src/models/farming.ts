// farming.ts — 격자 기반 농사 시스템

export type FarmPlan =
  | 'stable'      // 안정 농법
  | 'natural'     // 자연 순응
  | 'intensive'   // 집중 관리
  | 'neglect'     // 방임 재배
  | 'specialty';  // 특산물 재배

export interface FarmPlanDef {
  id: FarmPlan;
  name: string;
  description: string;
  revenueMultiplier: number;
  costModifier: number; // 추가 비용 비율 (0.2 = 기본가의 20% 추가)
  ignoreWeather: boolean;
  ignoreManagement: boolean;
  tendPerDay: number; // 권장 관리 횟수/일
}

export const FARM_PLANS: FarmPlanDef[] = [
  {
    id: 'stable',
    name: '안정 농법',
    description: '날씨·계절 영향 제거. 수익 고정. 비용 +20%.',
    revenueMultiplier: 1.0,
    costModifier: 0.2,
    ignoreWeather: true,
    ignoreManagement: false,
    tendPerDay: 1,
  },
  {
    id: 'natural',
    name: '자연 순응',
    description: '날씨·계절 영향 완전 반영. 추가 비용 없음.',
    revenueMultiplier: 1.0,
    costModifier: 0,
    ignoreWeather: false,
    ignoreManagement: false,
    tendPerDay: 1,
  },
  {
    id: 'intensive',
    name: '집중 관리',
    description: '하루 2회 관리 권장. 수익 +40%.',
    revenueMultiplier: 1.4,
    costModifier: 0,
    ignoreWeather: false,
    ignoreManagement: false,
    tendPerDay: 2,
  },
  {
    id: 'neglect',
    name: '방임 재배',
    description: '관리 불필요. 수익 ±40% 랜덤.',
    revenueMultiplier: 1.0,
    costModifier: 0,
    ignoreWeather: false,
    ignoreManagement: true,
    tendPerDay: 0,
  },
  {
    id: 'specialty',
    name: '특산물 재배',
    description: '지역 특산물만 재배. 수익 +60%, 비용 +30%.',
    revenueMultiplier: 1.6,
    costModifier: 0.3,
    ignoreWeather: false,
    ignoreManagement: false,
    tendPerDay: 1,
  },
];

export function getFarmPlanDef(plan: FarmPlan): FarmPlanDef {
  return FARM_PLANS.find(p => p.id === plan) ?? FARM_PLANS[1];
}

export interface FarmCell {
  cropId: string;         // '' = 빈 칸
  plan: FarmPlan;
  plantedDay: number;     // 파종한 gameTime.day
  growthDays: number;     // 성장 소요 일수 (파종 시 CropDef에서 복사)
  managementScore: number; // 0-100
  destroyed: boolean;     // 병충해로 파괴됨
}

export interface FarmState {
  locationId: string;
  gridWidth: number;      // 2 또는 3
  gridHeight: number;
  cells: FarmCell[];      // 길이 = gridWidth * gridHeight
  tendCountToday: number; // 오늘 관리 횟수
  lastTendDay: number;    // 관리 횟수 초기화 기준일
}

export type FarmEventType = 'bumper' | 'blight' | 'pest' | 'frost';

export interface FarmTickResult {
  harvestedGold: number;
  harvestLog: string[];
  destroyedCells: number;
}

export function createEmptyCell(): FarmCell {
  return {
    cropId: '', plan: 'natural', plantedDay: 0,
    growthDays: 0, managementScore: 100, destroyed: false,
  };
}

export function createFarmState(
  locationId: string,
  gridWidth: number,
  gridHeight: number,
): FarmState {
  const cellCount = gridWidth * gridHeight;
  return {
    locationId,
    gridWidth,
    gridHeight,
    cells: Array.from({ length: cellCount }, createEmptyCell),
    tendCountToday: 0,
    lastTendDay: -1,
  };
}

export function isCellReady(cell: FarmCell, currentDay: number): boolean {
  return cell.cropId !== '' && !cell.destroyed
    && currentDay >= cell.plantedDay + cell.growthDays;
}

/** 관리도 관련 배율 계산 */
function managementMultiplier(score: number): number {
  return Math.max(0.3, Math.min(1.0, score / 100));
}

/** 단일 셀 수확 가치 계산 */
export function calculateHarvestValue(
  cell: FarmCell,
  cropBasePrice: number,
  cropSeasonBonus: Partial<Record<number, number>>,
  cropWeatherBonus: Partial<Record<number, number>>,
  currentSeason: number,
  currentWeather: number,
  baseLevel: number,
  farmEvent: FarmEventType | null,
  rng: () => number,
): number {
  const plan = getFarmPlanDef(cell.plan);

  let value = cropBasePrice;

  // 날씨/계절 배율
  if (!plan.ignoreWeather) {
    const sb = cropSeasonBonus[currentSeason] ?? 0;
    const wb = cropWeatherBonus[currentWeather] ?? 0;
    value *= (1 + sb + wb);
  }

  // 관리도 배율
  if (plan.ignoreManagement) {
    // 방임 재배: ±40% 랜덤
    value *= 0.6 + rng() * 0.8;
  } else {
    value *= managementMultiplier(cell.managementScore);
  }

  // 운 배율
  value *= 0.85 + rng() * 0.3;

  // 계획 배율
  value *= plan.revenueMultiplier;

  // 집 레벨 배율 (Lv3=1.0, Lv4=1.1, Lv5=1.2)
  const levelMul = 1.0 + Math.max(0, baseLevel - 3) * 0.1;
  value *= levelMul;

  // 이벤트 배율
  if (farmEvent === 'bumper') value *= 1.5;
  else if (farmEvent === 'blight') value *= 0.7;
  else if (farmEvent === 'frost') value *= 0.8;

  return Math.max(1, Math.round(value));
}

/**
 * 일별 농장 틱: 관리도 감소, 수확 자동 판매
 * @returns 판매 수익 합계와 로그 메시지
 */
export function tickFarm(
  farm: FarmState,
  currentDay: number,
  currentSeason: number,
  currentWeather: number,
  baseLevel: number,
  farmEvent: FarmEventType | null,
  rng: () => number,
  getCropPrice: (cropId: string) => number,
  getCropSeasonBonus: (cropId: string) => Partial<Record<number, number>>,
  getCropWeatherBonus: (cropId: string) => Partial<Record<number, number>>,
  getCropName: (cropId: string) => string,
  locationId: string,
): FarmTickResult {
  let harvestedGold = 0;
  const harvestLog: string[] = [];
  let destroyedCells = 0;

  // 관리도 일별 감소 (-25/day)
  for (const cell of farm.cells) {
    if (cell.cropId && !cell.destroyed) {
      cell.managementScore = Math.max(0, cell.managementScore - 25);
    }
  }

  // 병충해 이벤트: 랜덤 셀 파괴
  if (farmEvent === 'pest') {
    const targets = farm.cells.filter(c => c.cropId && !c.destroyed);
    if (targets.length > 0) {
      const target = targets[Math.floor(rng() * targets.length)];
      const name = getCropName(target.cropId);
      target.destroyed = true;
      target.cropId = '';
      destroyedCells++;
      harvestLog.push(`🐛 병충해로 ${locationId} 농장의 ${name}이(가) 피해를 입었다.`);
    }
  }

  // 수확 판정
  for (const cell of farm.cells) {
    if (!isCellReady(cell, currentDay)) continue;

    const gold = calculateHarvestValue(
      cell,
      getCropPrice(cell.cropId),
      getCropSeasonBonus(cell.cropId),
      getCropWeatherBonus(cell.cropId),
      currentSeason,
      currentWeather,
      baseLevel,
      farmEvent,
      rng,
    );

    harvestedGold += gold;
    const name = getCropName(cell.cropId);
    harvestLog.push(`🌾 ${locationId} 농장에서 ${name} 수확! +${gold}G 자동 판매`);

    // 셀 초기화 (빈 밭으로)
    cell.cropId = '';
    cell.plantedDay = 0;
    cell.growthDays = 0;
    cell.managementScore = 100;
    cell.destroyed = false;
  }

  // 관리 횟수 초기화 (새 날)
  if (farm.lastTendDay !== currentDay) {
    farm.tendCountToday = 0;
    farm.lastTendDay = currentDay;
  }

  return { harvestedGold, harvestLog, destroyedCells };
}

/**
 * 농장 관리: 관리도 +40, 하루 3회 한도
 * @returns true if tended, false if limit reached
 */
export function tendFarm(farm: FarmState, currentDay: number): boolean {
  if (farm.lastTendDay !== currentDay) {
    farm.tendCountToday = 0;
    farm.lastTendDay = currentDay;
  }
  if (farm.tendCountToday >= 3) return false;

  for (const cell of farm.cells) {
    if (cell.cropId && !cell.destroyed) {
      cell.managementScore = Math.min(100, cell.managementScore + 40);
    }
  }
  farm.tendCountToday++;
  return true;
}

/** 농장 확장: 셀 추가 (Lv.4에서 +2) */
export function expandFarm(farm: FarmState, extraCells: number): void {
  for (let i = 0; i < extraCells; i++) {
    farm.cells.push(createEmptyCell());
    // 폭 우선 확장 (2xN → 2x(N+1))
    if (farm.gridWidth >= farm.gridHeight) {
      farm.gridHeight++;
    } else {
      farm.gridWidth++;
    }
  }
}
