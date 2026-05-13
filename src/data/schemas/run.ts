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
import type { Relic } from './relic';
import type {
  CardId,
  CharacterId,
  NodeId,
  NpcId,
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

  // === 위치 / 시간 ===
  currentNodeId: NodeId;
  visitedNodes: NodeId[];
  /** 노드별 상태 (재방문 정책). */
  nodeStates: Record<NodeId, NodeStateRecord>;
  /** 보스 게이트까지 남은 노드 방문 수. */
  remainingTime: number;
  /** 현재 덱 슬롯 수 (10 → 20 → 30). */
  deckSize: 10 | 20 | 30;

  // === 빌드 ===
  deck: Card[];          // 현재 덱 (영구, 휘발성이지만 런 내내 보존)
  relics: Relic[];
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;

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
