/**
 * Pinia 스토어 — 영구 메타 진행 (localStorage 동기화).
 *
 * 5게이지: 히페리온 ①② + 해석 ①② + 종합.
 * 각 게이지가 % 임계마다 해금 노드를 발급한다.
 */

import { defineStore } from 'pinia';
import {
  EMPTY_META_GAUGE,
  MAX_NPC_AFFINITY,
  META_SAVE_VERSION,
  RUN_HISTORY_LIMIT,
  type CodexEntry,
  type MetaProgress,
  type MetaResource,
  type MetaUnlock,
  type RunSummary,
  type UnlockKey,
} from '@/data/schemas';

const META_STORAGE_KEY = 'rdc-meta-v1';

function createEmptyMeta(): MetaProgress {
  return {
    gauges: {
      hyperion1: { ...EMPTY_META_GAUGE },
      hyperion2: { ...EMPTY_META_GAUGE },
      insight1: { ...EMPTY_META_GAUGE },
      insight2: { ...EMPTY_META_GAUGE },
      composite: { ...EMPTY_META_GAUGE, max: 400 },
    },
    unlockedKeys: [],
    // 시작은 인간만. 나머지 종족은 히페리온 투자로 개방.
    unlockedRaceIds: ['human'],
    unlockedTimelineIds: [],
    unlockedCardIds: [],
    unlockedRelicIds: [],
    purchasedUnlocks: [],
    codex: [],
    soulResource: 0,
    procInputs: {},
    totalRuns: 0,
    totalBossClears: 0,
    // 카오스 도전-점수 시스템 (v3).
    unlockedChaosIds: [],
    chaosTierRevealed: 1,
    bestChaosScore: {},
    // NPC 친밀도 영속 (v4, Item 37-② Stage C 1B).
    npcAffinity: {},
    // 런 기록 (v5).
    runHistory: [],
    saveVersion: META_SAVE_VERSION,
  };
}

/** characters/ 폐기 마이그레이션 — 옛 ch-* 캐릭터 해금 id → 종족 id. */
const LEGACY_CHARACTER_TO_RACE: Record<string, string> = {
  'ch-hako': 'human',
  'ch-maro': 'human',
  'ch-iyeon': 'moth',
  'ch-kardi': 'phantom',
  'ch-niayur': 'arcana',
};

function loadMeta(): MetaProgress {
  try {
    const raw = localStorage.getItem(META_STORAGE_KEY);
    if (!raw) return createEmptyMeta();
    const parsed = JSON.parse(raw) as MetaProgress & { unlockedCharacterIds?: string[] };
    // 안전성: 누락된 게이지 보정
    if (!parsed.gauges?.composite) {
      return createEmptyMeta();
    }
    // 옛 meta는 unlockedRaceIds가 없고 unlockedCharacterIds만 있을 수 있음 → 변환.
    if (!parsed.unlockedRaceIds) {
      const legacy = parsed.unlockedCharacterIds ?? [];
      const races = new Set<string>();
      for (const cid of legacy) {
        const mapped = LEGACY_CHARACTER_TO_RACE[cid];
        if (mapped) races.add(mapped);
        else races.add(cid); // 알 수 없는 id는 그대로 (이미 race id일 수 있음)
      }
      parsed.unlockedRaceIds = Array.from(races);
    }
    delete parsed.unlockedCharacterIds;
    // 신규 optional 필드 backfill — 기존 저장에 없으면 기본값. 기존 값은 보존.
    parsed.unlockedRelicIds ??= [];
    parsed.purchasedUnlocks ??= [];
    parsed.unlockedCardIds ??= [];
    parsed.unlockedTimelineIds ??= [];
    parsed.unlockedRaceIds ??= [];
    // 세이브 v3 마이그레이션 — 카오스 필드 누락 시 안전 기본값으로 채움. 기존 값은 보존.
    parsed.unlockedChaosIds ??= [];
    parsed.chaosTierRevealed ??= 1;
    parsed.bestChaosScore ??= {};
    // 세이브 v4 마이그레이션 (1B) — NPC 친밀도 영속 필드 누락 시 빈 객체로 채움. 기존 값은 보존.
    parsed.npcAffinity ??= {};
    // 세이브 v5 마이그레이션 — 런 기록 필드 누락 시 빈 배열로 채움. 기존 값은 보존.
    parsed.runHistory ??= [];
    parsed.saveVersion = META_SAVE_VERSION;
    return parsed;
  } catch {
    return createEmptyMeta();
  }
}

