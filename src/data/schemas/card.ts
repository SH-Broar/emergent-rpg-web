/**
 * 카드 스키마.
 *
 * 분기 B (하이브리드):
 *  - 단순 효과: 데이터 드리븐 (effects: CardEffect[])
 *  - 특수 효과: 함수 슬롯 (customEffectId — 코드에 등록된 효과 핸들러 키)
 *
 * 분기 C (하이브리드):
 *  - 기본 카드는 *플레이* 시 즉시 효과 (턴제)
 *  - 지속/자동 카드는 trigger 필드로 *조건 발동* 표시
 */

import type {
  CardId,
  CastSpeed,
  Element,
  GridOffset,
  NamedEntity,
  Rank,
} from './base';

/**
 * 카드 *주 효과 수치*의 등급별 최소 한도.
 * Item 37-① 전투 밸런스 재조정(2026-05-25)에서 상향: common 6→9 / rare 9→14 / legendary 14→22.
 * (basic 4 유지. validate-core.mjs 의 CARD_MIN_PEAK 미러도 같은 값.)
 *
 * 적용 대상: (Item 37-③ 이전) source가 `race`/`character`인 *시작 덱 베이스*.
 *
 * 면제 대상: source가 `npc`/`event`/`relic`/`boss`/`hyperion` — 친밀도 보상,
 * 이벤트 grant, 유물 효과, 보스 보상으로 받는 *특수 카드*는 컨셉이 우선.
 *
 * Item 37-③ 종족 카드 확장(2026-05-26): `race`/`character`도 *전부 면제*.
 * 종족 카드는 컨셉(균형·연사·손패·색·적응)이 수치 우선이며, 일부러 약하게(특히 나방
 * 0코 연사·인간 균형형) 설계되는 경우가 많아 등급 최소 한도가 거짓 경고를 양산한다.
 * → validateCardBaseline은 *모든 출처를 통과*시키되, 함수/임계값 정의는 참고용으로 보존한다.
 * (validate-core.mjs 미러도 동일하게 race/character 면제.)
 *
 * 검사 수치: card.effects 중 `damage`/`heal`/`block` 효과 value의 *최댓값*.
 * cost는 고려하지 않음 — 가치 산정의 정밀함보다 *최소 한도*가 목적.
 */
export const CARD_MIN_PEAK_VALUE: Record<Rank, number> = {
  basic: 4,
  common: 9,
  rare: 14,
  legendary: 22,
};

/**
 * 카드가 등급별 최소 한도를 충족하는지 검사. ok=false면 데이터 작성 오류일 가능성.
 *
 * Item 37-③(2026-05-26): *항상 통과*. 종족 카드 확장으로 race/character 카드도 컨셉(균형·
 * 연사·손패·색·적응) 우선이라 등급 최소 한도가 거짓 경고를 양산했다. 정책 임계값
 * CARD_MIN_PEAK_VALUE는 참고/문서용으로 보존하며, 복원이 필요하면 이 함수를 되살리면 된다.
 * 게임 로직에 영향 X — 데이터 로드 시 *경고*만 띄우던 헬퍼였다.
 */
export function validateCardBaseline(_card: Card): { ok: boolean; reason?: string } {
  return { ok: true };
}

/** 카드 획득 출처 (자동 매핑의 기반). */
export type CardSource =
  | 'race'        // 종족 시드
  | 'character'   // 캐릭터 정체성
  | 'npc'         // NPC 친밀도
  | 'hyperion'    // 히페리온 5단계
  | 'event'       // 이벤트 보상
  | 'relic'       // 유물 효과
  | 'boss'        // 보스 클리어
  | 'shop'        // 상점 풀 전용 카드 (시작덱·전설 외 모든 풀에 포함되는 일반 출처)
  | 'junk'        // 몬스터 주입 잡카드(상처/저주/빈) — 모든 풀에서 제외, 전투 종료 시 소멸
  | 'form'        // 변신(체인지) 폼 전용 카드 — 모든 풀에서 제외. 변신 시에만 덱에 등장
  | 'possession'; // 빙의 카드(빙의/축복/저주) — 모든 풀에서 제외. 빙의로만 획득, 런 지속

