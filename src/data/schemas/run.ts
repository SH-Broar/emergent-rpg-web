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

import type { Card } from './card';
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
  player: Combatant;
  hand: Card[];
  drawPile: Card[];
  discardPile: Card[];
  exhaustPile: Card[];
  turn: number;
  mana: number;
  maxMana: number;

  /**
   * 적 인텐트 로테이션 *오버라이드* — set이면 pickIntent가 monster.intents 대신 이 배열을 순회.
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

  // === 전투 에로 / 카드 교란 기믹 (Stage 2 — 전부 optional, 미설정 시 영향 0) ===
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
   * 변신 해제 진행 카운트다운 — '본모습'(release-transform) 카드를 쓰면 즉시가 아니라
   * 이 값(턴 수)만큼 지나야 원복(applyPlayerStatusTurnStart에서 매 턴 -1, 0 도달 시 복원+더미 재구성).
   * 사용자 사양: 해제는 ~2턴 걸린다. 전투 중 미완(승리) 시 변신 지속.
   */
  releasePending?: number;

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
  mp: number;
  maxMp: number;
  gold: number;
  /** 시간의 조각 — 카드/유물 *런 내 제작* 전용 재화 (휘발). */
  timeShards: number;

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
   * 현재 동료 (최대 3명) — NPC id 리스트.
   * 사용자 사양: 동료가 이탈하면 *최초 만난 노드*로 가야 다시 권유 가능.
   */
  companions: NpcId[];

  /**
   * 영입 이력 — npcId → 최초 영입된 노드. dismiss 후에도 보존되어
   * 다시 그 노드에 가야 *재영입* 권유 가능.
   */
  recruitedAt: Record<NpcId, NodeId>;

  /**
   * 동료 적용 보너스 기록 — dismiss 시 정확히 역적용하기 위함.
   * 같은 NPC가 두 번 다시 영입되면 다시 만들어 저장.
   */
  companionAppliedBonuses: Record<NpcId, {
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
   *  - 폼 덱의 *해제 카드*(release-transform)를 쓰면 원복.
   *  - 해제하지 않고 전투를 이기면 변신이 *런에 지속*(이후 폼으로 플레이, 도박).
   *  - 이벤트/아이템/NPC 정화(cleanse-transform)로도 원복(영구 아님).
   * 미설정(undefined)이면 변신 아님. 옛 세이브 호환 — EMPTY_RUN에 없음(absent=none).
   */
  transform?: {
    formRaceId: RaceId;
    originalRaceId: RaceId;
    stashDeck: Card[];
    stashCollection: Card[];
    stashDeckSize: number;
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
