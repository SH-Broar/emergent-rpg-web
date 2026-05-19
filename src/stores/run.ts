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
import { createSeededRng, generateInitialSeed, rng, setRng } from '@/systems/rng';
import { useDataStore } from './data';

/**
 * localStorage 키 — 활성 런 스냅샷. 사용자 요구에 따라 노드 입장마다 자동 저장.
 *
 * M9에서 v1 → v2 마이그레이션 (RunState에 장비 4필드 추가).
 *   - 새 저장은 v2 키.
 *   - 옛 v1 키는 read-fallback + 마이그레이션 후 제거.
 */
const SAVED_RUN_KEY_V1 = 'rdc-active-run-v1';
const SAVED_RUN_KEY = 'rdc-active-run-v2';

const DECK_SLOT_SIZE = 10;
/** 100턴마다 하루 경과 — 비-마을 노드 cleared 초기화 + 권역 풀에서 content 재추첨.
 *  사용자 결정 (2026-05-19): 한 런=300턴=3일, 권역 평균 ~22노드(전체 ~200노드)에 맞춘 사양.
 *  지도 모양은 유지(노드 kind 고정), content만 권역 풀에서 매일 새로 추첨.
 */
const TURNS_PER_DAY = 100;

const EMPTY_RUN: RunState = {
  timelineId: '',
  characterId: '',
  season: 'spring',
  startedAt: 0,
  rngSeed: 0,
  rngState: 0,
  currentNodeId: '',
  visitedNodes: [],
  nodeStates: {},
  remainingTime: 0,
  currentDay: 1,
  nodeKindOverrides: {},
  nodeContentOverrides: {},
  shopInventories: {},
  forgeOffers: {},
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
  colors: {
    fire: 0,
    water: 0,
    electric: 0,
    iron: 0,
    earth: 0,
    wind: 0,
    light: 0,
    dark: 0,
  },
  items: [],
  clues: [],
  equippedWeapon: null,
  equippedChest: null,
  equippedAccessory: null,
  equipmentInventory: [],
  companions: [],
  recruitedAt: {},
  companionAppliedBonuses: {},
  hyperionProgress: {},
  npcAffinity: {},
  affinityRewardsClaimed: {},
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
    /** 새 런 시작 — 연표·캐릭터·계절 컨텍스트 + 결정론 시드 주입. */
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
      // 한 판 고정 시드 — 이 시점에 한 번 결정되어 *런 끝까지 같은 시퀀스*.
      const seed = generateInitialSeed();
      fresh.rngSeed = seed;
      fresh.rngState = seed;
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
      this.bindRng();
    },

    /**
     * 시드 기반 RNG를 *전역 rng()*에 바인딩 — 호출 시점부터 모든 시스템이
     * 결정론적 난수를 사용. 저장된 런 복원 후에도 호출 필요.
     */
    bindRng() {
      const r = this.data;
      const prng = createSeededRng(r.rngState);
      setRng(() => {
        const v = prng.next();
        // 매 호출마다 RunState의 rngState도 진행 — 다음 저장이 정확히 그 지점부터 이어지도록.
        r.rngState = prng.getState();
        return v;
      });
    },

    /**
     * localStorage 활성 런 스냅샷에 저장. JSON 직렬화 가능하도록
     * RunState는 plain object 구성을 유지함.
     */
    saveActiveRun() {
      // 이중 가드 (Round2 ⚠5): 비활성 또는 종료된 런은 저장 금지 — 종료 직후 mutation이
      // $subscribe로 들어와도 안전.
      if (!this.active || this.data.ended) return;
      try {
        const snapshot = JSON.stringify(this.data);
        localStorage.setItem(SAVED_RUN_KEY, snapshot);
      } catch (err) {
        console.warn('[run] save 실패:', err);
      }
    },

    /** localStorage에서 저장된 스냅샷 *존재* 여부 확인 (메뉴 dialog용). v1 fallback 포함. */
    hasSavedRun(): boolean {
      try {
        return (
          localStorage.getItem(SAVED_RUN_KEY) !== null ||
          localStorage.getItem(SAVED_RUN_KEY_V1) !== null
        );
      } catch {
        return false;
      }
    },

    /**
     * 저장된 스냅샷을 읽어 활성 런으로 복원. 성공 시 true.
     * rngState도 그대로 들어가 *다음 의사난수가 동일*한 시퀀스로 이어짐.
     *
     * M9: v2 → v1 fallback 마이그레이션. v2 키 우선, 없으면 v1 키를 읽어
     * 신규 장비 4필드를 기본값으로 채워 v2로 즉시 저장 + v1 제거.
     */
    loadActiveRun(): boolean {
      try {
        let raw = localStorage.getItem(SAVED_RUN_KEY);
        let migratedFromV1 = false;
        if (!raw) {
          raw = localStorage.getItem(SAVED_RUN_KEY_V1);
          if (!raw) return false;
          migratedFromV1 = true;
        }
        const parsed = JSON.parse(raw) as Partial<RunState>;
        // EMPTY_RUN spread 후 parsed로 override — 향후 신규 필드도 EMPTY_RUN에만 추가하면 자동 보호.
        // (Round2 W2: 명시적 ?? 라인 제거 — redundant + future v3 추가 시 "한 줄 깜빡" 회귀 위험 차단.)
        const filled: RunState = {
          ...structuredClone(EMPTY_RUN),
          ...parsed,
        };
        this.data = filled;
        this.active = !filled.ended;
        if (this.active) this.bindRng();
        if (migratedFromV1) {
          // v2 키로 즉시 저장 후 v1 키 제거.
          this.saveActiveRun();
          try { localStorage.removeItem(SAVED_RUN_KEY_V1); } catch { /* ignore */ }
        }
        return this.active;
      } catch (err) {
        console.warn('[run] load 실패:', err);
        return false;
      }
    },

    /** 저장된 스냅샷 삭제 — N(새 시작) 또는 런 종료 시. v1/v2 모두 제거. */
    clearSavedRun() {
      try {
        localStorage.removeItem(SAVED_RUN_KEY);
        localStorage.removeItem(SAVED_RUN_KEY_V1);
      } catch {
        // ignore
      }
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

      // 저장은 App.vue의 $subscribe가 *모든 mutation*마다 자동 처리.
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
        arr.length === 0 ? undefined : arr[Math.floor(rng() * arr.length)];

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
     * 아이템 한 점 인벤토리에 추가. 카드와 같이 *매 호출 새 인스턴스*.
     */
    addItem(item: import('@/data/schemas').Item) {
      const rand = Math.random().toString(36).slice(2, 8);
      const instance: import('@/data/schemas').Item = item.instanceId
        ? { ...item }
        : { ...item, instanceId: `${item.id}#${rand}` };
      this.data.items.push(instance);
    },

    /**
     * 단서 1개 인벤토리에 추가. 같은 id 중복 X (이미 있으면 무시).
     */
    addClue(clue: import('@/data/schemas').Clue): boolean {
      if (!this.data.clues) this.data.clues = [];
      if (this.data.clues.some((c) => c.id === clue.id)) return false;
      this.data.clues.push(clue);
      return true;
    },

    /**
     * 동료 영입. NPC의 recruit 보너스를 *현재 RunState*에 적용 +
     * companionAppliedBonuses에 기록 (dismiss 시 정확히 역적용 위함).
     */
    recruitCompanion(npcId: string) {
      const r = this.data;
      if (r.companions.length >= 3) return false; // 최대 3명
      if (r.companions.includes(npcId)) return false;
      const data = useDataStore();
      const npc = data.npcs.get(npcId);
      if (!npc?.recruit) return false;
      const b = npc.recruit;

      // 1) 덱 슬롯 증가
      const deckSizeAdd = b.deckSizeBonus ?? 0;
      if (deckSizeAdd > 0) r.deckSize += deckSizeAdd;

      // 2) 카드 추가 — 인스턴스화해서 collection + deck에 (deckSize 여유 한도까지).
      const addedCardInstanceIds: string[] = [];
      for (const cid of b.grantedCardIds ?? []) {
        const card = data.cards.get(cid);
        if (!card) continue;
        const inst = instantiateCard(card);
        r.collection.push(inst);
        if (inst.instanceId) addedCardInstanceIds.push(inst.instanceId);
        // 자리 있으면 덱에도 자동 등록.
        if (r.deck.length < r.deckSize) r.deck.push(inst);
        if (!r.newCardEncounters.includes(card.id)) r.newCardEncounters.push(card.id);
      }

      // 3) 유물 추가
      const addedRelicIds: string[] = [];
      for (const rid of b.grantedRelicIds ?? []) {
        const relic = data.relics.get(rid);
        if (!relic) continue;
        r.relics.push(relic);
        addedRelicIds.push(rid);
        if (!r.newRelicEncounters.includes(rid)) r.newRelicEncounters.push(rid);
      }

      // 4) 컬러 보정
      const colorBoostsApplied: Record<string, number> = {};
      for (const [k, v] of Object.entries(b.colorBoosts ?? {})) {
        if (typeof v !== 'number') continue;
        (r.colors as Record<string, number>)[k] = ((r.colors as Record<string, number>)[k] ?? 0) + v;
        colorBoostsApplied[k] = v;
      }

      r.companions.push(npcId);
      if (!r.recruitedAt[npcId]) r.recruitedAt[npcId] = r.currentNodeId;
      r.companionAppliedBonuses[npcId] = {
        deckSizeAdd,
        addedCardInstanceIds,
        addedRelicIds,
        colorBoostsApplied: colorBoostsApplied as import('@/data/schemas').RunState['companionAppliedBonuses'][string]['colorBoostsApplied'],
      };
      return true;
    },

    /**
     * 동료 이탈 — 영입 시 적용된 *덱·카드·유물* 보너스는 역적용.
     * 사용자 사양: **컬러는 감소하지 않는다** — 영입으로 얻은 컬러는 그대로 누적 유지.
     */
    dismissCompanion(npcId: string) {
      const r = this.data;
      const idx = r.companions.indexOf(npcId);
      if (idx < 0) return;
      const applied = r.companionAppliedBonuses[npcId];

      if (applied) {
        // 1) 덱 슬롯 복원
        r.deckSize = Math.max(1, r.deckSize - applied.deckSizeAdd);

        // 2) 추가됐던 카드 인스턴스 제거 (collection + deck)
        const removeSet = new Set(applied.addedCardInstanceIds);
        r.collection = r.collection.filter((c) => !c.instanceId || !removeSet.has(c.instanceId));
        r.deck = r.deck.filter((c) => !c.instanceId || !removeSet.has(c.instanceId));

        // 3) 추가됐던 유물 제거 (각 id 한 점씩)
        for (const rid of applied.addedRelicIds) {
          const i = r.relics.findIndex((rel) => rel.id === rid);
          if (i >= 0) r.relics.splice(i, 1);
        }

        // 4) 컬러는 *역적용하지 않음*. 한 번 늘면 그대로.
      }

      r.companions.splice(idx, 1);
      delete r.companionAppliedBonuses[npcId];
      // recruitedAt는 유지 — *재만남* 시 같은 노드로 가야 다시 영입 가능.
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
      // 종료된 런의 저장 스냅샷은 더 이상 필요 없음.
      this.clearSavedRun();
    },

    /** 메인 메뉴로 돌아갈 때 호출 — 상태 비움. */
    reset() {
      this.data = structuredClone(EMPTY_RUN);
      this.active = false;
      this.clearSavedRun();
    },
  },
});