/** 카드 사용 모드 — 턴제 vs 자동/지속. */
export type CardTriggerKind =
  | 'manual'        // 플레이어가 핸드에서 사용 (기본 STS식)
  | 'on-draw'       // 드로우 시 즉시 발동
  | 'on-turn-end'   // 턴 종료 시 발동
  | 'on-take-damage' // 피해 받을 시 발동
  | 'persistent';   // 항상 활성 (유물처럼 작동하는 카드)

/** 효과 종류 — MVR 단계에서는 5종만. 확장 가능. */
export type CardEffectKind =
  | 'damage'              // 적에게 데미지
  | 'damage-min-color'    // 8 컬러 중 *최솟값* × value 데미지, ATK 보너스 무시
  | 'heal'                // 자신 회복 (음수 = 자기 HP 페널티)
  | 'block'               // 방어막 (음수 = block 페널티)
  | 'draw'                // 카드 드로우
  | 'apply-status'        // 상태 부여
  | 'return-hand-to-deck' // 손에서 *가장 오른쪽* 1장을 drawPile 맨 위로 (칼리번)
  | 'next-turn-energy'    // 다음 턴 시작 에너지 +value (칼리번)
  | 'growing-block'       // block:value + *이 카드 인스턴스의 bonusBlock +1* (쿠르쿠마)
  // === 측정 어려운 메커니즘 (1차 배치) ===
  | 'damage-top-color'    // 8 컬러 중 *최댓값* × value 데미지 (보강 무시)
  | 'damage-color-count'  // *0보다 큰 컬러 종류 수* × value 데미지
  | 'block-top-color'     // 8 컬러 중 *최댓값* × value 방어
  | 'draw-if-color'       // params.color 컬러 ≥ params.threshold면 value장 드로우
  | 'damage-per-debuff'   // (적 디버프 스택 총합) × value + base 데미지
  | 'consume-vulnerable'  // 적 *취약 스택 제거* → 제거량 × value 추가 데미지
  | 'damage-from-hp'      // 자기 HP를 value 지불, 지불액 × params.mult 데미지
  | 'damage-per-hand'     // *현재 손패 수* × value 데미지
  | 'damage-per-confine'  // 궁지 — 플레이어의 직교 인접 4칸 중 *차단 수*(벽/void/격자밖/적 점유, 0~4 캡) × value 추가 피해
  // === 측정 어려운 메커니즘 (3차 배치) ===
  | 'exhaust-self'        // 마커: 이 효과가 든 카드는 사용 후 *소멸*(exhaustPile). 핸들러는 no-op.
  | 'return-self-to-hand' // 마커: 사용 후 *자기 자신을 손으로* 되돌림(버리지 않음). 나방 0코 드로우 카드. 핸들러 no-op.
  | 'block-to-damage'     // 현재 player.block × value 추가 피해 (block 소모하지 않음)
  | 'adaptive-strike'     // 적응형(인간 시그니처): player.block>0 이면 damage(value+params.bonus, 기본 +4), 아니면 block(value)
  | 'spend-all-energy'    // 남은 mana 전부 소비 → 소비액 × value 피해
  | 'damage-per-companion' // 동료 수 × value 피해
  | 'damage-per-relic'    // 유물 수 × value 피해
  | 'growing-damage'      // damage:value + *이 카드 인스턴스의 bonusDamage* (쓸수록 강해짐)
  | 'heal-per-hand'       // *현재 손패 수* × value 회복 (self)
  | 'next-card-double'    // combat flag: *다음 1장*의 모든 effect value 2배
  // === 유령화(비실체) — 카오스와 별개 양날 상태 ===
  | 'ghost-self'          // 플레이어 자신을 value턴 유령화: 받는·주는 피해 ×0.5(매 턴 -1)
  // === 잡카드(저주) 전용 (Stage 2 몬스터 교란) ===
  | 'curse-tick'          // 마커: 이 카드가 손에 있으면 매 턴 시작 value만큼 직접 HP 피해. 핸들러 no-op.
  // === 변신(체인지/TSF) 전용 (Stage 5) ===
  | 'release-transform'   // 변신 해제 — 원래 종족·덱으로 복귀. 변신 폼 덱에만 들어 있는 '해제 카드'.
  // === 동료 스킬 콘텐츠 배치 1 (Item 37-② Stage C) — 스킬·카드 공용 신규 핸들러 11종 ===
  | 'skip-enemy-action'   // 적의 *다음 행동 N회 박제(스킵)*. value=스킵 횟수(기본 1).
  | 'slow-enemy'          // 적 행동 수 -1을 value턴 (멀티액션 2→1). value=지속 턴.
  | 'delayed-damage'      // value턴(params.delay, 기본 2) 뒤 적에게 *대폭발* 피해(value 토큰의 4번째). value=피해.
  | 'random-effect'       // 고정 풀(대피해/전체취약/draw+마나/풀회복) 중 무작위 1셋 실행.
  | 'damage-per-cards-played' // 피해 = value × cardsPlayedThisTurn(이번 턴 사용 카드 수).
  | 'buff-card-instance'  // 손패의 가장 왼쪽 공격 카드 인스턴스에 *전투 영구* +value 피해(bonusDamage).
  | 'negate-reflect'      // 이번 턴 받는 피해 0 흡수 → 다음 플레이어 턴 시작 시 누적량을 적에게 반사.
  | 'bloom-strength'      // 이번 전투 내내 매 플레이어 턴 시작 힘 +value 자동 누적(비감쇠).
  | 'amplify-debuff'      // 적 최고 스택 디버프 ×2 + 증가분 × value 피해(디버프 없으면 소피해).
  | 'refill'              // 마나를 maxMana로, 손패를 손패 상한까지 드로우(가득).
  | 'this-turn-amp'       // 이번 턴 동안 플레이어 카드 effect value +value%(params.pct 폴백).
  // === 종족 카드 확장 2 (Item 37-③ 나방) — 가속 신규 핸들러 1종 ===
  | 'hand-cost-down'      // 이번 턴 손패(및 이번 턴 뽑는 카드) 전체 cost -value(최소 0). 턴 종료 0 리셋.
  // === 종족 카드 확장 3 (Item 37-③ 팬텀) — 빈손 보상 신규 핸들러 1종 ===
  | 'damage-low-hand'     // 기본 value 피해. 현재 손패(이 카드 제외) ≤ params.threshold(기본 2)면 value×2.
  // === 종족 카드 확장 5 (Item 37-③ 아르카나) — 색 영구 획득 신규 핸들러 1종 ===
  | 'grant-color'         // params.color(8색|random|all, 기본 random) 색을 value만큼 *영구* 획득(applyColorBoost).
  // === 종족 카드 확장 6 (P1 나방 토양 시드) — 적 burn/poison 스택 소비 신규 핸들러 2종 ===
  | 'consume-burn'        // 적 burn 스택 *전부 제거* → 제거량 × value 추가 피해. consume-vulnerable 패턴 동일.
  | 'consume-poison'      // 적 poison 스택 *전부 제거* → 제거량 × value 추가 피해. consume-vulnerable 패턴 동일.
  // === 인간 종족 재설계 (STS 아이언클래드式 스킬/파워, 2026-06-16) — 전투 휘발 buff 7종 ===
  | 'metallicize'         // statuses.metallicize += value. 매 *턴 종료* 시 player.block += metallicize(STS 메탈리사이즈).
  | 'barricade'           // statuses.barricade = 1(플래그). 켜져 있으면 턴 전환 시 player.block을 0으로 리셋하지 않음(불굴).
  | 'feel-no-pain'        // statuses.feelNoPain += value. 카드가 *소멸(exhaust)*될 때마다 player.block += feelNoPain(무통).
  | 'rupture'             // statuses.rupture += value. *카드로* HP를 잃을 때마다 strength += rupture(각혈). 적 공격으론 미발동.
  | 'juggernaut'          // statuses.juggernaut += value. 플레이어가 *방어막을 얻을 때마다* 적에게 value 피해(반격진).
  | 'double-block'        // 즉발: player.block = player.block × 2(STS 엔트렌치, 참호).
  | 'heavy-blade';        // 적에게 (value + strength×params.mult) 피해(중검). 일반 strength 자동가산은 미적용, 핸들러가 직접 계산.