/** src 배열의 id들을 dst에 중복 없이 push (in-place). */
function pushUnique(dst: string[], src: string[] | undefined) {
  if (!src) return;
  for (const id of src) {
    if (!dst.includes(id)) dst.push(id);
  }
}

function saveMeta(meta: MetaProgress) {
  try {
    localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // localStorage 미지원 환경 — 무시
  }
}

export const useMetaStore = defineStore('meta', {
  state: (): MetaProgress => loadMeta(),

  getters: {
    /** 종합 진행도 = 4 게이지의 평균. (후속 결정: 함수 형태) */
    compositeRatio(state): number {
      const g = state.gauges;
      const ratios = [
        g.hyperion1.current / Math.max(1, g.hyperion1.max),
        g.hyperion2.current / Math.max(1, g.hyperion2.max),
        g.insight1.current / Math.max(1, g.insight1.max),
        g.insight2.current / Math.max(1, g.insight2.max),
      ];
      return ratios.reduce((a, b) => a + b, 0) / ratios.length;
    },

    /** 히페리온 소비 풀 = hyperion1 + hyperion2 누적. */
    hyperionPool(state): number {
      return state.gauges.hyperion1.current + state.gauges.hyperion2.current;
    },
    /** 해석 소비 풀 = insight1 + insight2 누적. */
    insightPool(state): number {
      return state.gauges.insight1.current + state.gauges.insight2.current;
    },
    /** 영혼 소비 풀. */
    soulPool(state): number {
      return state.soulResource;
    },
  },

  actions: {
    /** 한 게이지에 누적값을 더하고 해금 임계를 검사. */
    addToGauge(
      key: keyof MetaProgress['gauges'],
      delta: number,
    ): UnlockKey[] {
      const gauge = this.gauges[key];
      const oldRatio = gauge.current / Math.max(1, gauge.max);
      gauge.current = Math.min(gauge.max, gauge.current + delta);
      const newRatio = gauge.current / Math.max(1, gauge.max);

      // 임계 통과 검사
      const granted: UnlockKey[] = [];
      for (const threshold of gauge.unlockThresholds) {
        if (oldRatio < threshold && newRatio >= threshold) {
          const newKey: UnlockKey = {
            key: `${key}-${Math.round(threshold * 100)}`,
            source: key,
            grantedAt: Date.now(),
          };
          this.unlockedKeys.push(newKey);
          this._applyUnlockKey(newKey);
          granted.push(newKey);
        }
      }
      this.persist();
      return granted;
    },

    /**
     * 해금 키 패턴 해석 후 적절한 콘텐츠 ID 배열에 push.
     *
     * 키 패턴 규약 (r4 신설, characters/ 폐기 후 갱신):
     *   "unlock-race-<id>"       → unlockedRaceIds
     *   "unlock-character-<id>"  → unlockedRaceIds (옛 키 호환 — ch-* → race 변환)
     *   "unlock-timeline-<id>"   → unlockedTimelineIds
     *   "unlock-card-<id>"       → unlockedCardIds
     *   그 외(예: "hyperion1-25") → key만 보관 (특정 콘텐츠 push 없음)
     *
     * 첫 플레이 fallback 보존:
     *   Mono.canSelectRace 등의 `length === 0` 가드는 그대로 — 한 번도 push되지 않은
     *   완전 초기 상태는 여전히 모두 허용. 첫 push 이후엔 화이트리스트 동작.
     */
    _applyUnlockKey(k: UnlockKey) {
      const mRace = k.key.match(/^unlock-race-(.+)$/);
      if (mRace) {
        if (!this.unlockedRaceIds.includes(mRace[1])) {
          this.unlockedRaceIds.push(mRace[1]);
        }
        return;
      }
      // 옛 키 호환: unlock-character-ch-* → race로 변환 후 unlockedRaceIds.
      const mChar = k.key.match(/^unlock-character-(.+)$/);
      if (mChar) {
        const raceId = LEGACY_CHARACTER_TO_RACE[mChar[1]] ?? mChar[1];
        if (!this.unlockedRaceIds.includes(raceId)) {
          this.unlockedRaceIds.push(raceId);
        }
        return;
      }
      const mTl = k.key.match(/^unlock-timeline-(.+)$/);
      if (mTl) {
        if (!this.unlockedTimelineIds.includes(mTl[1])) {
          this.unlockedTimelineIds.push(mTl[1]);
        }
        return;
      }
      const mCard = k.key.match(/^unlock-card-(.+)$/);
      if (mCard) {
        if (!this.unlockedCardIds.includes(mCard[1])) {
          this.unlockedCardIds.push(mCard[1]);
        }
        return;
      }
      // 게이지 임계 돌파 키 (예: hyperion1-25) — 도전 통화 환류로 영혼 +5 지급 (R2, 2026-06-10).
      //   신규 발급분에만 적용(addToGauge가 임계 통과 시에만 _applyUnlockKey를 부르므로 소급 X).
      //   addSoul이 내부에서 persist하지만, 호출부(addToGauge)도 마지막에 persist하므로 무해.
      if (/^(hyperion1|hyperion2|insight1|insight2|composite)-\d+$/.test(k.key)) {
        this.addSoul(5);
        return;
      }
      // 그 외 패턴 미매칭 키 — push 없이 보관만.
    },

    /**
     * 런 종료 시 호출: 휘발 진행도를 게이지로 변환 (역할 재정의, 2026-06-10).
     *
     * 입력은 progression.ts가 *이미 산정한 게이지 증분*(표시값과 동일 공식)을 그대로 받는다.
     * 게이지 역할: 히페리온=탐험(방문 권역·동료) / 해석=전투(아크·보스).
     *   hyperion1 ← 방문 권역 수 × 3
     *   hyperion2 ← roster 동료 수 × 2
     *   insight1  ← 아크 클리어 수 × 10
     *   insight2  ← 보스 클리어 × 25
     * (옛 입력원 hyperionStageClears·npcAffinityGain·missionsCleared는 죽은 흐름이라 제거됨.)
     */
    absorbRunResult(input: {
      hyperion1: number;
      hyperion2: number;
      insight1: number;
      insight2: number;
      bossesCleared: number;
    }): UnlockKey[] {
      const granted: UnlockKey[] = [];
      granted.push(...this.addToGauge('hyperion1', input.hyperion1));
      granted.push(...this.addToGauge('hyperion2', input.hyperion2));
      granted.push(...this.addToGauge('insight1', input.insight1));
      granted.push(...this.addToGauge('insight2', input.insight2));
      // 종합 게이지 — 4개 게이지 증분의 절반(누적 진행도 표시 전용, 어디서도 게이팅에 쓰이지 않음).
      this.addToGauge(
        'composite',
        (input.hyperion1 + input.hyperion2 + input.insight1 + input.insight2) / 2,
      );
      this.totalRuns += 1;
      this.totalBossClears += input.bossesCleared;
      this.persist();
      return granted;
    },

    persist() {
      saveMeta(this.$state);
    },

    /** 도감 등록은 codex 스토어로 위임하지만, 영혼 자원 등은 여기서. */
    addSoul(amount: number) {
      this.soulResource = Math.max(0, this.soulResource + amount);
      this.persist();
    },

    /** 메타 자원 소비 풀 조회 (자원별). */
    poolOf(resource: MetaResource): number {
      switch (resource) {
        case 'hyperion':
          return this.gauges.hyperion1.current + this.gauges.hyperion2.current;
        case 'insight':
          return this.gauges.insight1.current + this.gauges.insight2.current;
        case 'soul':
          return this.soulResource;
      }
    },

    /** 해당 자원으로 cost를 감당할 수 있는가? */
    canAfford(resource: MetaResource, cost: number): boolean {
      return this.poolOf(resource) >= cost;
    },

    /**
     * 자원을 차감한다. (0 미만 클램프)
     *   hyperion → hyperion1 먼저, 부족분 hyperion2.
     *   insight  → insight1 먼저, 부족분 insight2.
     *   soul     → soulResource.
     */
    spend(resource: MetaResource, cost: number) {
      let remaining = Math.max(0, cost);
      if (resource === 'soul') {
        this.soulResource = Math.max(0, this.soulResource - remaining);
        this.persist();
        return;
      }
      const first = resource === 'hyperion' ? this.gauges.hyperion1 : this.gauges.insight1;
      const second = resource === 'hyperion' ? this.gauges.hyperion2 : this.gauges.insight2;
      const fromFirst = Math.min(first.current, remaining);
      first.current = Math.max(0, first.current - fromFirst);
      remaining -= fromFirst;
      if (remaining > 0) {
        second.current = Math.max(0, second.current - remaining);
      }
      this.persist();
    },

    /**
     * 메타 해금 항목 구매. 성공 시 자원 차감 + grants 적용.
     * 이미 구매했거나 자원이 부족하면 false.
     */
    purchaseUnlock(u: MetaUnlock): boolean {
      if (this.purchasedUnlocks.includes(u.id)) return false;
      if (!this.canAfford(u.resource, u.cost)) return false;
      this.spend(u.resource, u.cost);
      this.purchasedUnlocks.push(u.id);
      pushUnique(this.unlockedRaceIds, u.grantsRaceIds);
      pushUnique(this.unlockedRelicIds, u.grantsRelicIds);
      pushUnique(this.unlockedCardIds, u.grantsCardIds);
      pushUnique(this.unlockedTimelineIds, u.grantsTimelineIds);
      this.persist();
      return true;
    },

    /** 디버그/버그 화면용: 메타 초기화. */
    resetAll() {
      const fresh = createEmptyMeta();
      // $patch는 procInputs: Record<string, unknown>의 deep partial과 충돌하므로
      // 개별 필드를 명시적으로 덮어씀.
      this.gauges = fresh.gauges;
      this.unlockedKeys = fresh.unlockedKeys;
      this.unlockedRaceIds = fresh.unlockedRaceIds;
      this.unlockedTimelineIds = fresh.unlockedTimelineIds;
      this.unlockedCardIds = fresh.unlockedCardIds;
      this.unlockedRelicIds = fresh.unlockedRelicIds;
      this.purchasedUnlocks = fresh.purchasedUnlocks;
      this.codex = fresh.codex;
      this.soulResource = fresh.soulResource;
      this.procInputs = fresh.procInputs;
      this.totalRuns = fresh.totalRuns;
      this.totalBossClears = fresh.totalBossClears;
      this.unlockedChaosIds = fresh.unlockedChaosIds;
      this.chaosTierRevealed = fresh.chaosTierRevealed;
      this.bestChaosScore = fresh.bestChaosScore;
      this.npcAffinity = fresh.npcAffinity;
      this.runHistory = fresh.runHistory;
      this.saveVersion = fresh.saveVersion;
      this.persist();
    },

    /**
     * NPC 친밀도 영속 누적 (Item 37-② Stage C, 1B) — delta 만큼 더하고 [0, MAX_NPC_AFFINITY] 클램프.
     * 대화로 친해질 때마다 *cross-run* 으로 직접 누적된다(런 종료 흡수 아님). 반환: 갱신 후 값.
     */
    addNpcAffinity(npcId: string, delta: number): number {
      if (!this.npcAffinity) this.npcAffinity = {};
      const cur = this.npcAffinity[npcId] ?? 0;
      const next = Math.max(0, Math.min(MAX_NPC_AFFINITY, cur + delta));
      this.npcAffinity[npcId] = next;
      this.persist();
      return next;
    },

    /** NPC 친밀도 영속 조회 (없으면 0). */
    npcAffinityOf(npcId: string): number {
      return this.npcAffinity?.[npcId] ?? 0;
    },

    /**
     * 런 한 판의 기록을 영구 저장 (v5) — 최신을 맨 앞(unshift)에 넣고 상한 초과분을 잘라낸다.
     * absorbRunIntoMeta의 *최초 적용 분기*에서만 호출(런당 1회, 중복 기록 방지).
     */
    recordRunSummary(summary: RunSummary) {
      if (!this.runHistory) this.runHistory = [];
      this.runHistory.unshift(summary);
      if (this.runHistory.length > RUN_HISTORY_LIMIT) {
        this.runHistory.length = RUN_HISTORY_LIMIT;
      }
      this.persist();
    },

    /** 외부에서 codex 등록 카운트 갱신 시 호출 — codex 스토어와 분리하되 동기. */
    upsertCodexEntry(entry: CodexEntry) {
      const idx = this.codex.findIndex((e) => e.id === entry.id && e.kind === entry.kind);
      if (idx >= 0) {
        this.codex[idx].encounterCount = entry.encounterCount;
      } else {
        this.codex.push(entry);
      }
      this.persist();
    },
  },
});
