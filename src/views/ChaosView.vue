<script setup lang="ts">
/**
 * 카오스 화면 (메인 메뉴) — *읽기 전용 카탈로그*.
 *
 * 카오스 = 자기부여 핸디캡 + 도전 점수(systems/chaos.ts). 높을수록 원래 세계에서 멀어진다.
 * 이 화면은 *목록 확인 전용*이다:
 *   - 구매(영혼 소비)는 연구 화면에서.
 *   - 적용(토글·강도 선택)은 런 시작 직전 카오스 선택 단계에서.
 * 여기서는 전체 카탈로그를 티어별로 훑어보고 보유/비용/강도별 점수만 확인한다.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import {
  chaosTierLabel,
  chaosCostFor,
  chaosLevelSummary,
} from '@/systems/chaos';
import type { Chaos } from '@/data/schemas';

const router = useRouter();
const data = useDataStore();
const meta = useMetaStore();

/** 전체 카오스 — 티어별 그룹(오름차순). */
const groups = computed(() => {
  const byTier = new Map<number, Chaos[]>();
  for (const c of data.chaosDefs.values()) {
    if (!byTier.has(c.tier)) byTier.set(c.tier, []);
    byTier.get(c.tier)!.push(c);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, items]) => ({ tier, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
});

function owns(c: Chaos): boolean {
  return meta.unlockedChaosIds.includes(c.id);
}

/** 강도별 단계 (인덱스 0 → 강도 1). */
function levelsOf(c: Chaos): { intensity: number; score: number; summary: string }[] {
  return c.levels.map((lv, i) => ({
    intensity: i + 1,
    score: lv.score,
    summary: chaosLevelSummary(c, i + 1),
  }));
}

function back() {
  router.push('/main');
}

onMounted(() => {
  data.ensureLoaded();
});
</script>

<template>
  <main class="chaos-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>카오스</h1>
      <p class="sub">
        높을수록 원래 세계에서 멀어진다. 도전 점수만 기록된다.
        구매는 <strong>연구</strong>에서, 적용은 <strong>런 시작 직전</strong>에 한다. 여기서는 목록만 확인한다.
      </p>
    </header>

    <section class="status-bar">
      <div class="chip">
        <span class="chip__label">보유 영혼</span>
        <span class="chip__val">{{ meta.soulPool }}</span>
      </div>
      <div class="chip">
        <span class="chip__label">소유한 카오스</span>
        <span class="chip__val">{{ meta.unlockedChaosIds.length }}</span>
      </div>
    </section>

    <section v-if="groups.length > 0" class="catalog">
      <div v-for="g in groups" :key="g.tier" class="group">
        <h2 class="group__title">{{ chaosTierLabel(g.tier) }}</h2>
        <div class="group__items">
          <article
            v-for="c in g.items"
            :key="c.id"
            class="chaos"
            :class="{ 'chaos--owned': owns(c) }"
          >
            <header class="chaos__head">
              <span class="chaos__name">{{ c.name }}</span>
              <span v-if="owns(c)" class="chaos__badge chaos__badge--owned">보유</span>
              <span v-else class="chaos__badge">영혼 {{ chaosCostFor(c.tier) }}</span>
            </header>
            <p class="chaos__desc">{{ c.description }}</p>
            <ul class="levels">
              <li v-for="lv in levelsOf(c)" :key="lv.intensity" class="level">
                <span v-if="c.levels.length > 1" class="level__step">강도 {{ lv.intensity }}</span>
                <span class="level__summary">{{ lv.summary }}</span>
                <span class="level__score">+{{ lv.score }}점</span>
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
    <section v-else class="empty">
      <p>등록된 카오스가 없습니다.</p>
    </section>
  </main>
</template>

<style scoped>
.chaos-view { max-width: 860px; margin: 0 auto; padding: 2rem; }
.hdr { margin-bottom: 1.2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.sub { color: #888; margin: 0.4rem 0 0; font-size: 0.9rem; line-height: 1.5; }
.sub strong { color: #c08eff; }

.status-bar { display: flex; gap: 1rem; margin: 1rem 0 1.6rem; flex-wrap: wrap; }
.chip {
  display: flex; flex-direction: column; gap: 0.2rem;
  padding: 0.6rem 1.2rem;
  background: rgba(192,142,255,0.1);
  border: 1px solid rgba(192,142,255,0.35);
  border-radius: 10px; min-width: 110px;
}
.chip__label { font-size: 0.76rem; color: #b6b6c4; letter-spacing: 0.04em; }
.chip__val { font-size: 1.5rem; font-weight: 700; color: #f6e8b8; font-variant-numeric: tabular-nums; }

.catalog { display: flex; flex-direction: column; gap: 1.6rem; }
.group__title { font-size: 0.95rem; margin: 0 0 0.6rem; color: #c08eff; letter-spacing: 0.04em; }
.group__items { display: flex; flex-direction: column; gap: 0.6rem; }

.chaos {
  padding: 0.9rem 1.1rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
}
.chaos--owned { border-color: rgba(192,142,255,0.45); background: rgba(192,142,255,0.06); }
.chaos__head { display: flex; align-items: center; gap: 0.6rem; }
.chaos__name { flex: 1; font-weight: 600; color: #f6e8b8; }
.chaos__badge {
  font-size: 0.78rem; color: #9a8fb8;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 5px;
  padding: 0.1rem 0.5rem; white-space: nowrap;
}
.chaos__badge--owned { color: #c08eff; border-color: rgba(192,142,255,0.5); }
.chaos__desc { color: #bdb6a0; font-size: 0.85rem; line-height: 1.45; margin: 0.35rem 0 0; }

.levels { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.level { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.82rem; }
.level__step { color: #888; min-width: 3.4rem; }
.level__summary { flex: 1; color: #c0b693; }
.level__score { color: #ffe88e; font-variant-numeric: tabular-nums; }

.empty { padding: 3rem 1rem; color: #6c6c7c; text-align: center; }

@media (max-width: 640px) { .chaos-view { padding: 1.2rem; } }
</style>