/** 효과 대상 — target. */
export type EffectTarget = 'self' | 'enemy' | 'all-enemies' | 'random-enemy';

/** 단위 효과. 데이터 드리븐의 기본 단위. */
export interface CardEffect {
  kind: CardEffectKind;
  value?: number;
  target?: EffectTarget;
  /** 상태 부여 등 추가 파라미터 */
  params?: Record<string, unknown>;
}

/** 카드 정의 + 런타임 인스턴스.
 *
 * - `id`: 카드 *정의* 식별자 (예: 'c-strike'). 데이터 파일 기준.
 * - `instanceId`: 같은 정의의 *각 사본*에 부여되는 유니크 키.
 *   - 데이터 로더가 만든 *원본 정의*에는 비어 있음.
 *   - 게임 런타임이 카드를 컬렉션/덱에 추가할 때 `instantiateCard()`로 부여.
 *   - 덱 편집 UI는 instanceId로 카드를 구분 (동명 카드 = 별개 인스턴스).
 */
export interface Card extends NamedEntity {
  id: CardId;
  /** 런타임 인스턴스 ID — 데이터 정의에서는 비어 있고, 게임 런타임에서 부여. */
  instanceId?: string;
  rank: Rank;
  source: CardSource;

  /** 카드 색상 — 시각화 + 시너지 조건에 사용. */
  element?: Element;

