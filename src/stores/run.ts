/**
 * Pinia 스토어 — 한 런의 휘발 상태.
 *
 * spec v2: 런 종료 시 거의 모든 것이 소실되지만,
 *   ① 도감(codex 스토어)에 등록,
 *   ② 히페리온/해석 진행도가 meta 스토어로 변환된다.
 *
 * 이 스토어는 *그 시점 한 런*만 보유. 게임 시작 시 startRun()으로 초기화.
 */

import { defineStore } from 'pinia';
import type {
  CharacterId,
  NodeKind,
  RunState,
  Season,
  TimelineId,
} from '@/data/schemas';
import { instantiateCard } from '@/systems/deck';
import { useDataStore } from './data';

const DECK_SLOT_SIZE = 10;
/** 30턴마다 하루 경과 — 비-마을 노드 cleared 초기화 + 권역 풀에서 content 재추첨.
 *  사용자 결정: 지도 모양은 유지(노드 kind 고정), content만 권역 풀에서 매일 새로 추첨.
 */
const TURNS_PER_DAY = 30;

const EMPTY_RUN: RunState = {
  timelineId: '',
  characterId: '',
  season: 'spring',
  startedAt: 0,
  currentNodeId: '',
  visitedNodes: [],
  nodeStates: {},
  remainingTime: 0,
  currentDay: 1,
  nodeKindOverrides: {},
  nodeContentOverrides: {},
  dayPassedSeq: 0,
  deckSize: DECK_SLOT_SIZE,
  deck: [],
  collection: [],
  relics: [],
  hp: 0,
  maxHp: 0,
  mp: 0,
  maxMp: 0,
  gold: 0,
  timeShards: 0,
  hyperionProgress: {},
  npcAffinity: {},
  missionsCleared: [],
  bossesCleared: [],
  newCardEncounters: [],
  newRelicEncounters: [],
  newNpcEncounters: [],
  ended: false,
};

