// base-defs.ts — 거점 정의 (계약금, 업그레이드 배율, Lv.5 특수 기능)

export type Lv5AbilityType =
  | 'market_discount'   // 시장 거래 5% 할인
  | 'daily_mp_regen'    // 매일 MP +20 자동 회복
  | 'daily_gold_income' // 매일 랜덤 골드 5~20G
  | 'fish_bonus'        // 어류 수익 +20%, 창고 용량 +50%
  | 'rare_gather'       // 채집 레어 아이템 출현율 +15%
  | 'event_alert'       // 하루 한 번 활성 이벤트 알림
  | 'herb_bonus'        // 약초 수익 +30%, HP 자연 회복 +5/day
  | 'cooking_bonus';    // 요리 효과 +20%, 공방 시간 단축

export interface Lv5Ability {
  type: Lv5AbilityType;
  description: string;
}

export interface BaseDef {
  locationId: string;
  contractPrice: number;
  description: string;
  /** 초기 농장 격자 [width, height]. Lv.3에서 활성화. */
  initialFarmGrid: [number, number];
  /** 마을/지역 그룹핑 (부동산 화면 필터용) */
  village: string;
  lv5Ability: Lv5Ability;
}

/** 업그레이드 배율: [Lv2, Lv3, Lv4, Lv5] = [2x, 3x, 5x, 10x, 20x] of contractPrice */
export const UPGRADE_MULTIPLIERS = [2, 3, 5, 10, 20];

/**
 * 업그레이드 비용 계산 (currentLevel: 현재 레벨 1~4).
 * 종전 가격이 너무 비쌌다는 피드백에 따라 1/5 로 인하한다(최소 50G 보장).
 * 창고 화면(storage.ts) 안의 인라인 업그레이드 버튼도 동일 함수를 사용하므로
 * 부동산 화면과 가격이 자동으로 일치한다.
 */
export function getUpgradeCost(def: BaseDef, currentLevel: number): number {
  if (currentLevel < 1 || currentLevel >= 5) return Infinity;
  const raw = def.contractPrice * UPGRADE_MULTIPLIERS[currentLevel - 1];
  return Math.max(50, Math.round(raw / 5));
}

/** 마을별 거점 목록 */
export function getBasesForVillage(village: string): BaseDef[] {
  return BASE_DEFS.filter(b => b.village === village);
}

export function getBaseDef(locationId: string): BaseDef | undefined {
  return BASE_DEFS.find(b => b.locationId === locationId);
}

export const BASE_DEFS: BaseDef[] = [
  {
    locationId: 'Alimes',
    contractPrice: 500,
    description: '알리메스 중심가의 작은 집',
    initialFarmGrid: [2, 2],
    village: 'Alimes',
    lv5Ability: { type: 'market_discount', description: '시장 거래 시 5% 할인' },
  },
  {
    locationId: 'Alimes_High',
    contractPrice: 1000,
    description: '알리메스 고지대의 전망 좋은 방',
    initialFarmGrid: [3, 3],
    village: 'Alimes',
    lv5Ability: { type: 'event_alert', description: '하루 한 번 활성 이벤트 알림' },
  },
  {
    locationId: 'Luna_Academy',
    contractPrice: 800,
    description: '마법학교 루나 기숙사 한 칸',
    initialFarmGrid: [2, 2],
    village: 'Luna',
    lv5Ability: { type: 'daily_mp_regen', description: '매일 MP +20 자동 회복' },
  },
  {
    locationId: 'Manonickla',
    contractPrice: 600,
    description: '마노니클라의 아담한 거처',
    initialFarmGrid: [2, 2],
    village: 'Manonickla',
    lv5Ability: { type: 'daily_gold_income', description: '매일 5~20G 수입' },
  },
  {
    locationId: 'Martin_Port',
    contractPrice: 700,
    description: '마틴 항구 근처 선원 숙소',
    initialFarmGrid: [2, 2],
    village: 'Martin',
    lv5Ability: { type: 'fish_bonus', description: '어류 작물 수익 +20%, 창고 용량 +50%' },
  },
  {
    locationId: 'Halpia',
    contractPrice: 1200,
    description: '할퓌아 부유 섬의 구름 위 거처',
    initialFarmGrid: [3, 3],
    village: 'Halpia',
    lv5Ability: { type: 'rare_gather', description: '채집 레어 아이템 출현율 +15%' },
  },
  {
    locationId: 'Lar_Forest',
    contractPrice: 400,
    description: '라르 숲 속 오두막',
    initialFarmGrid: [2, 2],
    village: 'LarForest',
    lv5Ability: { type: 'herb_bonus', description: '약초 수익 +30%, HP +5/day 자연 회복' },
  },
  {
    locationId: 'Enicham',
    contractPrice: 900,
    description: '에니챰 공방 옆 작업실 겸 거처',
    initialFarmGrid: [3, 3],
    village: 'Enicham',
    lv5Ability: { type: 'cooking_bonus', description: '요리 효과 +20%, 활동 시간 단축' },
  },
];