  /** 마나 비용 (없으면 0). */
  cost: number;

  /**
   * 사용 불가 카드 — 몬스터가 주입하는 잡카드(상처/저주) 표식.
   * true면 손패에서 클릭해도 사용되지 않음(칸만 차지). 전투 종료 시 자동 소멸(런 덱에 안 들어감).
   */
  unplayable?: boolean;

  /**
   * 빙의 카드 — 받으면 *제외 불가*로 덱에 박히고, 쓸 때마다 각성도가 오른다(run.possessions에 추적).
   * 최대 각성 시 수호령(축복)/악령(저주) 카드로 변신. 정렬은 *받을 때* 결정되나 플레이어에겐 숨겨짐.
   * 양날 강카드로 디자인(쓰고 싶게 만들어 각성을 유도). possessionMax 미설정 시 8.
   */
  possession?: boolean;
  /** 빙의 각성 최대치(미설정 8). */
  possessionMax?: number;
  /**
   * 저주 카드 — 악령 변신 결과. 일반 제외 경로(공방·이벤트) *불가*, *상점에서만* 떼어낼 수 있다.
   */
  curse?: boolean;

  /** 발동 트리거. */
  trigger: CardTriggerKind;

  /** 데이터 드리븐 효과 목록. */
  effects: CardEffect[];

  /** 특수 카드는 코드에 등록된 함수 슬롯 키. */
  customEffectId?: string;

  /** 카드 획득 시 표시되는 출처 텍스트 (예: "이리엘과의 약속"). */
  flavor?: string;

  /** 이 카드가 어떤 NPC/이벤트로 잠금해제되는지 (UI 안내용). */
  unlockHint?: string;

  /**
   * 강화 후 카드 ID — 공방 강화에서 *이 카드를 강화하면 어떤 카드로 바뀌는지* 표시.
   * 없으면 강화 불가 (예: 이미 강화판인 카드).
   */
  upgradeToId?: CardId;

