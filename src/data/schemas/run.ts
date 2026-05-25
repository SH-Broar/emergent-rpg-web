/**
 * 한 런의 *런타임 상태* — 휘발성.
 *
 * spec v2: 런 종료 시 거의 모든 것이 소실되지만
 *   ① 도감(Codex)에 기록되고
 *   ② 히페리온/해석 진행도가 모노 게이지로 변환되어
 *   ③ 메타 진행에 누적된다.
 *
 * 이건 schema라기보다 *Pinia run 스토어의 상태 형태*이다.
 * (인터페이스만 정의, 실제 store는 src/stores/run.ts)
 */

import type { Card, CardEffect } from './card';
import type { Item } from './item';
import type { Relic } from './relic';
import type { Equipment, EquipmentId } from './equipment';
import type { ColorValues } from './npc';
import type {
  CardId,
  NodeId,
  NodeKind,
  NpcId,
  RaceId,
  RelicId,
  Season,
  TimelineId,
} from './base';

/**
 * 상점 슬롯 — 한 줄의 구매 가능 항목.
 * cardInstanceId는 *재고용 인스턴스* — 카드를 구매하면 이 인스턴스가 collection으로 이동.
 */
export interface ShopCardSlot {
  cardId: string;
  /** 미리 인스턴스화된 카드 사본 (재고용). 구매 시 collection에 push. */
  cardInstanceId: string;
  price: number;
  purchased: boolean;
}

export interface ShopRelicSlot {
  relicId: string;
  price: number;
  purchased: boolean;
}

/**
 * 상점 재료 슬롯 — *일반 재료 안정 공급* (Item Economy).
 * 구매할 때마다 보유에 1개씩 추가, 한 슬롯에 *재고 수량 한도*까지. (세이브 v? 호환 — optional)
 */
export interface ShopMaterialSlot {
  itemId: string;
  price: number;
  /** 남은 재고 수량. 0이면 매진. */
  stock: number;
}

/** 공방 제작 슬롯 — 희귀+ 카드 1장 후보. 진입 시 3장 추첨 후 고정. */
export interface ForgeCardSlot {
  cardId: string;
  cardInstanceId: string;
  price: number;
  purchased: boolean;
  /**
   * 요구되는 권역 특산물 ID (카드 element → 권역 primary_color → specialty_item 자동 매핑).
   * 미지정이면 시간조각만으로 제작 가능 (폴백 — 매칭 실패 카드).
   */
  requiredSpecialtyId?: string;
}

/** 공방 제작 제안 — 노드별 시드 추첨된 3장. 1장 구매 후 다른 슬롯도 purchased=true 처리. */
export interface ForgeOffer {
  generatedAt: number;
  cards: ForgeCardSlot[];
}

/** 한 상점 노드의 재고 스냅샷. */
export interface ShopInventory {
  /** 재고 생성 시점의 rngState 추적용 (디버그). */
  generatedAt: number;
  cards: ShopCardSlot[];
  relics: ShopRelicSlot[];
  removalUsed: boolean;
  removalPrice: number;
  /** 일반 재료 판매 슬롯 (Item Economy). 옛 세이브 호환 — optional(미존재 시 진입 시 생성). */
  materials?: ShopMaterialSlot[];
}

/** 락 해제 조건 종류. */
export type LockCondition = 'block' | 'damage' | 'draw' | 'no-attack' | 'no-defense';

/**
 * 락(조준형) — 적이 행동으로 거는 누적 해제 장치. CombatState.locks[]의 원소.
 * (상세는 CombatState.locks 주석 참조.)
 */
export interface Lock {
  condition: LockCondition;
  threshold: number;
  progress: number;
  label: string;
}

/**
 * 로스터/활성 슬롯의 동료 1명 참조 (Item 37-② Stage A).
 *  - id  : NPC id(현재) / Monster id(추후 Stage B 몬스터 동료화).
 *  - src : 정의를 찾을 데이터 풀. Stage A는 'npc'만 생성하지만 형태는 둘 다 허용.
 */
export interface RosterEntry {
  id: string;
  src: 'npc' | 'monster';
}

/** 적/플레이어 공유 전투 상태 표식. */
export interface Combatant {
  hp: number;
  maxHp: number;
  block: number;
  statuses: Record<string, number>; // status name → stack count
}

