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
  Card,
  Monster,
  NodeKind,
  RaceId,
  Rank,
  RosterEntry,
  RunState,
  Season,
  TimelineId,
} from '@/data/schemas';
import { instantiateCard } from '@/systems/deck';
import { createSeededRng, generateInitialSeed, rng, setRng } from '@/systems/rng';
import { getSkipTurnEveryN } from '@/systems/relic';
import { gridRelicCombatEnd } from '@/systems/grid-relic';
import { applyStartChaos, nodeHpLoss } from '@/systems/chaos';
import { XP_PER_LEVEL, canEnhance, needsAwakening } from '@/systems/enhance';
import { generateStage } from '@/systems/stage-gen';
import { startGridCombat, startGridBossCombat, commitRound as commitGridRoundEngine } from '@/systems/grid-combat';
import { applyCombatVictoryReward } from '@/systems/combat-rewards';
import { applyBossRewards, applyArcRewards } from '@/systems/boss-rewards';
import { rewardGold, rewardShards } from '@/systems/reward-feed';
import { companionRewardMul } from '@/systems/companion';
import { effectiveContent, effectiveKind, findRegion } from '@/systems/map';
import { useDataStore } from './data';
import { useUiStore } from './ui';
import { useMetaStore } from './meta';

/**
 * localStorage 키 — 활성 런 스냅샷. 사용자 요구에 따라 노드 입장마다 자동 저장.
 *
 * M9에서 v1 → v2 마이그레이션 (RunState에 장비 4필드 추가).
 *   - 새 저장은 v2 키.
 *   - 옛 v1 키는 read-fallback + 마이그레이션 후 제거.
 */
const SAVED_RUN_KEY_V1 = 'rdc-active-run-v1';
const SAVED_RUN_KEY = 'rdc-active-run-v2';

/**
 * 옛 세이브 마이그레이션 — 폐기된 characterId(ch-*) → raceId 매핑.
 * characters/ 폴더 제거 후, 옛 v2 세이브가 들고 있던 characterId를 종족으로 변환.
 */
const LEGACY_CHARACTER_TO_RACE: Record<string, string> = {
  'ch-hako': 'human',
  'ch-maro': 'human',
  'ch-iyeon': 'moth',
  'ch-kardi': 'phantom',
  'ch-niayur': 'arcana',
};

/**
 * Item 37-② Stage A — 동료 구조 마이그레이션 (구 companions → roster/activeSlots).
 *
 * 호출: loadActiveRun에서 EMPTY_RUN 스프레드 후. `filled`는 이미 roster/activeSlots 기본값을 가진다.
 *  - 구세이브(roster 미존재, companions 보유): companions → roster(전부 npc), 앞 3개 → activeSlots.
 *  - 신세이브(roster 존재): 형태만 정규화(activeSlots 길이 3 보장 + null 패딩).
 * companions 필드는 호환 위해 빈 배열로 남긴다(코드는 더 이상 읽지 않음).
 */
/**
 * XP·각성 마이그레이션 (2026-06-10) — 구세이브 카드 인스턴스를 새 강화 모델로 승격.
 *   - id가 '-plus'로 끝나는 인스턴스(옛 공방 강화판) → enhanceLevel 5 + awakened true (가치 보존·상향).
 *     id는 그대로 둔다(awakened의 효과 정의 = plus 정의이므로 무손실). 도감/풀 제외는 id 기준이라 무해.
 *   - 그 외 인스턴스 → enhanceLevel 0 / awakened false backfill (이미 값 있으면 보존).
 * collection·deck 양쪽 순회(같은 instanceId는 같은 객체 참조라 한쪽만 바꿔도 되지만, 분리 저장 대비 양쪽).
 */
function migratePlusCards(filled: RunState): void {
  const apply = (c: Card) => {
    if (c.id.endsWith('-plus')) {
      c.enhanceLevel ??= 5;
      c.awakened ??= true;
    } else {
      c.enhanceLevel ??= 0;
      c.awakened ??= false;
    }
  };
  for (const c of filled.collection ?? []) apply(c);
  for (const c of filled.deck ?? []) apply(c);
}

function migrateRoster(filled: RunState, parsed: Partial<RunState>): void {
  const hasNewRoster = Array.isArray(parsed.roster);
  if (!hasNewRoster) {
    // 구세이브 → 변환. companions가 비었으면 빈 로스터.
    const companions = Array.isArray(parsed.companions) ? parsed.companions : [];
    filled.roster = companions.map((id) => ({ id, src: 'npc' as const }));
    filled.activeSlots = [0, 1, 2].map((i) =>
      i < filled.roster.length ? { id: filled.roster[i].id, src: 'npc' as const } : null,
    );
  } else {
    // 신세이브 — roster는 이미 spread로 들어옴. activeSlots 길이/패딩 정규화.
    const slots = Array.isArray(parsed.activeSlots) ? parsed.activeSlots : [];
    filled.activeSlots = [0, 1, 2].map((i) => slots[i] ?? null);
  }
  // companions는 더 이상 권위 소스가 아니다 — 빈 배열로 정리(직렬화 호환만 유지).
  filled.companions = [];
}

