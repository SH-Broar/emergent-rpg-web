/**
 * Pinia 스토어 — 영구 메타 진행 (localStorage 동기화).
 *
 * 5게이지: 히페리온 ①② + 해석 ①② + 종합.
 * 각 게이지가 % 임계마다 해금 노드를 발급한다.
 */

import { defineStore } from 'pinia';
import {
  EMPTY_META_GAUGE,
  type CodexEntry,
  type MetaProgress,
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
    unlockedRaceIds: [],
    unlockedTimelineIds: [],
    unlockedCardIds: [],
    codex: [],
    soulResource: 0,
    procInputs: {},
    totalRuns: 0,
    totalBossClears: 0,
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
    return parsed;
  } catch {
    return createEmptyMeta();
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
      // 패턴 미매칭 — 진행도 임계 키 (예: hyperion1-25). push 없이 보관만.
    },

    /** 런 종료 시 호출: 휘발 진행도를 게이지로 변환. */
    absorbRunResult(input: {
      hyperionStageClears: number;   // 0~5
      npcAffinityGain: number;
      missionsCleared: number;
      bossesCleared: number;
    }): UnlockKey[] {
      const granted: UnlockKey[] = [];
      granted.push(...this.addToGauge('hyperion1', input.hyperionStageClears * 10));
      granted.push(...this.addToGauge('hyperion2', input.npcAffinityGain));
      granted.push(...this.addToGauge('insight1', input.missionsCleared * 10));
      granted.push(...this.addToGauge('insight2', input.bossesCleared * 25));
      // 종합 게이지는 4개 게이지 평균의 변동분
      this.addToGauge(
        'composite',
        input.hyperionStageClears * 5 +
          input.npcAffinityGain / 2 +
          input.missionsCleared * 5 +
          input.bossesCleared * 12,
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
      this.codex = fresh.codex;
      this.soulResource = fresh.soulResource;
      this.procInputs = fresh.procInputs;
      this.totalRuns = fresh.totalRuns;
      this.totalBossClears = fresh.totalBossClears;
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