/** 현재 진행 중인 전투의 임시 상태. */
export interface CombatState {
  enemy: Combatant;
  enemyIntent?: string;
  /**
   * 이번 적 턴에 *연달아* 실행할 의도 목록(멀티액션 몬스터). 길이 = monster.actions.
   * 텔레그래프(다음 행동 표시)와 실행 모두 이 큐를 쓴다. 미설정/길이1이면 enemyIntent와 동일(단일 행동).
   * 전투 단위 — 세이브 round-trip 안전(optional).
   */
  enemyIntentQueue?: string[];
  /**
   * 특수 행동 쿨다운 — kind(또는 'debuff:status') → *이 턴까지 재발동 금지*. 강 디버프/준보스 특수가
   * 짧은 로테이션에서도 드물게 나오도록(쿨다운 중이면 텔레그래프·실행 모두 평범한 공격으로 대체).
   * 전투 단위(세이브 round-trip 안전 — optional).
   */
  intentCooldowns?: Record<string, number>;
  /** 쿨다운 대체 시 쓸 적 기본 공격치(monster.attack). startCombat이 설정. */
  enemyBaseAttack?: number;
  /**
   * 락인 수치 — *레거시* 적 전용 기믹(전역 단일 락). 적 의도가 `<special>~unlocked=attack:<weak>`로
   * 인코딩되어 있고 *lockin 행동을 쓰지 않는* 옛 몬스터에서만 쓰인다. monster.lockIn에서 시드.
   * 그 턴 방어 ≥ lockIn이면 special→약공격(호환 경로). 신규 저작은 `lockin:` 행동 + `locks`를 쓴다.
   * 0/미설정이면 락인 몹이 아니다(평범한 적엔 영향 0).
   */
  lockIn?: number;

  /**
   * 락(조준형) 목록 — *행동별 락* 재설계. 적이 `lockin:<condition>:<value>:<label>` 행동으로 건다.
   * 다중 락 동시 가능(서로 다른 조건). 해제 진행도는 *턴에 걸쳐 누적, 감쇠 없음*.
   *  - condition: 해제 방식.
   *      block      = 락 동안 누적 방어 합 ≥ threshold.
   *      damage     = 적에게 누적 피해 ≥ threshold.
   *      draw       = 뽑은 카드 수 ≥ threshold.
   *      no-attack  = (금욕형) 공격 없이 threshold 턴을 넘김(그 턴에 공격하면 카운트 무효).
   *      no-defense = (금욕형) 방어 없이 threshold 턴을 넘김.
   *  - threshold: 충족 목표(누적형=수치, 금욕형=깨끗이 넘길 턴 수).
   *  - progress : 현재 누적치. ≥ threshold면 해당 락 제거.
   *  - label    : 작가 지정 표시이름(배지 — 텔레그래프는 "락인"만).
   * 분기 `~unlocked=`는 *활성 락 0개*면 override, 아니면 base(강행동) + **활성 락 전부 해제**.
   * 전투 단위 — startCombat에서 []로 초기화. 옛 세이브(combat 직렬화)엔 없을 수 있어 *읽을 때 ?? [] 가드*.
   */
  locks?: Lock[];
  /** 금욕형 락 추적 — 이번 플레이어 턴에 *공격*(피해 주는 카드)을 했는가. 매 턴 false 리셋. */
  lockAttackedThisTurn?: boolean;
  /** 금욕형 락 추적 — 이번 플레이어 턴에 *방어*(블록 획득)를 했는가. 매 턴 false 리셋. */
  lockDefendedThisTurn?: boolean;
  player: Combatant;
  hand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  exhaustPile: Card[];
  turn: number;
  mana: number;
  maxMana: number;

  /**
   * 전투 행동 로그 — "방금 전 플레이 내용"을 턴 카운터 아래에 보여 주기 위한 짧은 문장 큐.
   * playCard(카드 사용 결과)/executeMonsterIntent(적 행동)에서 push. 오래된 항목은 앞에서 잘린다.
   * 세이브 round-trip 안전 — optional(absent=빈 로그).
   */
  log?: string[];

  /**
   * 적 인텐트 로테이션 *오버라이드* — set이면 pickSlot이 monster.intents 대신 이 배열을 순회.
   * 카오스 all-gimmick(만물의 송곳니)이 startCombat에서 종족 대표 기믹을 끼워 넣은 결과.
   * 일반 전투(미설정)에선 monster.intents를 그대로 쓴다. 전투 단위(세이브 round-trip 안전 — optional).
   */
  enemyIntentRotation?: string[];

