/**
 * 카오스(Chaos) 정의 스키마 — *위기협약식 자기부여 핸디캡 + 도전 점수* 시스템.
 *
 * (deep-interview-chaos-system.md / Phase A — Round 12 강도 모델 재정합)
 *
 * 주의: 본 `Chaos`는 신규 도전-점수 시스템의 정의이며,
 *   기존 r4 `ChaosModifier`(schemas/chaos.ts — name/description/affectsMeta 토글 placeholder)와는
 *   *별개*다. 신규 정의는 INI 섹션 `[chaos.ch-*]`(접두 `ch-`)를 쓰고, 레거시 파서는 `ch-`를 건너뛴다.
 *
 * === 강도(intensity) 모델 (Round 12) ===
 * 점수는 *티어 평면값*이 아니라 *강도*에서 파생한다.
 *   - numeric  : 3강도. 강도 1/2/3 = 1/2/3점. 효과 크기도 강도와 연동.
 *   - binary   : 단일 단계 = 1점.
 *   - start-hp : 특수 2강도. -50%(2점) / HP1로 시작(3점).
 *   - legend   : T4 평면 4점. 강도 없음(on/off, 단일 level).
 * 각 강도는 `levels[intensity-1]`에 `{ param, score }`로 담긴다.
 *
 * 효과 표현:
 *   - 시작형(start-*): 런 시작 1회 적용 (HP 박탈, 덱 오염 등). `applyStartChaos`가 처리.
 *   - 상시형(enemy-hp-mul 등): 시스템 조회 시점에 활성 카오스 합산으로 적용.
 *
 * Phase A는 표본 3종이 쓰는 kind만 우선 구현하되, kind 유니온을 확장 용이하게 둔다.
 * Phase B에서 kind·24개 데이터, Phase C에서 UI(강도 스텝 선택)가 얹힌다.
 */

/**
 * 카오스 효과 종류 (Phase B — 24종 카탈로그 전체).
 *
 * 명명 규칙:
 *   - `start-*` : 시작형. 런 시작 시 1회 적용(`applyStartChaos`).
 *   - 그 외      : 상시형. 시스템 조회 시점마다 적용(systems/chaos.ts의 쿼리 헬퍼).
 *
 * 시작형:
 *   - 'start-hp'           시작 HP를 강도 param으로 조정. param='-0.5' → 현재 HP -50%, 'hp1' → HP1.
 *   - 'start-inject-card'  시작 덱에 카드 주입. param='cardId=count|...' (예: 'c-junk-curse=1|c-junk-blank=5').
 *   - 'time-limit-mul'     런 시작 시 시간 한도 ×(1-param). param 예: '0.25'. (startRun에서 1회.)
 *   - 'color-seal'         런 시작 시 무작위 1색 봉인 → RunState.chaosBannedColor. param='random'.
 *   - 'seed-seal'          종족 시드 컬러 0으로(시작형, RaceSelect 색셋업 타이밍은 Phase C 재정렬).
 *
 * 상시형 — 전투:
 *   - 'enemy-hp-mul'       모든 적 HP 배수 가산 (param=비율). startCombat.
 *   - 'enemy-atk-mul'      적 공격(attack/drain/charge intent) 데미지 ×(1+합).
 *   - 'enemy-def-add'      적 전투 시작 block +N.
 *   - 'elite-hp-mul'       적이 elite/boss tier일 때만 HP 배수.
 *   - 'boss-atk-mul'       적이 boss tier일 때만 공격 데미지 ×(1+합).
 *   - 'small-hand'         매 턴 드로우 -N.
 *   - 'low-mana'           전투 시작/매 턴 마나 -N.
 *   - 'hidden-intent'      적 의도 가려짐(상시 obscure — Stage2 obscure 인프라 재사용).
 *   - 'all-gimmick'        모든 적 인텐트에 종족 대표 기믹 1개 삽입(Stage3 매핑 재사용).
 *
 * 상시형 — 경제/맵(쿼리 헬퍼 제공; UI 결선은 Phase C):
 *   - 'shop-price-mul'         상점 가격 ×(1+합). shop.ts.
 *   - 'upgrade-cost-mul'       강화비 ×(1+합). workshop.ts.
 *   - 'rest-heal-mul'          휴식 회복 ×(1-합). (MapView 결선 = Phase C.)
 *   - 'node-hp-loss'           노드 진입마다 HP -N. run.visitNode.
 *   - 'gather-threshold-add'   채집 후반 임계 +N. gathering.ts.
 *   - 'locked-town'            마을 노드 N개 잠금. (MapView 결선 = Phase C.)
 *   - 'no-removal'             상점/공방 카드 제거 비활성.
 *   - 'narrow-reward'          전투 후 카드 보상 수 -1. (CombatView 결선 = Phase C.)
 *   - 'no-map-potion'          맵(비전투)에서 포션 사용 불가. item.ts.
 *   - 'no-shop'                상점 노드/구매 폐쇄. shop.ts + (MapView 노드 비활성 = Phase C.)
 */
