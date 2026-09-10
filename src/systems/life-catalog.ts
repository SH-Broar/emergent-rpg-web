import type { Element } from '@/data/schemas';

/**
 * 작물 정의 (v1 상수). element는 작물 속성 = 수확 시 부여 컬러 + 상위확률 판정 컬러.
 * lowerItemId/upperItemId = 결과물 아이템 id (public/data/items/act-1-items.txt에 정의).
 *  - lower = 평작(common), upper = 상품(rare).
 * growTurns = 완성까지 걸리는 세계 턴. waterAt = 선택 돌봄 시점.
 */
export interface CropDef {
  id: string;
  /** 씨앗 표시 이름 (UI·로그용). */
  seedName: string;
  /** 완성까지 필요한 세계 턴. */
  growTurns: number;
  /** 선택 돌봄 기회가 열리는 성장 시점. 성장 자체는 멈추지 않는다. */
  waterAt: number[];
  /** 작물 속성 — 수확 시 부여 컬러 + 상위확률 판정 컬러. 8색 분산. */
  element: Element;
  /** 평작 결과물 아이템 id. */
  lowerItemId: string;
  /** 상품 결과물 아이템 id. */
  upperItemId: string;
  /**
   * 선택 돌봄 행동 라벨 — 지연형 생활 활동의 element별 표현(농사=물주기, 숯굽기=불 지피기 등).
   * 활동에 맞는 UI/토스트 문구에 사용한다.
   * 미설정이면 '물주기'(농사 기본).
   */
  careLabel?: string;
  /**
   * 빈 텃밭(미경작) 상태에서의 행동 명사 — UI 빈자리 안내용(예: '텃밭', '가마', '덫', '건조대', '버섯밭').
   * 미설정이면 '텃밭'(농사 기본).
   */
  plotLabel?: string;
}

/**
 * 작물 카탈로그 — 지연형 생활 활동 5종. element별 1종(earth·fire·wind·light·dark).
 * earth=농사, fire=숯굽기, wind=사냥(덫), light=별빛 건조, dark=버섯재배.
 *  - 모든 생산지는 세계 시간으로 완성되며 돌봄은 선택 보너스다.
 *  - 반복형(water 낚시·iron 채광·electric 집전)은 farming 엔진을 쓰지 않는다 → life-activity.ts.
 */
export const CROPS: CropDef[] = [
  {
    id: 'crop-grain',
    seedName: '들곡 씨앗',
    growTurns: 12,
    waterAt: [0, 6],
    element: 'earth',
    lowerItemId: 'i-crop-grain',
    upperItemId: 'i-crop-grain-fine',
    careLabel: '물주기',
    plotLabel: '텃밭',
  },
  {
    id: 'crop-char',
    seedName: '숯가마 장작',
    growTurns: 16,
    waterAt: [0, 8],
    element: 'fire',
    lowerItemId: 'i-life-char',
    upperItemId: 'i-life-char-fine',
    careLabel: '불 지피기',
    plotLabel: '가마',
  },
  {
    id: 'crop-snare',
    seedName: '사냥 덫',
    growTurns: 16,
    waterAt: [0, 8],
    element: 'wind',
    lowerItemId: 'i-life-game',
    upperItemId: 'i-life-game-fine',
    careLabel: '덫 살피기',
    plotLabel: '덫자리',
  },
  {
    id: 'crop-dry',
    seedName: '별빛 채반',
    growTurns: 20,
    waterAt: [0, 10],
    element: 'light',
    lowerItemId: 'i-life-dried',
    upperItemId: 'i-life-dried-fine',
    careLabel: '별빛 쬐기',
    plotLabel: '건조대',
  },
  {
    id: 'crop-mush',
    seedName: '버섯 종균',
    growTurns: 16,
    waterAt: [0, 8],
    element: 'dark',
    lowerItemId: 'i-life-mush',
    upperItemId: 'i-life-mush-fine',
    careLabel: '이슬 주기',
    plotLabel: '버섯밭',
  },
];

/** 작물의 돌봄 게이트 행동 라벨(미설정이면 '물주기'). */
export function careLabelFor(crop: CropDef | undefined): string {
  return crop?.careLabel ?? '물주기';
}

/** 작물의 빈자리 명사(미설정이면 '텃밭'). */
export function plotLabelFor(crop: CropDef | undefined): string {
  return crop?.plotLabel ?? '텃밭';
}