  // === 보스 기믹 전용 (전부 optional — 일반 몬스터 전투에선 undefined라 영향 0) ===
  /**
   * 활성 보스 기믹. set일 때만 combat.ts의 기믹 분기가 동작.
   * BossView가 페이즈 전환마다 갱신. 일반 전투에선 항상 undefined.
   */
  bossMechanic?: 'anchor' | 'stillness' | 'rewind';
  /** 정지(stillness) 누적 스택. */
  stillness?: number;
  /** 이번 플레이어 턴 동안 사용 불가한 카드 instanceId 목록 (닻). */
  lockedCardIds?: string[];
  /** 직전 플레이어 턴에 적에게 입힌 피해 (되감기 회복량 계산용). */
  lastPlayerTurnDamage?: number;
  /** 플레이어 턴 시작 시 적 HP 스냅샷 (피해 계산용). */
  playerTurnStartEnemyHp?: number;
  /** 적 턴 수 — 닻 "2턴마다" 판정용. */
  bossTurnCount?: number;
  /** 이번 플레이어 턴이 정지로 얼어붙음 (마나 0 · 드로우 0). */
  frozenTurn?: boolean;

  /**
   * 유물 카운터 — `${relicId}:${name}` → 누적값. (예: 카드 N장마다, 공격 N회마다)
   * 전투 단위로 리셋(startCombat에서 {} 초기화). 일반/보스 전투 공통.
   */
  relicCounters?: Record<string, number>;

  /** 이번 턴에 사용한 카드 수 — first-card-free 유물 판정용. 매 턴 0으로 리셋. */
  cardsPlayedThisTurn?: number;

  /**
   * 이번 플레이어 턴에 전투 포션을 이미 썼는지 — 턴당 1회 가드 (Item Economy).
   * 매 새 턴 셋업(endPlayerTurn)에서 false 리셋. 옛 세이브 호환 — optional(absent=미사용).
   */
  potionUsedThisTurn?: boolean;

  // === 카드 교란 기믹 (Stage 2 — 전부 optional, 미설정 시 영향 0) ===
  /**
   * 구속(bind)/삼킴(devour) 상태 — 한 번에 하나만 활성. 발버둥(struggle)으로 해제.
   *  - bind   : 매 플레이어 턴 (base + ramp)장의 손패를 잠금(lockedCardIds 재사용).
   *  - devour : 매 플레이어 턴 시작에 (base + ramp) 직접 HP 피해(block 무시 DoT).
   * gauge=탈출까지 남은 양(발버둥으로 감소, 0이면 자동 해제). ramp=적 턴마다 +1.
   */
  grapple?: {
    kind: 'bind' | 'devour';
    gauge: number;
    base: number;
    ramp: number;
    label?: string;
    /** 강 구속(라미아 기본)·삼킴 — true면 버튼이 아니라 *색상 순서 미니게임*으로만 발버둥 가능. */
    hard?: boolean;
  };
  /** 이번 턴 발버둥 사용 여부 — 1턴 1회. 매 턴 false 리셋. */
  struggledThisTurn?: boolean;
  /** 손패 은폐 남은 턴 수 — >0이면 카드 뒷면 표시. 매 턴 -1. */
  obscuredTurns?: number;
  /** 카드 비용 상승 교란 — amount만큼 모든 카드 cost +, turns 동안 유지(매 턴 -1). */
  costUp?: { amount: number; turns: number };
  /** 다음 손패 드로우 감소량 — force-discard 인텐트가 누적, 다음 드로우에서 1회 소비. */
  drawDown?: number;
  /**
   * '손패에 즉시 쥐어주는' 잡카드 대기열 — add-card-hand 전용.
   * 몬스터는 플레이어 턴 *종료* 시 행동하므로 손패에 직접 넣으면 곧장 버려진다.
   * 대신 여기 모아 두고, *다음 손패 드로우 직후* 강제로 끼워 넣어 draw RNG와 무관하게 보장.
   */
  pendingHandJunk?: Card[];

  /**
   * @deprecated Item 28에서 변신 해제는 *변신 스택*(transform.releaseStack) 방식으로 교체됨.
   * '본모습' 카드는 이제 스택을 -2 하고 ≤0이면 즉시 원복한다(턴 카운트다운 폐기).
   * 이 필드는 더 이상 읽거나 쓰지 않으며, 구세이브 직렬화 호환을 위해 optional로만 남겨둔다.
   */
  releasePending?: number;

  /**
   * 변신 원복 *보류* 플래그 (Item 28 QA Medium-1) — '본모습' 카드 효과가 releaseStack≤0에 도달하면
   * 그 자리에서 rebuildCombatPiles를 하지 않고 이 플래그만 세운다. 효과 적용 도중 hand를 새로 그리면
   * playCard 본체의 handIndex(옛 hand 기준)가 stale이 되어 카드 증발/폼 카드 누출이 생기기 때문.
   * playCard가 *카드 이동을 끝낸 뒤* 이 플래그를 보고 원복+rebuild를 수행한다. 같은 전투 내 휘발(optional).
   */
  pendingTransformRevert?: boolean;