  /**
   * 카드 *인스턴스*에 누적되는 보너스 block — `growing-block` 효과 카드 전용.
   * 사용 시 +1씩 누적되어 다음번 사용 시 block 효과에 더해진다.
   * 런 종료로 리셋(런 휘발 컬렉션 인스턴스).
   */
  bonusBlock?: number;

  /**
   * 카드 *인스턴스*에 누적되는 보너스 damage — `growing-damage` 효과 카드 전용.
   * 사용 시 +1씩 누적되어 다음번 사용 시 damage 효과에 더해진다.
   * bonusBlock과 동일한 수명(런 휘발 컬렉션 인스턴스).
   */
  bonusDamage?: number;

  /**
   * 카드 *인스턴스* 강화 단계 (XP·각성 시스템, 2026-06-10). 0~10, 기본 0(미설정=0).
   * 1~5강은 수치형 효과(damage/block/heal)에 강당 +12%(렌더/실행 시점 스케일, enhance.ts enhanceMul).
   * 5강에서 잠김 — 6강 진입은 awakened 필요. 6~10강은 plus 정의 수치 기준으로 같은 비율.
   * 정의 baked가 아니라 *실행 시점 적용*이라 인스턴스 전용 필드(정의에는 없음). 런 휘발.
   */
  enhanceLevel?: number;

  /**
   * 각성 여부 (XP·각성 시스템) — 공방에서 속성 특산물+사다리 재료로 5강 게이트를 뚫으면 true.
   * awakened=true ⇒ 카드 효과는 *plus 정의*(이름에 + 부착, 질적 변화). 6~10강 해금.
   * plus 정의가 없는 카드는 awakened만 true가 되고 수치 점프 폴백(enhance.ts).
   * 구세이브 -plus 인스턴스 마이그레이션도 이 필드(=true)로 수렴. 인스턴스 전용·런 휘발.
   */
  awakened?: boolean;

  // === 격자 전투(grid-combat) 필드 — 전부 optional. 미설정 시 로더/엔진이 폴백 적용. ===
  /**
   * 격자 범위 — 자기(시전자) 기준 *고정 패턴*(회전 없음)의 적용 칸 상대 오프셋.
   * 공격/디버프 카드에 사용. 버프/self 카드는 미설정/빈 배열(제자리 발동).
   * 격자 밖·void·wall 칸은 엔진이 자동 제외. 위치 잡기로 조준(미리보기 후 확정).
   */
  shape?: GridOffset[];
  /**
   * shape와 정렬된 *칸별 데미지 배율*(기본 전부 1). shape보다 짧으면 나머지 칸은 1.0.
   * 예) 중앙 1.0, 주변 0.5 식의 감쇠 광역.
   */
  perTileMul?: number[];
  /** 발동 속도(빠름/보통/느림). 미설정 시 'normal'. 같은 스텝 해소 순서를 정한다. */
  castSpeed?: CastSpeed;
  /**
   * 타겟 모드 — 'self'(버프, 제자리) | 'pattern'(공격/디버프, shape 칸).
   * 미설정 시 effects(damage/apply-status enemy 유무)와 shape로 추론.
   */
  targetMode?: 'self' | 'pattern';
}

/** 효과 핸들러 시그니처 — Phase 2d에서 systems/combat.ts가 사용. */
export type CardEffectHandler = (
  ctx: CardEffectContext,
) => CardEffectResult;

/** 효과 발동 컨텍스트 — 전투 시스템이 주입. */
export interface CardEffectContext {
  card: Card;
  effect: CardEffect;
  /** Forward declaration — 실제 타입은 systems/combat.ts에서. */
  combat: unknown;
}

/** 효과 발동 결과. */
export interface CardEffectResult {
  damageDealt?: number;
  healed?: number;
  blockGained?: number;
  cardsDrawn?: number;
  statusApplied?: string;
  /** 추가 액션 (예: 다른 카드 트리거) */
  followups?: unknown[];
}