/**
 * 작물 산출물의 짧은 표시 이름 — seedName에서 행동 접미사를 떼어 결과물 명칭으로.
 * (들곡 씨앗→들곡 / 숯가마 장작→숯 / 사냥 덫→사냥감 / 별빛 건조 채반→말린 것 / 버섯 종균→버섯)
 * 단순 치환이라 신규 작물 추가 시 맞춰 준다. 미정의면 seedName 그대로.
 */
export function cropDisplayName(crop: CropDef | undefined): string {
  if (!crop) return '작물';
  const map: Record<string, string> = {
    'crop-grain': '들곡',
    'crop-char': '숯',
    'crop-snare': '사냥감',
    'crop-dry': '말린 것',
    'crop-mush': '버섯',
  };
  return map[crop.id] ?? crop.seedName.replace(/\s*(씨앗|장작|덫|채반|종균)$/, '');
}


export function getCrop(cropId: string): CropDef | undefined { return CROPS.find(crop => crop.id === cropId); }

export type LifeActivityType = 'delayed' | 'repeat';

/** 활동 산출 순간에 띄우는 채집 미니게임 종류(tap/react/matrix + 신규 rhythm). */
export type LifeMinigame = 'tap' | 'react' | 'matrix' | 'rhythm';

/** 한 생활 활동의 정의(레지스트리 원소). */
export interface LifeActivityDef {
  id: string;
  /** 활동 표시 이름 (UI). */
  name: string;
  /** 활동 속성 — 산출 컬러 + 상위확률 판정 컬러. 8색 1:1. */
  element: Element;
  type: LifeActivityType;
  /**
   * 산출 순간에 띄우는 채집 미니게임(스킬 표현). 결과 점수가 그 회차 상위확률에 보너스로 더해진다.
   * 못 띄우거나 닫으면 즉시 산출(폴백) — 핵심 산출 수학은 불변.
   */
  minigame: LifeMinigame;
  // --- delayed 전용 ---
  /** 지연형이 재사용하는 farming.ts CROPS의 cropId. delayed면 필수. */
  cropId?: string;
  // --- repeat 전용 ---
  /** 반복형 동사 라벨(UI 버튼 — '낚시한다' 등). */
  verb?: string;
  /** 반복형 평작 산출 아이템 id. */
  lowerItemId?: string;
  /** 반복형 상품 산출 아이템 id. */
  upperItemId?: string;
}

/**
 * 8활동 레지스트리 — element별 1개. 5 delayed(농사 grow 엔진 재사용) + 3 repeat(즉시 산출).
 *   delayed: earth=농사 / fire=숯굽기 / wind=사냥 / light=별빛 건조 / dark=버섯재배
 *   repeat : water=낚시 / iron=채광 / electric=집전
 *
 * minigame 배정(스킬 표현, 8→3종) — 행동의 결에 맞춰:
 *   tap(좌우 연타, 힘쓰는 노동)  = 농사·숯굽기·사냥
 *   react(반응 속도, 순간 포착)  = 낚시·집전
 *   matrix(숫자 격자, 더듬어 찾기) = 채광·별빛 건조·버섯재배
 */
export const LIFE_ACTIVITIES: LifeActivityDef[] = [
  // === 지연형 (farming.ts CROPS 재사용) ===
  { id: 'act-farm', name: '농사', element: 'earth', type: 'delayed', cropId: 'crop-grain', minigame: 'tap' },
  { id: 'act-char', name: '숯굽기', element: 'fire', type: 'delayed', cropId: 'crop-char', minigame: 'tap' },
  { id: 'act-hunt', name: '사냥', element: 'wind', type: 'delayed', cropId: 'crop-snare', minigame: 'rhythm' },
  { id: 'act-dry', name: '별빛 건조', element: 'light', type: 'delayed', cropId: 'crop-dry', minigame: 'matrix' },
  { id: 'act-mush', name: '버섯재배', element: 'dark', type: 'delayed', cropId: 'crop-mush', minigame: 'matrix' },
  // === 반복형 (즉시 산출 + 쿨다운) ===
  {
    id: 'act-fish', name: '낚시', element: 'water', type: 'repeat', verb: '낚시한다',
    lowerItemId: 'i-life-fish', upperItemId: 'i-life-fish-fine', minigame: 'react',
  },
  {
    id: 'act-mine', name: '채광', element: 'iron', type: 'repeat', verb: '채광한다',
    lowerItemId: 'i-life-ore', upperItemId: 'i-life-ore-fine', minigame: 'matrix',
  },
  {
    id: 'act-charge', name: '집전', element: 'electric', type: 'repeat', verb: '모은다',
    lowerItemId: 'i-life-charge', upperItemId: 'i-life-charge-fine', minigame: 'rhythm',
  },
];