  // === 이상전투 심화 기믹 (Stage 6 — 전부 optional, 미설정 시 영향 0) ===
  /**
   * 분열(split) 잔여 부활 횟수 — startCombat에서 monster.splitCount로 초기화.
   * 적 hp<=0이 될 때 >0이면 *진짜 죽지 않고* maxHp 절반으로 부활 + 1 감소(resolveEnemyDefeat).
   * 0/미설정이면 일반 사망. 무한루프 방지: 부활할 때마다 감소하므로 splitCount+1번이면 진짜 패배.
   */
  enemySplit?: number;
  /**
   * 거미줄(web) 누적 스택 — bind와 별개의 *능동 해제형* 카드 잠금.
   * 매 플레이어 턴 시작에 min(handSize, webStacks)장을 무작위 잠금(lockedCardIds에 합산).
   * 카드를 *실제로 사용*할 때마다 1 감소(playCard) — 능동 플레이로 풀린다. 0이면 잠금 해제.
   */
  webStacks?: number;

  // === 동료 액티브 스킬 (Item 37-② Stage A — optional, 미설정 시 영향 0) ===
  /**
   * 활성 슬롯(activeSlots) 3칸의 스킬 쿨다운 — 길이 3, 인덱스 = 슬롯 위치.
   *  - 전투 시작 시 [0,0,0]으로 초기화(모두 준비됨).
   *  - 스킬 사용 시 해당 슬롯에 `cooldown - (slot===0 ? 1 : 0)` set(슬롯1 -1).
   *  - 매 플레이어 턴 시작에 각 슬롯 -1(최소 0).
   * 슬롯에 skill 동료가 없거나 비어 있으면 그 인덱스는 0(무의미).
   * 전투 단위 — 세이브 round-trip 안전(optional, absent=전부 준비됨).
   */
  skillCooldowns?: number[];

  // === 스킬 콘텐츠 배치 1 신규 핸들러 (Item 37-② Stage C) — 전부 optional, 미설정 시 영향 0 ===
  /**
   * 적 행동 박제(skip-enemy-action) — 남은 *스킵 횟수*. >0이면 적 턴에 행동 1개를 건너뛰고 -1.
   * 멀티액션이면 행동 하나씩 소비. 0/미설정이면 영향 0. 전투 단위 휘발(세이브 안전).
   */
  enemySkip?: number;
  /**
   * 적 둔화(slow-enemy) — 남은 *지속 턴 수*. >0이면 그 적 턴의 actions = max(1, actions-1) + 매 적 턴 -1.
   * 0/미설정이면 영향 0. 전투 단위 휘발.
   */
  enemySlow?: number;
  /**
   * 지연 피해(delayed-damage) 대기열 — 각 항목은 N턴 뒤 폭발할 효과셋.
   * 플레이어 턴 시작마다 turnsLeft-1, 0이면 effects를 적에게 실행 후 제거. 전투 단위 휘발.
   */
  pendingEffects?: { turnsLeft: number; effects: CardEffect[] }[];
  /**
   * 반사 흡수(negate-reflect) — active면 이번 턴 받는 피해를 hp 미차감하고 accumulated에 모은다.
   * *다음 플레이어 턴 시작* 시 accumulated를 적에게 반사 후 비활성화. 전투 단위 휘발.
   */
  negateReflect?: { active: boolean; accumulated: number };
  /**
   * 개화(bloom-strength) — 누적 힘 보너스. >0이면 매 플레이어 턴 시작 strength += bloom(비감쇠). 전투 단위 휘발.
   */
  bloom?: number;
  /**
   * 이번 턴 증폭(this-turn-amp) — 이번 플레이어 턴 동안 카드 *damage/heal/block* effect value를 (1+pct/100)배.
   * 매 새 턴 0으로 리셋(턴 종료 시 소멸). 전투 단위 휘발.
   */
  thisTurnAmp?: number;
}

/**
 * 노드별 *런 내 상태*. 재방문 정책의 핵심.
 *
 *  - 미방문 노드: 키 없음.
 *  - 첫 방문 후: visited=true. 노드 종류별 추가 필드.
 *  - 전투 클리어: combatCleared=true → 재방문 시 전투 없이 통과.
 *  - 전투 회피 (은밀): combatStealthed=true → 재방문 시 "싸울지/지나칠지" 선택.
 *  - 이벤트 발생: eventTriggered=event-id + eventCount 증가.
 *    데이터에 2회+ 분기가 있으면 다음 방문 시 그것이 발동.
 */