export type ChaosEffectKind =
  // === 시작형 (start-*) ===
  | 'start-hp'
  | 'start-inject-card'
  | 'time-limit-mul'
  | 'color-seal'
  | 'seed-seal'
  // === 상시형 — 전투 ===
  | 'enemy-hp-mul'
  | 'enemy-atk-mul'
  | 'enemy-def-add'
  | 'elite-hp-mul'
  | 'boss-atk-mul'
  | 'small-hand'
  | 'low-mana'
  | 'hidden-intent'
  | 'all-gimmick'
  // === 상시형 — 경제/맵 ===
  | 'shop-price-mul'
  | 'upgrade-cost-mul'
  | 'rest-heal-mul'
  | 'node-hp-loss'
  | 'gather-threshold-add'
  | 'locked-town'
  | 'no-removal'
  | 'narrow-reward'
  | 'no-map-potion'
  | 'no-shop';

/** 카오스 티어 — 1~3은 숫자/혼합, 4는 규칙 재작성(레전드 간판). */
export type ChaosTier = 1 | 2 | 3 | 4;

/**
 * 카오스 타입 — 강도 모델 분류 (점수 산정 규칙을 인코딩).
 *   numeric  : 3강도 (1/2/3점).
 *   binary   : 단일 단계 (1점).
 *   start-hp : 특수 2강도 (2/3점).
 *   legend   : T4 평면 4점 (단일 level, on/off).
 */
export type ChaosType = 'numeric' | 'binary' | 'start-hp' | 'legend';

/** 한 강도 단계 — 효과 파라미터 + 그 강도의 도전 점수. */
export interface ChaosLevel {
  /**
   * 강도별 효과 파라미터(원시 문자열). effectKind별 해석:
   *   enemy-hp-mul       → 비율          예: '0.20'
   *   start-hp           → '-0.5' | 'hp1'
   *   start-inject-card  → 'cardId:count' 콤마 목록   예: 'c-junk-curse:1,c-junk-blank:5'
   */
  param: string;
  /** 이 강도의 도전 점수. */
  score: number;
}

/** 한 카오스 정의. */
export interface Chaos {
  id: string;
  name: string;
  description: string;
  /** 1~4. 진열 게이트(상점 노출)·영혼 비용에 쓰임. 점수는 levels에서 파생. */
  tier: ChaosTier;
  /** 분류 라벨 (예: enemy-buff, resource-strip, deck-corruption). UI/필터용. */
  category: string;
  /** 강도 모델 분류 — 점수 산정 규칙. */
  chaosType: ChaosType;
  /** 효과 종류. */
  effectKind: ChaosEffectKind;
  /**
   * 강도별 단계 목록 (`levels[intensity-1]`).
   *   numeric  → 3개, binary → 1개, start-hp → 2개, legend → 1개.
   */
  levels: ChaosLevel[];
}