/** id로 활동 정의 조회. */
export function getActivity(id: string): LifeActivityDef | undefined {
  return LIFE_ACTIVITIES.find((a) => a.id === id);
}

/** 지연형 활동의 작물 정의(farming.ts CROPS) 조회. repeat이거나 미정의면 undefined. */
export function cropForActivity(act: LifeActivityDef | undefined): CropDef | undefined {
  return act?.cropId ? getCrop(act.cropId) : undefined;
}

/**
 * 안정적 문자열 해시(FNV-1a 32bit) — 같은 입력=같은 출력. 권역→활동 결정적 배정용.
 * Math.random/rng를 쓰지 않는다(저장·세션 무관하게 항상 동일).
 */
function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 손튜닝 권역→활동 매핑 (맵 재설계 분배표 map_layout_1 기반).
 * 각 권역은 [주력, ...보조] 활동. 활동은 권역 속성과 무관하게 권역 톤으로 배정한다.
 * 한 권역에 활동이 둘 이상이면 노드별 결정적 해시로 분배(주력·보조가 채집/조우 노드에 섞임).
 * 미등록 권역은 아래 FNV 해시 폴백(8활동 균등) — 신규 지대(어촌/별빛고원/버섯/광산)는 맵 재구성 시 추가.
 */
const REGION_ACTIVITIES: Record<string, string[]> = {
  iluneon: ['act-dry'], // 별빛 건조 + 거래 거점
  'lar-forest': ['act-farm', 'act-mush'], // 농사 + 세계수 그늘 버섯
  tradepost: ['act-farm'], // 농사 + 교역 거점
  reshud: ['act-charge'], // 집전 + 교통 허브
  'moss-north': ['act-char', 'act-mine'], // 숯굽기 + 채광 겸용(대장간)
  'moss-south': ['act-char'], // 항구 거래 거점, 채집은 숯굽기 보조
  martin: ['act-fish'], // 낚시 + 항구/해로 허브
  riagralta: ['act-hunt', 'act-charge'], // 초원 사냥 + 집전 혼합
  manonickla: ['act-mine'], // 채광
  alimes: ['act-fish', 'act-mush'], // 낚시 + 안개숲 버섯
  tacomi: ['act-charge'], // 집전 + 야시장 거점
  enicham: ['act-charge'], // 집전(발전소 핵심)
  luna: ['act-mush'], // 지하 버섯 + 학교 거점
  diropel: ['act-dry'], // 별빛 건조(빛이 더 희소)
  triflower: ['act-char'], // 위험형 숯굽기 + 고티어 전투
  'coral-coast': ['act-fish'], // 심해 낚시 + 산호 전투
  'demon-castle': ['act-mush'], // 심층 버섯 + 고티어 전투
  yusezria: ['act-mine'], // 극한 채광 + 데드엔드
  'demon-windfall': ['act-hunt'], // 보스 직전 사냥 보급
  'falcon-garden': ['act-hunt'], // 고급 사냥(공중)
  oldshrine: ['act-charge'], // 집전(번개 신전) + 유물
  'starlight-plateau': ['act-dry'], // 별빛 건조(고원의 긴 밤)
  'mushroom-cave': ['act-mush'], // 버섯재배(빛 없는 동굴)
  'fishing-village': ['act-fish'], // 낚시(외딴 어촌)
  'mine-shaft': ['act-mine'], // 채광(깊은 갱도)
};

/**
 * 노드에 배정된 생활 활동을 결정 — 권역 손튜닝 매핑(REGION_ACTIVITIES) 우선,
 * 다활동 권역은 노드 id 해시로 결정적 분배. 미등록 권역/노 region이면 FNV 해시(8활동 균등) 폴백.
 * 결정적(저장·세션 무관)이라 같은 노드는 항상 같은 활동. 항상 정의 1개를 반환.
 */
export function activityForNode(nodeId: string, region?: string): LifeActivityDef {
  // Adjacent to the starting square: a reliable first farm for the local supply loop.
  if (nodeId === 'n-ilu-larder') return LIFE_ACTIVITIES[0];
  const mapped = region ? REGION_ACTIVITIES[region] : undefined;
  if (mapped && mapped.length > 0) {
    const pick =
      mapped.length === 1 ? mapped[0] : mapped[stableHash(`node:${nodeId}`) % mapped.length];
    const act = getActivity(pick);
    if (act) return act;
  }
  const key = region && region.length > 0 ? `region:${region}` : `node:${nodeId}`;
  const idx = stableHash(key) % LIFE_ACTIVITIES.length;
  return LIFE_ACTIVITIES[idx];
}