export const useRunStore = defineStore('run', {
  state: (): { active: boolean; data: RunState } => ({
    active: false,
    data: structuredClone(EMPTY_RUN),
  }),

  getters: {
    isCombatActive: (state) => state.active && state.data.combat !== undefined,
    isEnded: (state) => state.data.ended,
    /** 다음 덱 확장 임계까지 남은 시간 (단순 추정 — 실제는 timeline에서 가져옴). */
    progressRatio: (state) =>
      state.data.remainingTime > 0 ? 1 - state.data.remainingTime / 100 : 1,
  },

  actions: {
    /** 새 런 시작 — 연표·캐릭터·계절 컨텍스트 주입. */
    startRun(params: {
      timelineId: TimelineId;
      characterId: CharacterId;
      season: Season;
      maxHp: number;
      maxMp: number;
      startNodeId: string;
      timeLimit: number;
    }) {
      const fresh = structuredClone(EMPTY_RUN);
      fresh.timelineId = params.timelineId;
      fresh.characterId = params.characterId;
      fresh.season = params.season;
      fresh.startedAt = Date.now();
      fresh.currentNodeId = params.startNodeId;
      // 시작 노드도 visited로 마킹 (재방문 시 시작 노드 본인 처리 X)
      fresh.nodeStates[params.startNodeId] = { visited: true };
      fresh.remainingTime = params.timeLimit;
      fresh.hp = params.maxHp;
      fresh.maxHp = params.maxHp;
      fresh.mp = params.maxMp;
      fresh.maxMp = params.maxMp;
      this.data = fresh;
      this.active = true;
    },

    /** 노드 방문 — 시간 1 카운트 감소 + 방문 상태 마킹 + 30턴마다 하루 경과. */
    visitNode(nodeId: string, _unusedThresholds?: [number, number]) {
      const r = this.data;
      r.currentNodeId = nodeId;
      r.visitedNodes.push(nodeId);
      r.remainingTime = Math.max(0, r.remainingTime - 1);

      // 노드 상태 마킹
      if (!r.nodeStates[nodeId]) {
        r.nodeStates[nodeId] = { visited: true };
      } else {
        r.nodeStates[nodeId].visited = true;
      }
      // 덱 슬롯 확장은 사용자 사양 변경으로 폐기 — deckSize 고정 (10)
      void _unusedThresholds;

      // 30턴마다 하루 경과 — visitedNodes.length 기준 (한 노드 = 1턴).
      if (r.visitedNodes.length > 0 && r.visitedNodes.length % TURNS_PER_DAY === 0) {
        this.advanceDay();
      }
    },

    /**
     * 하루 경과 트리거 — 사용자 결정에 따라 *지도 모양(노드 kind)은 유지*.
     *   - currentDay +1
     *   - dayPassedSeq +1 (UI watch용)
     *   - 비-마을·비-보스·비-shop·비-workshop·비-시작 노드의 cleared/eventTriggered/stealthed 초기화
     *   - 같은 종류의 content(enemy/event)를 그 노드 *권역 풀에서* 재추첨
     */
    advanceDay() {
      const r = this.data;
      r.currentDay += 1;
      r.dayPassedSeq += 1;

      const data = useDataStore();
      const tl = data.timelines.get(r.timelineId);
      const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
      if (!map) return;

      const protectedKinds = new Set<NodeKind>(['village', 'boss', 'shop', 'workshop']);
      // 권역 ID → Region 매핑.
      const regionMap = new Map(map.regions.map((rg) => [rg.id, rg]));

      const pickRandom = <T,>(arr: T[]): T | undefined =>
        arr.length === 0 ? undefined : arr[Math.floor(Math.random() * arr.length)];

      /** 노드 종류에 맞는 content를 그 권역 풀에서 추첨. 풀이 비면 원본 contentRef 그대로. */
      const pickContentForKind = (
        node: import('@/data/schemas').Node,
        kind: NodeKind,
        region: import('@/data/schemas').Region | undefined,
      ): { enemyGroupId?: string; eventIdPool?: string[] } => {
        switch (kind) {
          case 'combat': {
            const pool = region?.enemyPool ?? [];
            return { enemyGroupId: pickRandom(pool) ?? node.contentRef?.enemyGroupId };
          }
          case 'elite': {
            const pool = region?.eliteEnemyPool ?? [];
            return { enemyGroupId: pickRandom(pool) ?? node.contentRef?.enemyGroupId };
          }
          case 'event': {
            const pool = region?.eventPool ?? [];
            const pick = pickRandom(pool);
            return { eventIdPool: pick ? [pick] : node.contentRef?.eventIdPool };
          }
          default:
            return {};
        }
      };

      for (const node of map.nodes) {
        // 시작 노드(현재 위치)는 건드리지 않음.
        if (node.id === r.currentNodeId) continue;
        // 마을·보스·상점·공방은 항상 그대로.
        if (protectedKinds.has(node.kind)) continue;

        // 1) cleared / eventTriggered / combatStealthed 초기화 — visited는 유지.
        const st = r.nodeStates[node.id];
        if (st) {
          st.combatCleared = false;
          st.combatStealthed = false;
          st.eventTriggered = undefined;
          st.eventCount = 0;
        }

        // 2) 노드 *원본 kind는 그대로* — 지도 모양 유지.
        //    content만 권역 풀에서 재추첨.
        const region = regionMap.get(node.region ?? '');
        const content = pickContentForKind(node, node.kind, region);
        if (content.enemyGroupId || content.eventIdPool) {
          r.nodeContentOverrides[node.id] = content;
        }
      }
    },

    /**
     * 카드 컬렉션에 추가 — 매 호출마다 *새 인스턴스*를 만들어 push.
     * 동명 카드를 여러 장 받아도 각각 별개 instanceId.
     */
    addCardToCollection(card: import('@/data/schemas').Card) {
      // 정의(원본 데이터)에는 instanceId가 없음 → 인스턴스화.
      // 이미 인스턴스화된 카드(드롭/이벤트 보상)는 그대로 받음.
      const instance = card.instanceId ? { ...card } : instantiateCard(card);
      this.data.collection.push(instance);
      if (!this.data.newCardEncounters.includes(card.id)) {
        this.data.newCardEncounters.push(card.id);
      }
    },

    /**
     * 덱 편집: 컬렉션의 *인스턴스 id 목록*을 받아 그 인스턴스들로 deck을 채움.
     * 동명 카드도 별개 instanceId면 별개로 취급.
     */
    setDeckFromCollection(instanceIds: string[]) {
      const r = this.data;
      const map = new Map(
        r.collection
          .filter((c): c is import('@/data/schemas').Card & { instanceId: string } => !!c.instanceId)
          .map((c) => [c.instanceId, c]),
      );
      const next: import('@/data/schemas').Card[] = [];
      for (const iid of instanceIds) {
        const c = map.get(iid);
        if (c) next.push(c);
      }
      r.deck = next;
    },

    /** 전투 클리어 마킹 — 재방문 시 전투 없이 통과. */
    markCombatCleared(nodeId: string) {
      const r = this.data;
      if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
      r.nodeStates[nodeId].combatCleared = true;
      r.nodeStates[nodeId].combatStealthed = false;
    },

    /** 전투 회피(은밀) 마킹 — 재방문 시 "싸울지/지나칠지" 선택. */
    markCombatStealthed(nodeId: string) {
      const r = this.data;
      if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
      r.nodeStates[nodeId].combatStealthed = true;
    },

    /** 이벤트 발생 마킹. 카운트 증가. */
    markEventTriggered(nodeId: string, eventId: string) {
      const r = this.data;
      if (!r.nodeStates[nodeId]) r.nodeStates[nodeId] = { visited: true };
      r.nodeStates[nodeId].eventTriggered = eventId;
      r.nodeStates[nodeId].eventCount = (r.nodeStates[nodeId].eventCount ?? 0) + 1;
    },

    /** 노드 상태 조회 (없으면 미방문). */
    getNodeState(nodeId: string) {
      return this.data.nodeStates[nodeId];
    },

    /** 런 종료 — endRun()을 호출하면 외부에서 codex/meta 갱신을 트리거. */
    endRun(reason: NonNullable<RunState['endReason']>) {
      this.data.ended = true;
      this.data.endReason = reason;
      this.active = false;
    },

    /** 메인 메뉴로 돌아갈 때 호출 — 상태 비움. */
    reset() {
      this.data = structuredClone(EMPTY_RUN);
      this.active = false;
    },
  },
});