export interface NodeStateRecord {
  visited: boolean;
  combatCleared?: boolean;
  combatStealthed?: boolean;
  eventTriggered?: string;
  eventCount?: number;
  /** 활동 노드 발동 여부 — true면 다음 하루 경과(갱신) 전까지 재발동 안 함. */
  activityDone?: boolean;
  /** 휴식 노드 사용 여부 — true면 다음 하루 경과(갱신) 전까지 회복 없이 통과만. */
  restDone?: boolean;
  /** 채집 노드 발동 여부 — true면 다음 하루 경과(갱신) 전까지 재채집 안 함. */
  gatherDone?: boolean;
  /**
   * (구) 채집 횟수 — 반복 효율감쇠용. 미니게임 개편으로 *노드당 1회*(gatherDone)로 전환되며 폐기.
   * 구 세이브 호환을 위해 optional로 남겨두되 더 이상 읽지 않는다.
   */
  gatherCount?: number;
}

/** 한 런 전체의 휘발 상태. */
export interface RunState {
  // === 컨텍스트 ===
  timelineId: TimelineId;
  /** 이 런에서 깃든 종족 (구 characterId — characters/ 폐기 후 race로 통합). */
  raceId: RaceId;
  season: Season;
  /** 런 시작 시각 (ms). 통계용. */
  startedAt: number;

  /**
   * 결정론 시드 — 런 시작 시 결정, 영원히 같음 (디버그·재현용 표식).
   * 저장에서 복원하면 이 값이 그대로.
   */
  rngSeed: number;

  /**
   * 현재 PRNG 내부 상태 — 매 rng() 호출마다 진행됨. 저장·복원의 핵심.
   * 같은 (seed, state) 위치에서는 항상 같은 시퀀스가 이어진다.
   */
  rngState: number;

  // === 위치 / 시간 ===
  currentNodeId: NodeId;
  visitedNodes: NodeId[];
  /** 노드별 상태 (재방문 정책). */
  nodeStates: Record<NodeId, NodeStateRecord>;
  /** 시간 만료까지 남은 카운트 (시간 만료 = 즉시 런 종료). */
  remainingTime: number;

  /**
   * 혼란(possession) 잔존 스택 — 전투에서 정화하지 못한 혼란이 런에 남는다(0=없음).
   * (구 "빙의" 디버프. 새 빙의 카드 시스템은 possessions를 참조.)
   * 효과: 활동 노드 진입 불가 + 일부 간선 차단. 정화(마을/아이템)·하루 경과·다음 전투 정화로 해제.
   * 다음 전투 시작 시 이 값으로 player.statuses.possession을 시드한다.
   */
  possessed?: number;

  /**
   * 빙의(재설계) — 제외 불가 빙의 카드 추적. key = 카드 instanceId.
   *  - alignment: 받을 때 결정(guardian=수호령 좋음 / evil=악령 나쁨), 플레이어에겐 숨김.
   *  - awakening: 그 카드를 쓸 때마다 +1(여러 전투 누적). max 도달 시 이벤트+카드 변신.
   * 변신 후 해당 키는 삭제(더 이상 빙의 카드 아님 → 축복/저주 카드로 확정).
   */
  possessions?: Record<string, { alignment: 'guardian' | 'evil'; awakening: number; max: number }>;

  /**
   * 수화 중(feral-heavy) 잔존 — 전투 후에도 유지(0=없음). 공격 ×2 + 회복/방어 불가 + *탐색 보상 증가*.
   * 마을/휴식에서만 풀린다(하루 경과·아이템으로는 X). 다음 전투 시작 시 이 값으로 시드.
   */
  feralHeavy?: number;

  // === 지속 요소(2일차+ 사건 노드에서만 부여) — 전투 후 다른 노드에 영향. ===
  /** 축복 — 남은 전투 수. >0이면 보상 +25%. 전투 종료마다 -1. */
  blessingCombats?: number;
  /** 방울 표식 — 다음 *일반 전투*가 엘리트 전투로 격상(1회). 0/미설정=없음. */
  bellMarked?: number;
  /** 드래곤화 — 남은 전투 수. >0이면 모든 컬러가 dragonBoost만큼 *일시* 상승. 0 도달 시 원복. */
  dragonCombats?: number;
  /** 드래곤화로 더해진 컬러량(원복용). */
  dragonBoost?: number;

