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
import type { ColorValues } from './npc';
import type {
  CardId,
  CharacterId,
  NodeId,
  NodeKind,
  NpcId,
  RelicId,
  Season,
  TimelineId,
} from './base';

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
  characterId: CharacterId;
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
  /** 히페리온 5단계 중 클리어한 단계 (true). */
  hyperionProgress: Record<number, boolean>;
  /** 그 런에서 친밀도가 오른 NPC들 (모노 히페리온 게이지 ② 입력). */
  npcAffinity: Record<NpcId, number>;
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
}