const DECK_SLOT_SIZE = 10;
/** 100턴마다 하루 경과 — 비-마을 노드 cleared 초기화 + 권역 풀에서 content 재추첨.
 *  사용자 결정 (2026-05-19): 한 런=300턴=3일, 권역 평균 ~22노드(전체 ~200노드)에 맞춘 사양.
 *  지도 모양은 유지(노드 kind 고정), content만 권역 풀에서 매일 새로 추첨.
 */
const TURNS_PER_DAY = 100;

const EMPTY_RUN: RunState = {
  timelineId: '',
  raceId: '',
  season: 'spring',
  startedAt: 0,
  rngSeed: 0,
  rngState: 0,
  currentNodeId: '',
  visitedNodes: [],
  nodeStates: {},
  remainingTime: 0,
  currentDay: 1,
  // 성장 (XP·레벨업·카드 강화).
  xp: 0,
  level: 1,
  pendingEnhancePicks: 0,
  possessed: 0,
  possessions: {},
  feralHeavy: 0,
  blessingCombats: 0,
  bellMarked: 0,
  dragonCombats: 0,
  dragonBoost: 0,
  nodeKindOverrides: {},
  nodeContentOverrides: {},
  shopInventories: {},
  // 카오스 shop-limit(닫힌 시장) — 하루 단위 상점 입장 카운터. 비활성 카오스에선 무의미.
  shopEntryDay: 1,
  shopEntriesToday: 0,
  shopVisitedNodes: [],
  forgeOffers: {},
  dayPassedSeq: 0,
  deckSize: DECK_SLOT_SIZE,
  deck: [],
  collection: [],
  relics: [],
  hp: 0,
  maxHp: 0,
  colorHpBonus: 0,
  mp: 0,
  maxMp: 0,
  gold: 0,
  timeShards: 0,
  // 목숨 (Item 28) — 기본 2/2. 구세이브는 loadActiveRun의 {...EMPTY_RUN, ...parsed}로 자동 2/2.
  lives: 2,
  maxLives: 2,
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
  roster: [],
  activeSlots: [null, null, null],
  recruitedAt: {},
  companionAppliedBonuses: {},
  hyperionProgress: {},
  npcAffinity: {},
  affinityTalkDay: {},
  affinityRewardsClaimed: {},
  missionsCleared: [],
  bossesCleared: [],
  arcsCleared: [],
  newCardEncounters: [],
  newRelicEncounters: [],
  newNpcEncounters: [],
  // 카오스 도전-점수 시스템 (v3) — 복원 시 EMPTY_RUN 스프레드로 []가 보장됨.
  activeChaos: [],
  // 카오스 post-apocalypse 맵 변환 1회 적용 가드 — 신규 필드(구세이브 자동 backfill false).
  postApocalypseApplied: false,
  // 격자 전투 — 전투형 유물 로드아웃 + 이동 강화. 구세이브 자동 backfill([]/0).
  combatLoadout: [],
  moveUpgrades: 0,
  ended: false,
  metaAbsorbed: false,
};

/** 카드를 버릴(제거할) 때 등급만큼 환급되는 시간의 조각 — 분해 보상. shop 제거 슬롯도 공유. */
export const CARD_SALVAGE_SHARDS: Record<Rank, number> = {
  basic: 1,
  common: 2,
  rare: 4,
  legendary: 7,
};