  /**
   * 현재 일차 — 30턴마다 +1 (`dayPassed` 트리거).
   * 시작은 1.
   */
  currentDay: number;


  /**
   * 우체부(로큐) 유물 `r-postman-mail` 효과 카운터.
   * 매 visitNode마다 +1. skip-turn-every:N 도달 시 시간 카운트 생략 + 0 리셋.
   * 유물 없거나 미보유 세이브에선 0/undefined.
   */
  postmanStepCount?: number;

  /**
   * 이번 런 동안 *플레이어가 받은 누적 피해*.
   * 모나토 영입 카드 `c-tripps-rage`의 동적 cost 계산용 (cost = max(0, 20 - runDamageReceived)).
   * 적의 공격이 player.hp를 깎는 *실제 손실*만 +=. block에 흡수된 분은 카운트 X.
   */
  runDamageReceived?: number;

  /**
   * 다음 턴 시작 *에너지 보너스* — `next-turn-energy` 효과 카드가 누적.
   * 칼리번 영입 카드 `c-trace-step` 사용 시 +1. endPlayerTurn에서 다음 턴 mana에 더하고 0으로 리셋.
   */
  nextTurnEnergyBonus?: number;

  /**
   * 노드별 *런타임 kind 오버라이드*.
   * 30턴 경과(advanceDay) 시 일부 비-마을 노드의 kind가 재추첨되어 여기에 기록.
   * 키 없는 노드는 NodeMap의 원본 kind 사용.
   */
  nodeKindOverrides: Record<NodeId, NodeKind>;

  /**
   * 노드별 *런타임 콘텐츠 오버라이드* — 권역 풀에서 재추첨된 enemy/event 등.
   * 키 없는 노드는 NodeMap의 원본 contentRef 사용.
   */
  nodeContentOverrides: Record<NodeId, {
    enemyGroupId?: string;
    eventIdPool?: string[];
  }>;

  /**
   * 상점 노드별 *재고 스냅샷* — 처음 진입 시 시드 추첨 후 *고정*.
   * 재방문해도 같은 재고. 구매된 슬롯은 purchased=true로 마킹되어 dim 표시.
   * 키 없는 노드는 진입 시 생성. (세이브 v2 호환 — optional)
   */
  shopInventories?: Record<NodeId, ShopInventory>;

  /**
   * 공방 노드별 *희귀+ 제작 제안* — 처음 진입 시 3장 추첨 후 *고정*.
   * 1장 구매하면 나머지 슬롯도 purchased=true (1장 한정).
   * 강화 슬롯은 *매번 사용 가능*이라 별도 스냅샷 X.
   */
  forgeOffers?: Record<NodeId, ForgeOffer>;

  /**
   * 마지막 *하루 경과 이벤트* 시퀀스 — UI가 watch해서 배너 트리거.
   * advanceDay() 호출마다 +1. day 자체와 별개로 *발생 자체*를 신호로 쓰기 위해.
   */
  dayPassedSeq: number;
  /**
   * 덱 슬롯 — 전투에 들고가는 카드 수 (사용자 사양: 10 고정).
   * 카드 자체는 collection에 무제한 보유, 그 중 deck 슬롯에 등록된 것만 전투 사용.
   */
  deckSize: number;

  // === 빌드 ===
  /** 전투용 덱 (deckSize 슬롯, collection 의 부분집합). */
  deck: Card[];
  /** 보유 카드 컬렉션 — 무제한. 덱 편집 화면에서 토글로 deck에 등록. */
  collection: Card[];
  relics: Relic[];
  hp: number;
  maxHp: number;
  /**
   * 빛·어둠 컬러로부터 파생된 *최대 HP 보너스의 현재 누적분* (VIT 활력).
   * maxHp에 *이미 포함*돼 있으며, 빛/어둠 변동 시 델타만 재조정한다(colors.applyColorBoost).
   * 세이브에 maxHp와 함께 저장돼 정합 유지. 옛 세이브엔 없으면 0으로 backfill.
   */
  colorHpBonus?: number;
  mp: number;
  maxMp: number;
  gold: number;
  /** 시간의 조각 — 카드/유물 *런 내 제작* 전용 재화 (휘발). */
  timeShards: number;

  /**
   * 목숨 (Item 28) — 전투 패배(HP 0) 시 게임오버 대신 1 소모하고 도망.
   *  - lives    : 현재 목숨. 패배 시 -1, 0이 되면 런 종료(endRun 'hp-zero').
   *  - maxLives : 상한. 유물·종족 강화로 증가(올릴 때 lives도 같이 증가). 포션은 min(lives+1, maxLives).
   * EMPTY_RUN 기본 2/2. additive optional — 구세이브는 `{...EMPTY_RUN, ...parsed}`로 자동 2/2 채움.
   */
  lives: number;
  maxLives: number;

