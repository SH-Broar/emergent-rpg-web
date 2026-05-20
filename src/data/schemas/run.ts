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

  // === 전투 ===
  combat?: CombatState;

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