export const useRunStore = defineStore('run', {
  state: (): { active: boolean; data: RunState } => ({
    active: false,
    data: structuredClone(EMPTY_RUN),
  }),

  getters: {
    isCombatActive: (state) =>
      state.active && (state.data.combat !== undefined || state.data.gridCombat !== undefined),
    isEnded: (state) => state.data.ended,
    /** 다음 덱 확장 임계까지 남은 시간 (단순 추정 — 실제는 timeline에서 가져옴). */
    progressRatio: (state) =>
      state.data.remainingTime > 0 ? 1 - state.data.remainingTime / 100 : 1,
  },

  actions: {
    /**
     * 새 런 시작 — 연표·종족·계절 컨텍스트 + 결정론 시드 주입.
     *
     * 카오스(Phase A): `activeChaos`를 인자로 받아 RunState에 확정한 뒤, 시드/HP 셋업이
     * 끝난 시점에 `applyStartChaos`를 1회 호출한다. start-hp는 여기서 즉시 반영된다.
     *
     * 주의(start-inject-card 타이밍): 현 RaceSelectView 플로우는 startRun *이후*
     * 덱(collection/deck)을 재구성한다. 따라서 실제 플레이의 카드-주입 보존은 Phase C에서
     * 카오스 토글 UI와 함께 *덱 셋업 이후* applyStartChaos를 재정렬해 마무리한다.
     * Phase A 검증(playwright)은 startRun을 직접 호출하므로 빈 덱에 주입이 그대로 보인다.
     */
    startRun(params: {
      timelineId: TimelineId;
      raceId: RaceId;
      season: Season;
      maxHp: number;
      maxMp: number;
      startNodeId: string;
      timeLimit: number;
      /** 이 런에서 활성화할 카오스 (강도 포함, 선택). 미지정이면 빈 배열(점수 0). */
      activeChaos?: { id: string; intensity: number }[];
    }) {
      const fresh = structuredClone(EMPTY_RUN);
      fresh.timelineId = params.timelineId;
      fresh.raceId = params.raceId;
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
      // 카오스 확정 — 시작형 적용·상시형 조회·점수 산정의 원천.
      fresh.activeChaos = params.activeChaos ? [...params.activeChaos] : [];
      // 친밀도 working mirror 시드 (Item 37-② Stage C, 1B) — 권위 소스인 영속 메타값을 비춘다.
      //   조건 DSL(affinity:)·UI 표시가 cross-run 누적값을 반영하도록.
      fresh.npcAffinity = { ...(useMetaStore().npcAffinity ?? {}) };
      this.data = fresh;
      this.active = true;
      this.bindRng();
      // 시작형 카오스 1회 적용 (start-hp 등). bindRng 후 — instantiateCard가 결정론 rng를 쓰도록.
      applyStartChaos(this.data);
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
        const parsed = JSON.parse(raw) as Partial<RunState> & { characterId?: string };
        // EMPTY_RUN spread 후 parsed로 override — 향후 신규 필드도 EMPTY_RUN에만 추가하면 자동 보호.
        // (Round2 W2: 명시적 ?? 라인 제거 — redundant + future v3 추가 시 "한 줄 깜빡" 회귀 위험 차단.)
        const filled: RunState = {
          ...structuredClone(EMPTY_RUN),
          ...parsed,
        };
        // characters/ 폐기 마이그레이션: 옛 세이브의 characterId(ch-*)를 raceId로 변환.
        // 매핑 실패 시 raceId는 EMPTY_RUN 기본값('')으로 — race 시드 조회는 안전하게 폴백.
        if (!parsed.raceId && parsed.characterId) {
          filled.raceId = LEGACY_CHARACTER_TO_RACE[parsed.characterId] ?? '';
        }
        // Item 37-② Stage A 마이그레이션 — 구 `companions: NpcId[]` → `roster` + `activeSlots`.
        //   - roster      = companions 전체(모두 npc src).
        //   - activeSlots = 앞 3개(순서 보존), 모자라면 null로 채워 길이 3 보장.
        //   - 신세이브(roster 존재)면 그대로 두고 길이/형태만 정규화.
        // 1회 보너스(덱슬롯/유물/컬러) 제거 반영: companionAppliedBonuses는 이제 읽지 않으므로
        //   역적용 없이 버린다(컬러·카드·유물은 그동안 받은 그대로 런에 남는다 — 손해 없음).
        migrateRoster(filled, parsed);
        // XP·각성 마이그레이션 — 구세이브 -plus 인스턴스를 각성됨(+5강)으로 승격 + 신필드 backfill.
        migratePlusCards(filled);
        // 격자 전투 전환(D1/E1) — 진행 중이던 *구형 1v1 전투*와 미완 격자 전투는 폐기한다.
        //   전투는 휘발 상태이므로 복원하지 않고, 플레이어는 currentNodeId(맵)에서 재개한다.
        //   (구 combat은 새 GridCombatView와 호환되지 않아 그대로 두면 빈 화면/크래시 위험.)
        filled.combat = undefined;
        filled.gridCombat = undefined;
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

      // skip-turn-every 유물 효과 (r-postman-mail) — N번 방문마다 *시간 카운트 생략*.
      let timeCounted = true;
      const skipN = getSkipTurnEveryN(r);
      if (skipN > 0) {
        r.postmanStepCount = (r.postmanStepCount ?? 0) + 1;
        if (r.postmanStepCount >= skipN) {
          r.postmanStepCount = 0;
          timeCounted = false;
        }
      }

      if (timeCounted) {
        r.visitedNodes.push(nodeId);
        r.remainingTime = Math.max(0, r.remainingTime - 1);
        // 카오스 attrition(스며드는 피로) — 노드 진입마다 HP -N. 시간 카운트된 이동에만.
        // 최소 1로 클램프(여기서 즉사 X — 시간만료/전투처럼 별도 종료 경로에 맡김).
        const loss = nodeHpLoss();
        if (loss > 0) r.hp = Math.max(1, r.hp - loss);
      }

      // 노드 상태 마킹 (시간 카운트와 무관)
      if (!r.nodeStates[nodeId]) {
        r.nodeStates[nodeId] = { visited: true };
      } else {
        r.nodeStates[nodeId].visited = true;
      }
      // 덱 슬롯 확장은 사용자 사양 변경으로 폐기 — deckSize 고정 (10)
      void _unusedThresholds;

      // 30턴마다 하루 경과 — 시간 카운트된 경우에만 트리거.
      if (timeCounted && r.visitedNodes.length > 0 && r.visitedNodes.length % TURNS_PER_DAY === 0) {
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
      // 하루 경과마다 덱 슬롯 10 확장 — 카드를 새로 얻으면 자동 세팅될 여지가 생긴다.
      r.deckSize += 10;
      // 혼란(possession)은 하루가 지나면 풀린다 — 잔존 페널티의 안전 밸브.
      if ((r.possessed ?? 0) > 0) {
        r.possessed = 0;
        useUiStore().toast('success', '하루가 지나며 혼란이 풀렸다.');
      }

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
          st.activityDone = false;  // 활동 재발동 가능.
          st.restDone = false;      // 휴식 재사용 가능.
          st.gatherDone = false;    // 채집 재개방.
          st.gatherCount = 0;       // (구) 채집 효율 — 폐기, 호환용 정리.
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

    // ============================================================================
    // 성장 (XP·레벨업·카드 강화, 2026-06-10)
    // ----------------------------------------------------------------------------

    /**
     * 경험치 적립 + 레벨업 처리. 반환: 이번에 오른 레벨 수(=발급된 강화권 수).
     * 누적 xp가 XP_PER_LEVEL(3) 이상이면 그만큼 레벨업하고 pendingEnhancePicks를 늘린다.
     */
    gainXp(amount: number): number {
      if (amount <= 0) return 0;
      const r = this.data;
      r.xp = (r.xp ?? 0) + amount;
      let levels = 0;
      while ((r.xp ?? 0) >= XP_PER_LEVEL) {
        r.xp = (r.xp ?? 0) - XP_PER_LEVEL;
        r.level = (r.level ?? 1) + 1;
        levels += 1;
      }
      if (levels > 0) {
        r.pendingEnhancePicks = (r.pendingEnhancePicks ?? 0) + levels;
      }
      return levels;
    },

    /**
     * 강화권 1장을 써서 컬렉션의 instanceId 카드를 +1강. 성공 시 true.
     * 가드: 강화권 보유 + 카드 존재 + canEnhance(5강 미만 또는 각성&&10강 미만).
     * 5강 도달 미각성 카드는 각성(공방) 필요 → 여기선 거부.
     */
    enhanceCard(instanceId: string): boolean {
      const r = this.data;
      if ((r.pendingEnhancePicks ?? 0) <= 0) return false;
      const card = r.collection.find((c) => c.instanceId === instanceId);
      if (!card || !canEnhance(card)) return false;
      card.enhanceLevel = (card.enhanceLevel ?? 0) + 1;
      r.pendingEnhancePicks = (r.pendingEnhancePicks ?? 0) - 1;
      // 덱에 같은 인스턴스가 있으면 동기화(분리 저장 대비 — 보통 같은 객체 참조라 무해).
      const inDeck = r.deck.find((c) => c.instanceId === instanceId);
      if (inDeck && inDeck !== card) inDeck.enhanceLevel = card.enhanceLevel;
      return true;
    },

    /**
     * 각성 실행(공방) — 5강 도달 카드를 plus 정의로 진화 + awakened=true. 성공 시 true.
     * 자원 소비/검증은 workshop.ts가 사전 처리하고, 여기선 *상태 전이*만 한다.
     * plus 정의(plusDef)가 주어지면 그 정의로 교체(instanceId·enhanceLevel·awakened·bonus·possession 보존),
     * 없으면 awakened=true만 부여(수치 점프 폴백 — combat 스케일이 처리).
     */
    awakenCard(instanceId: string, plusDef?: Card): boolean {
      const r = this.data;
      const idx = r.collection.findIndex((c) => c.instanceId === instanceId);
      if (idx < 0) return false;
      const cur = r.collection[idx];
      if (!needsAwakening(cur)) return false;
      const next: Card = plusDef
        ? {
            ...plusDef,
            instanceId: cur.instanceId,
            enhanceLevel: cur.enhanceLevel ?? 5,
            awakened: true,
            bonusDamage: cur.bonusDamage,
            bonusBlock: cur.bonusBlock,
            possession: cur.possession,
          }
        : { ...cur, awakened: true };
      r.collection.splice(idx, 1, next);
      const dIdx = r.deck.findIndex((c) => c.instanceId === instanceId);
      if (dIdx >= 0) r.deck.splice(dIdx, 1, next);
      if (plusDef && !r.newCardEncounters.includes(plusDef.id)) {
        r.newCardEncounters.push(plusDef.id);
      }
      return true;
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

    // ============================================================================
    // 동료 / 로스터 / 활성 슬롯 (Item 37-② Stage A)
    // ----------------------------------------------------------------------------
    // 영입 = roster 추가(런 한정, 중복 스킵). 1회 보너스(덱슬롯/카드/유물/컬러)는 *제거*됨.
    // passive 효과는 activeSlots에 편성된 동료에 한해 while-equipped로만 작동(companion.ts).
    // 빈 활성 슬롯이 있으면 영입 시 자동으로 한 칸에 편성(편의).
    // ============================================================================

    /** roster에 동료가 이미 있는가. */
    inRoster(id: string): boolean {
      return (this.data.roster ?? []).some((e) => e.id === id);
    },

    /** activeSlots에 편성돼 있는가(어느 칸이든). */
    isActive(id: string): boolean {
      return (this.data.activeSlots ?? []).some((e) => e?.id === id);
    },

    /** 비어 있는 활성 슬롯 인덱스(없으면 -1). */
    firstEmptySlot(): number {
      const slots = this.data.activeSlots ?? [];
      for (let i = 0; i < 3; i++) if (!slots[i]) return i;
      return -1;
    },

    /**
     * 동료 영입 — roster에 추가(중복 스킵). 빈 활성 슬롯이 있으면 자동 편성.
     * src 기본 'npc'(Stage B에서 monster 추가). companion 정의가 있는 NPC만 허용.
     */
    recruitCompanion(npcId: string, src: 'npc' | 'monster' = 'npc') {
      const r = this.data;
      if (this.inRoster(npcId)) return false;
      const data = useDataStore();
      // npc만 정의 검증(monster는 Stage B). companion 또는 legacy recruit 둘 중 하나면 허용.
      if (src === 'npc') {
        const npc = data.npcs.get(npcId);
        if (!npc?.companion && !npc?.recruit) return false;
      }
      if (!r.roster) r.roster = [];
      r.roster.push({ id: npcId, src });
      if (!r.recruitedAt[npcId]) r.recruitedAt[npcId] = r.currentNodeId;
      // 빈 활성 슬롯에 자동 편성(편의 — 초반 3칸 확보).
      const empty = this.firstEmptySlot();
      if (empty >= 0) {
        if (!r.activeSlots) r.activeSlots = [null, null, null];
        r.activeSlots[empty] = { id: npcId, src };
      }
      return true;
    },

    /**
     * 몬스터/아크 동료 자동 영입 (Item 37-② Stage B) — roster에 {id, src:'monster'} 추가.
     * recruitCompanion(npc)와 대칭. 중복이면 false(스킵). 빈 활성 슬롯 있으면 자동 편성.
     *
     * 호출: CombatView/BossView onVictory에서 처치한 적이 recruitable(또는 arc companion 정의)일 때.
     * companion 정의 검증은 호출부(onVictory)가 책임진다(여기선 id만 받아 단순 추가 — 토스트 분기 위해
     * 반환값으로 중복 여부를 알린다). roster 엔트리는 {id:string, src:'monster'} 직렬화 가능 단순 객체라
     * 세이브 round-trip 안전.
     */
    recruitMonster(id: string): boolean {
      const r = this.data;
      if (this.inRoster(id)) return false;
      if (!r.roster) r.roster = [];
      r.roster.push({ id, src: 'monster' });
      if (!r.recruitedAt[id]) r.recruitedAt[id] = r.currentNodeId;
      // 빈 활성 슬롯에 자동 편성(편의 — 초반 3칸 확보).
      const empty = this.firstEmptySlot();
      if (empty >= 0) {
        if (!r.activeSlots) r.activeSlots = [null, null, null];
        r.activeSlots[empty] = { id, src: 'monster' };
      }
      return true;
    },

    /**
     * 동료 이탈 — roster에서 제거 + 활성 슬롯에서도 해제.
     * 1회 보너스 역적용 없음(이미 제거된 시스템). recruitedAt는 유지(재만남 가능).
     */
    dismissCompanion(npcId: string) {
      const r = this.data;
      r.roster = (r.roster ?? []).filter((e) => e.id !== npcId);
      r.activeSlots = (r.activeSlots ?? [null, null, null]).map((e) =>
        e?.id === npcId ? null : e,
      );
      // recruitedAt는 유지 — *재만남* 시 같은 노드로 가야 다시 영입 가능.
    },

    /**
     * 활성 슬롯 편성 — slot(0..2)에 roster의 동료를 둔다(null이면 비움).
     * 같은 동료가 다른 칸에 있으면 그 칸을 비워 *중복 편성*을 막는다(한 동료 = 한 칸).
     */
    setActiveSlot(slot: number, entry: RosterEntry | null) {
      const r = this.data;
      if (slot < 0 || slot > 2) return;
      if (!r.activeSlots) r.activeSlots = [null, null, null];
      // 중복 방지 — 같은 id가 다른 칸에 있으면 제거.
      if (entry) {
        for (let i = 0; i < r.activeSlots.length; i++) {
          if (i !== slot && r.activeSlots[i]?.id === entry.id) r.activeSlots[i] = null;
        }
      }
      r.activeSlots[slot] = entry;
    },

    /** 동료를 활성 슬롯에서 내린다(이탈 아님 — roster엔 남음). */
    unsetActiveByPet(id: string) {
      const r = this.data;
      r.activeSlots = (r.activeSlots ?? [null, null, null]).map((e) =>
        e?.id === id ? null : e,
      );
    },

    /**
     * 동료를 빈 활성 슬롯에 편성(없으면 false). roster에 있는 동료만.
     * 이미 편성돼 있으면 그대로 true.
     */
    equipCompanion(id: string): boolean {
      const r = this.data;
      const entry = (r.roster ?? []).find((e) => e.id === id);
      if (!entry) return false;
      if (this.isActive(id)) return true;
      const empty = this.firstEmptySlot();
      if (empty < 0) return false;
      this.setActiveSlot(empty, { id: entry.id, src: entry.src });
      return true;
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
      // 덱 슬롯에 여유가 있으면 자동으로 덱에 세팅.
      if (this.data.deck.length < this.data.deckSize) {
        this.data.deck.push(instance);
      }
      if (!this.data.newCardEncounters.includes(card.id)) {
        this.data.newCardEncounters.push(card.id);
      }
    },

    /**
     * 카드 컬렉션에서 *인스턴스 1장* 영구 제거 — 덱 편집의 삭제 액션.
     * 그 인스턴스가 현재 덱에 들어 있으면 덱에서도 함께 제거(덱-컬렉션 정합 유지).
     * 반환: 실제로 제거됐으면 true.
     *
     * salvage: true(기본)면 등급만큼 시간의 조각 환급(분해 보상). 이벤트 lose_card처럼
     *   카드 자체가 *댓가*인 경로는 salvage=false로 호출해 환급으로 비용이 상쇄되지 않게 한다.
     */
    removeCardFromCollection(instanceId: string, salvage = true): boolean {
      if (!instanceId) return false;
      const r = this.data;
      const removed = r.collection.find((c) => c.instanceId === instanceId);
      if (!removed) return false;
      // 빙의 카드(변신 전)는 어디서도 제외 불가. 저주 카드는 *상점에서만* 제거(이 경로 차단).
      if (r.possessions?.[instanceId] || removed.curse) {
        useUiStore().toast('warning', removed.curse ? '저주받은 카드 — 상점에서만 떼어낼 수 있다.' : '이 카드는 떼어낼 수 없다 — 끝까지 가야 풀린다.');
        return false;
      }
      r.collection = r.collection.filter((c) => c.instanceId !== instanceId);
      r.deck = r.deck.filter((c) => c.instanceId !== instanceId);
      // 분해 보상 — 카드를 버리면 등급만큼 시간의 조각 환급(salvage=true일 때만).
      if (salvage) r.timeShards += CARD_SALVAGE_SHARDS[removed.rank] ?? 0;
      return true;
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

    // === 목숨 / 도망 (Item 28) ===

    /**
     * 목숨 1 소모 (마리오식). 전투 패배(HP 0) 시 UI 패배 핸들러가 호출.
     * 반환 true = 아직 목숨 남음 → 도망 경로(flee). false = 0 소진 → 호출자가 endRun.
     * 구세이브 호환: lives 미설정이면 maxLives(또는 2)로 폴백 후 차감.
     */
    loseLife(): boolean {
      const r = this.data;
      if (r.lives == null) r.lives = r.maxLives ?? 2;
      r.lives -= 1;
      return r.lives > 0;
    },

    /**
     * 목숨 1 회복 — 희귀 포션 전용(맵). 상한(maxLives)까지 클램프.
     * 반환: 실제로 늘었으면 true(이미 가득이면 false).
     */
    gainLife(): boolean {
      const r = this.data;
      const max = r.maxLives ?? 2;
      const cur = r.lives ?? max;
      const next = Math.min(cur + 1, max);
      r.lives = next;
      return next > cur;
    },

    /**
     * 최대 목숨 증가 — 유물/종족 강화. 올릴 때 현재 목숨도 같이 증가(빈 자리 채우는 게 아니라 가득 유지).
     * delta 음수는 무시(안전). 구세이브 호환 폴백 포함.
     */
    raiseMaxLives(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0) return;
      const r = this.data;
      const max = r.maxLives ?? 2;
      const cur = r.lives ?? max;
      r.maxLives = max + delta;
      r.lives = cur + delta;
    },

    /**
     * 전투 패배 후 도망 — 그 노드를 *미클리어로 유지*(재도전 가능) + HP를 maxHp의 30%로 회복
     * (현재 HP가 더 높으면 유지). 변신·변신 스택은 그대로 둔다(아무것도 안 함).
     * combat 상태는 호출 전 UI가 clearCombat으로 정리한다.
     */
    flee(nodeId: string) {
      const r = this.data;
      // 노드 미클리어 유지 — combatCleared/Stealthed를 명시적으로 false로(재도전 보장).
      const st = r.nodeStates[nodeId];
      if (st) {
        st.combatCleared = false;
        st.combatStealthed = false;
      }
      // HP를 maxHp의 30%로 회복(올림). 이미 더 높으면 유지.
      const floor = Math.max(1, Math.ceil(r.maxHp * 0.3));
      if (r.hp < floor) r.hp = floor;
    },

    // ============================================================================
    // 격자 전투 lifecycle (신규 엔진 — 구 startCombat/clearCombat과 *병존*)
    // ----------------------------------------------------------------------------
    // enterGridCombat : 노드 → stage 생성 + 적 정의 해석 + startGridCombat → run.gridCombat.
    // commitGridRound : 한 라운드 해소 + 승패 신호 반영(보상/종료는 endGridCombat이 담당).
    // endGridCombat   : 승리=권역 보상+클리어 마킹 / 패배=목숨·도망·종료. run.gridCombat 정리.
    // 구 combat 경로는 절대 건드리지 않는다.
    // ============================================================================

    /**
     * 격자 전투 진입 — 현재(또는 지정) 노드의 적 그룹을 격자 무대로 변환해 시작.
     * stage-gen이 결정론(rngSeed + nodeId)으로 무대를 만들고, enemyGroupId를 monster 정의로 해석한다.
     * 증원 placeholder(enemyId='')는 같은 enemyGroupId로 채운다(슬라이스 — 권역 풀 치환은 후속).
     * 반환: 성공 시 true(run.gridCombat set).
     */
    enterGridCombat(nodeId?: string): boolean {
      const r = this.data;
      const data = useDataStore();
      const id = nodeId ?? r.currentNodeId;
      const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
      const node = map?.nodes.find((n) => n.id === id);

      // 적 그룹 해석 — 노드 콘텐츠(권역 재추첨 반영). 폴백: shadow-pup.
      const content = node ? effectiveContent(node, r) : undefined;
      const enemyId = content?.enemyGroupId ?? 'shadow-pup';
      const baseDef = data.monsters.get(enemyId);
      if (!baseDef) console.warn('[grid] 알 수 없는 enemyGroupId — 폴백 그림자 사용:', enemyId);

      // tier/region — 권역 깊이로 무대 파라미터.
      const region = map && node ? findRegion(map, node.region) : undefined;
      const tier = region?.tier ?? 1;
      const kind = node ? effectiveKind(node, r) : 'combat';

      // 결정론 시드 — 런 시드 + 노드 id(같은 노드 재진입 시 같은 무대).
      const stage = generateStage(`${r.rngSeed}:${id}`, node?.region ?? 'unknown', tier);

      // 적 정의 배열 — enemyStarts 길이만큼 baseDef 복제(슬라이스: 단일 종 그룹).
      const enemyDefs: Monster[] = [];
      const fallback: Monster = baseDef ?? {
        id: 'fallback',
        name: '알 수 없는 그림자',
        hp: 14,
        attack: 5,
        defense: 0,
        intents: [{ encoded: 'attack:5' }],
        drop: { gold: 3, timeShards: 1 },
      };
      for (let i = 0; i < stage.enemyStarts.length; i++) enemyDefs.push(fallback);

      // 증원 placeholder enemyId('')를 실제 적 id로 치환(슬라이스: 같은 그룹).
      if (stage.spawns) {
        for (const sp of stage.spawns) {
          if (!sp.enemyId) sp.enemyId = fallback.id;
        }
      }

      void kind; // 엘리트 차등(적 강화·엘리트 풀 분리)은 후속 — 슬라이스는 일반 전투와 동일 무대.

      this.data.gridCombat = startGridCombat(r, stage, enemyDefs);
      return true;
    },

    /**
     * 보스 격자 전투 진입(#4) — 보스 노드의 boss 정의를 격자 무대로 변환해 시작.
     *  - 보스 id 해석: 노드 contentRef.boss → effectiveContent.bossId → 폴백 연표 보스.
     *  - 무대: 일반보다 *크게*(보스 전용). 보스는 enemyStarts[0]에 1마리 배치(엔진이 처리).
     *  - 페이즈/거동/소환은 boss 정의(phases[].gridBehavior/spawnMinions)에서 엔진이 읽는다.
     * 반환: 성공 시 true(run.gridCombat set, isBoss=true).
     */
    enterGridBossCombat(nodeId?: string): boolean {
      const r = this.data;
      const data = useDataStore();
      const id = nodeId ?? r.currentNodeId;
      const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
      const node = map?.nodes.find((n) => n.id === id);

      // 보스 id — 노드 contentRef.boss(권역 재추첨 반영) → 연표 종말 보스 폴백.
      const content = node ? effectiveContent(node, r) : undefined;
      const bossId = content?.bossId
        ?? node?.contentRef?.bossId
        ?? data.timelines.get(r.timelineId)?.bossId;
      const boss = bossId ? data.bosses.get(bossId) : undefined;
      if (!boss) {
        console.warn('[grid-boss] 보스 정의를 찾을 수 없음:', bossId);
        return false;
      }

      // 보스 무대 — 일반보다 큰 격자(tier 4 파라미터 고정 + 보스는 적 1마리라 여유). 결정론 시드.
      const region = map && node ? findRegion(map, node.region) : undefined;
      const tier = Math.max(3, region?.tier ?? 4); // 보스 무대는 최소 tier3 크기(7x7~8x8).
      const stage = generateStage(`${r.rngSeed}:boss:${id}`, node?.region ?? 'boss', tier);

      this.data.gridCombat = startGridBossCombat(r, stage, boss);
      return true;
    },

    /**
     * 격자 전투 한 라운드 해소 — 엔진 commitRound 호출.
     * outcome(win/lose)이 set되면 그 신호를 *반환만* 한다(보상/종료 전이는 호출자가 endGridCombat으로).
     * 반환: 'win' | 'lose' | undefined(전투 계속).
     */
    commitGridRound(): 'win' | 'lose' | undefined {
      const gc = this.data.gridCombat;
      if (!gc) return undefined;
      commitGridRoundEngine(gc);
      return gc.outcome;
    },

    /**
     * 격자 전투 종료 처리.
     *  - 'win'  : 전투 HP를 런 HP로 라이트백 + 권역 보상(applyCombatVictoryReward) + 클리어 마킹
     *             + on-combat-end 유물. run.gridCombat 정리.
     *  - 'lose' : 전투 HP 라이트백(0 가능) + 목숨 분기(loseLife). 남으면 도망(flee), 0이면 endRun.
     *             run.gridCombat 정리.
     * 반환(lose): true=목숨 남아 도망(맵 복귀) / false=런 종료(패배 화면).
     */
    endGridCombat(result: 'win' | 'lose'): boolean {
      const r = this.data;
      const gc = r.gridCombat;
      const nodeId = r.currentNodeId;
      const wasBoss = gc?.isBoss === true;
      const bossKind = gc?.bossKind;
      const bossId = gc?.bossId;

      // 전투 HP를 런 HP로 라이트백(구 clearCombat 패턴).
      if (gc) {
        r.hp = Math.max(0, Math.min(r.maxHp, gc.player.hp));
      }

      // === 보스 승리(#4) — boss-rewards 경로로 분기(일반 권역 보상 아님). ===
      if (result === 'win' && wasBoss && bossId) {
        const boss = useDataStore().bosses.get(bossId);
        r.gridCombat = undefined;
        if (!boss) return true; // 정의 유실 — 안전 종료(맵 복귀).
        if (bossKind === 'arc') {
          // arc 승리 — 맵 복귀 + 전용 특전 자동 드롭 + 클리어 마킹. 런 지속.
          applyArcRewards(boss);
          if (!r.arcsCleared) r.arcsCleared = [];
          if (!r.arcsCleared.includes(boss.id)) r.arcsCleared.push(boss.id);
          // 아크 동료화 — companion 정의가 있으면 roster 추가(중복 스킵).
          if (boss.companion) this.recruitMonster(boss.id);
          this.markCombatCleared(nodeId);
          return true; // 맵 복귀(호출자 GridCombatView가 처리).
        }
        // 일반(연표 종말) 보스 승리 — 메타 보상 + 런 종료.
        applyBossRewards(boss);
        if (!r.bossesCleared.includes(boss.id)) r.bossesCleared.push(boss.id);
        this.endRun('boss-cleared');
        return false; // 런 종료(요약 화면으로).
      }

      if (result === 'win') {
        // 적 드롭(골드·시간조각) 크레딧 — 구 applyMonsterDrop(combat.ts) 패턴 이식.
        //   격자는 다중 적이므로 *처치된 적 전체 drop을 합산*(승리=전멸). 카드 드롭은 슬라이스 미이식.
        //   첫 클리어만 인정 — combatCleared 가드(applyCombatVictoryReward와 동일 의미).
        if (gc && !r.nodeStates[nodeId]?.combatCleared) {
          let gold = 0;
          let shards = 0;
          for (const e of gc.enemies) {
            gold += e.drop?.gold ?? 0;
            shards += e.drop?.timeShards ?? 0;
          }
          gold = Math.round(gold * companionRewardMul('gold'));
          shards = Math.round(shards * companionRewardMul('shards'));
          if (gold > 0) { r.gold += gold; rewardGold(gold); }
          if (shards > 0) { r.timeShards += shards; rewardShards(shards); }
        }
        // 권역 보상 — *클리어 마킹 전* 동기 호출(첫 클리어 인정).
        applyCombatVictoryReward(nodeId);
        // on-combat-end 유물(combat-end-heal·bonus-gold 등) — 로드아웃 규칙 준수 격자 경로.
        if (gc) { try { gridRelicCombatEnd(gc); } catch { /* 무해 */ } }
        this.markCombatCleared(nodeId);
        r.gridCombat = undefined;
        return true;
      }

      // 패배 — 목숨 분기.
      r.gridCombat = undefined;
      if (this.loseLife()) {
        this.flee(nodeId);
        return true; // 도망(맵 복귀).
      }
      this.endRun('hp-zero');
      return false; // 런 종료.
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