  /**
   * 6 컬러 스탯 (각 0~100 권장).
   * 페어 → 3 스탯:
   *   ATK = CalculateStat(fire, electric)
   *   DEF = CalculateStat(earth, iron)
   *   MAG = CalculateStat(water, wind)
   * 전투 보너스로 환산되어 damage/block/draw/mana에 더해짐.
   */
  colors: ColorValues;

  /** 인벤토리 — 즉시 사용 가능한 아이템 인스턴스. */
  items: Item[];

  /**
   * 단서 인벤토리 — 간접 스토리 아이템 (사라지지 않음, 사용 시 본문 노출).
   * 런 휘발. 같은 id 중복 보유 X (`Set`처럼 동작).
   * (세이브 v2 호환 — optional)
   */
  clues?: import('./clue').Clue[];

  // === 장비 (M9) ===
  /** 장착 중 — 슬롯별 1개씩. null이면 비어있음. */
  equippedWeapon: EquipmentId | null;
  equippedChest: EquipmentId | null;
  equippedAccessory: EquipmentId | null;
  /** 소지중 장비 (인벤토리). 장착 토글로 슬롯과 오감. */
  equipmentInventory: Equipment[];

  /**
   * @deprecated Item 37-② Stage A — `roster`/`activeSlots`로 대체됨.
   *   구세이브 마이그레이션(loadActiveRun)에서 roster/activeSlots로 변환된 뒤 빈 배열로 유지된다.
   *   코드는 더 이상 이 필드를 읽지 않는다(직렬화 호환 위해 형태만 남김).
   */
  companions: NpcId[];

  /**
   * 영입 로스터 (Item 37-② Stage A) — *그 런에서 영입한 동료 전체*. 런 한정.
   * 영입 1회면 여기 추가(중복 스킵). 3칸 편성과 무관하게 보존된다.
   *  - id : NPC id(현재) / Monster id(추후 Stage B).
   *  - src: 'npc' | 'monster' — 어느 데이터 풀에서 정의를 찾을지.
   */
  roster: RosterEntry[];

  /**
   * 활성 슬롯 (Item 37-② Stage A) — 길이 3, *순서가 전략*(슬롯1 스킬 쿨다운 -1).
   * 각 칸은 roster의 동료 1명(또는 null=빈 칸). 패시브 집계·스킬 버튼은 이 배열만 본다.
   * 편성 UI(캐릭터 메뉴)에서 동행/이탈/순서 지정.
   */
  activeSlots: (RosterEntry | null)[];

  /**
   * 영입 이력 — companion id → 최초 영입된 노드. dismiss 후에도 보존되어
   * 다시 그 노드에 가야 *재영입* 권유 가능(legacy 영입 흐름, Stage B에서 개편).
   */
  recruitedAt: Record<string, NodeId>;

  /**
   * @deprecated Item 37-② Stage A — 영입 1회 보너스(덱슬롯/카드/유물/컬러) 제거로 더 이상 쓰지 않음.
   *   구세이브 직렬화 호환을 위해 형태만 남긴다(loadActiveRun이 {}로 backfill).
   */
  companionAppliedBonuses: Record<string, {
    deckSizeAdd: number;
    addedCardInstanceIds: string[];
    addedRelicIds: RelicId[];
    colorBoostsApplied: Partial<{
      fire: number; water: number; electric: number; iron: number;
      earth: number; wind: number; light: number; dark: number;
    }>;
  }>;

  // === 진행도 (런 종료 시 모노 게이지로 변환) ===
  /**
   * 히페리온 5단계 중 클리어한 단계 (true).
   * @deprecated 5단계 미션 시스템은 r4에서 제거됨. 세이브 v2 호환성을 위해 *optional*로 유지.
   * 새 런에서는 항상 빈 객체. 옛 세이브의 잔존 진행도는 progression.ts가 0으로 처리.
   * 다음 라운드 v3에서 제거 예정.
   */
  hyperionProgress?: Record<number, boolean>;
  /** 그 런에서 친밀도가 오른 NPC들 (모노 히페리온 게이지 ② 입력). */
  npcAffinity: Record<NpcId, number>;
  /**
   * NPC별 *이미 발사된 affinity 보상 임계* 목록 — 중복 발사 방지.
   * 옵셔널 (세이브 v2 호환). 미존재 시 빈 객체로 폴백.
   */
  affinityRewardsClaimed?: Record<NpcId, number[]>;
  /** 그 런에서 클리어한 시대 미션 ID 목록. */
  missionsCleared: string[];
  /** 그 런에서 클리어한 보스 ID 목록. */
  bossesCleared: string[];

