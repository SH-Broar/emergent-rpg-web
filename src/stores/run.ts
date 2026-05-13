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
  RunState,
  Season,
  TimelineId,
} from '@/data/schemas';

const EMPTY_RUN: RunState = {
  timelineId: '',
  characterId: '',
  season: 'spring',
  startedAt: 0,
  currentNodeId: '',
  visitedNodes: [],
  remainingTime: 0,
  deckSize: 10,
  deck: [],
  relics: [],
  hp: 0,
  maxHp: 0,
  mp: 0,
  maxMp: 0,
  gold: 0,
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
      fresh.remainingTime = params.timeLimit;
      fresh.hp = params.maxHp;
      fresh.maxHp = params.maxHp;
      fresh.mp = params.maxMp;
      fresh.maxMp = params.maxMp;
      this.data = fresh;
      this.active = true;
    },

    /** 노드 방문 — 시간 1 카운트 감소 + 덱 확장 임계 체크. */
    visitNode(nodeId: string, expansionThresholds: [number, number]) {
      const r = this.data;
      r.currentNodeId = nodeId;
      r.visitedNodes.push(nodeId);
      r.remainingTime = Math.max(0, r.remainingTime - 1);

      // 덱 확장 임계 — remainingTime 또는 visitedNodes.length 기준
      // spec: 시간 = 노드 방문 카운트. 임계 = 방문 누적 수
      const visited = r.visitedNodes.length;
      if (r.deckSize === 10 && visited >= expansionThresholds[0]) {
        r.deckSize = 20;
      } else if (r.deckSize === 20 && visited >= expansionThresholds[1]) {
        r.deckSize = 30;
      }
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