  /**
   * 그 런에서 클리어한 arc 보스 ID 목록 (작업 29) — 던·티프레·타마모 등.
   * arc 승리는 *런을 끝내지 않으므로* bossesCleared(런 종료 보스)와 분리해 둔다.
   * 특전 자동 드롭의 *첫 클리어 1회 가드*에 쓰인다. 옛 세이브 호환 — optional(absent=빈 목록).
   */
  arcsCleared?: string[];

  // === 휘발 컬렉션 (런 종료 시 도감 등록) ===
  /** 그 런에서 *처음* 본 카드 ID들. */
  newCardEncounters: CardId[];
  /** 그 런에서 *처음* 얻은 유물 ID들. */
  newRelicEncounters: string[];
  /** 그 런에서 처음 만난 NPC ID들. */
  newNpcEncounters: NpcId[];

  /**
   * 변신(체인지/TSF) 상태 — 희귀 특수 몬스터가 종족+덱 전체를 폼으로 교체(Stage 5).
   * set이면 *변신 중*: raceId/deck/collection/deckSize는 폼 값, 원본은 stash에 보관.
   *  - 변신 시 releaseStack=5 부여. 폼 덱의 *해제 카드*(release-transform)를 쓰면 스택 -2.
   *    스택 ≤ 0이면 원복(원본 종족·덱·컬렉션·덱슬롯 복원). 스택은 전투 종료·패배·도망 무관 유지(자동 감쇠 없음).
   *  - 해제하지 않고 전투를 이기면 변신이 *런에 지속*(이후 폼으로 플레이, 도박).
   *  - 이벤트/아이템/NPC 정화(cleanse-transform)로도 즉시 원복(영구 아님).
   * 미설정(undefined)이면 변신 아님. 옛 세이브 호환 — EMPTY_RUN에 없음(absent=none).
   * releaseStack은 변신 중 구세이브에 없을 수 있어 사용처에서 `?? 5` 가드.
   */
  transform?: {
    formRaceId: RaceId;
    originalRaceId: RaceId;
    stashDeck: Card[];
    stashCollection: Card[];
    stashDeckSize: number;
    /** 변신 해제 진행 스택 — 변신 시 5, '본모습' 카드마다 -2, ≤0이면 원복. */
    releaseStack: number;
  };

  // === 전투 ===
  combat?: CombatState;

  // === 카오스 도전-점수 시스템 (Phase A, 세이브 v3 — Round 12 강도 모델) ===
  /**
   * 이 런에서 활성화된 카오스 — *강도(intensity) 포함*.
   * 시작형(start-*)은 startRun에서 그 강도의 param으로 1회 적용. 런 도중 불변(시작형 고정).
   * 상시형은 그 강도 param으로 조회 시점 적용. 점수는 강도별 점수의 합.
   * 복원 시 반드시 [] 기본값 보장(코드가 iterate). EMPTY_RUN에 []로 등재 → 옛 세이브 자동 안전.
   * (구 string[] 형태가 섞여 들어오면 systems/chaos.ts가 {id, intensity:1}로 정규화.)
   */
  activeChaos: { id: string; intensity: number }[];
  /** 활성 카오스 도전 점수 캐시 (옵셔널 — computeChaosScore로 언제든 재계산 가능). */
  chaosScore?: number;
  /**
   * `ch-color-seal`(색의 침묵, T4) 전용 — 런 시작 시 무작위로 봉인된 1색.
   * 그 색 카드는 전투에서 사용 불가(canPlay 차단). 실제 차단 로직은 Phase B/C.
   * Phase A는 *필드만* 추가(세이브 round-trip 보장). 미설정이면 봉인 없음.
   */
  chaosBannedColor?: string;

  // === 종료 ===
  ended: boolean;
  endReason?: 'hp-zero' | 'free-end' | 'time-up' | 'boss-cleared' | 'boss-defeated';

  /**
   * 메타 흡수(absorbRunIntoMeta) *완료* 플래그 — 런당 정확히 1회만 게이지/영혼 반영.
   * RunEndView가 새로고침·재마운트되어도 중복 적용을 막는 가드.
   * EMPTY_RUN 기본 미설정(=false). 옛 세이브 호환 위해 optional.
   */
  metaAbsorbed?: boolean;
}
