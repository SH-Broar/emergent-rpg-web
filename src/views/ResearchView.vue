<script setup lang="ts">
/**
 * 연구 — 영구 해금 *투자* 시스템.
 *
 * 메타 자원(히페리온/해석/영혼)을 *소비해 콘텐츠를 개방*한다. 한 번 산 해금은 되돌아가지 않는다.
 *
 * 역할 (2026-06-10 재정의):
 *   - 히페리온 = 탐험으로 모인다 (방문 권역·동료). → 종족 해금.
 *   - 해석     = 전투로 모인다 (아크·보스).      → 종족 앵커 유물.
 *   - 영혼     = 도전으로 모인다 (보스·카오스).   → 카오스 구매(카오스 화면으로 분리).
 *
 * 카오스 상점은 *카오스 화면*으로 이관됨(혼재 해소 — 자원/성격이 다른 두 시스템을 한 화면에 두지 않는다).
 */

import { useRouter } from 'vue-router';
import { computed, onMounted } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import type { MetaResource, MetaUnlock } from '@/data/schemas';

const router = useRouter();
const meta = useMetaStore();
const data = useDataStore();
const ui = useUiStore();

interface ResourceDisplay {
  key: MetaResource;
  label: string;
  color: string;
  /** 이 자원이 *어떻게 모이는가* — 한 줄 안내(역할 재정의). */
  source: string;
  pool: () => number;
}

const RESOURCES: ResourceDisplay[] = [
  { key: 'hyperion', label: '히페리온', color: '#ffb86c', source: '탐험으로 모인다 (방문한 권역·함께한 동료)', pool: () => meta.hyperionPool },
  { key: 'insight', label: '해석', color: '#8eedff', source: '전투로 모인다 (아크 격파·보스 격파)', pool: () => meta.insightPool },
  { key: 'soul', label: '영혼', color: '#c08eff', source: '도전으로 모인다 (보스 격파·카오스 도전)', pool: () => meta.soulPool },
];

const resourceColor: Record<MetaResource, string> = {
  hyperion: '#ffb86c',
  insight: '#8eedff',
  soul: '#c08eff',
};
const resourceLabel: Record<MetaResource, string> = {
  hyperion: '히페리온',
  insight: '해석',
  soul: '영혼',
};
/** 각 항목 카드에 붙는 *획득 경로* 한 줄(어떤 자원으로 사는지). */
const resourceSource: Record<MetaResource, string> = {
  hyperion: '탐험으로 모은 히페리온',
  insight: '전투로 모은 해석',
  soul: '도전으로 모은 영혼',
};

/**
 * 해금 카탈로그 — 탭(자원 도메인)별로 묶는다. 항목 없는 자원 탭은 숨김.
 *   히페리온 = 종족 / 해석 = 유물(종족 앵커) / 영혼 = (현재 연구엔 0건 — 카오스는 별도 화면).
 * 시간대 해금은 데이터 0건이라 자연히 빈 그룹 → 숨김.
 */
const TAB_TITLE: Record<MetaResource, string> = {
  hyperion: '종족',
  insight: '유물 (종족 앵커)',
  soul: '그 외',
};
const catalog = computed(() => {
  const all = Array.from(data.unlocks.values());
  return RESOURCES.map((r) => ({
    ...r,
    title: TAB_TITLE[r.key],
    items: all.filter((u) => u.resource === r.key),
  })).filter((g) => g.items.length > 0);
});

function isPurchased(u: MetaUnlock): boolean {
  return meta.purchasedUnlocks.includes(u.id);
}
function canBuy(u: MetaUnlock): boolean {
  return !isPurchased(u) && meta.canAfford(u.resource, u.cost);
}

function buy(u: MetaUnlock) {
  const ok = meta.purchaseUnlock(u);
  if (ok) {
    ui.toast('success', `'${u.name}' 해금`);
  } else {
    ui.toast('warning', '해금할 수 없습니다.');
  }
}

// === 하단 요약: 5게이지 누적 진행바 ===
interface GaugeDisplay {
  key: keyof typeof meta.gauges;
  label: string;
  color: string;
}
const gauges: GaugeDisplay[] = [
  { key: 'hyperion1', label: '히페리온 · 권역', color: '#ffb86c' },
  { key: 'hyperion2', label: '히페리온 · 동료', color: '#ffd2a0' },
  { key: 'insight1', label: '해석 · 아크', color: '#8eedff' },
  { key: 'insight2', label: '해석 · 보스', color: '#bdf3ff' },
  { key: 'composite', label: '종합 진행도', color: '#ffe88e' },
];
const percent = (v: number, max: number) =>
  Math.min(100, Math.round((v / Math.max(1, max)) * 100));

function back() {
  router.push('/save-manage');
}
function toChaos() {
  router.push('/chaos');
}

onMounted(() => {
  data.ensureLoaded();
});
</script>

<template>
  <main class="research-view">
    <header class="hdr">
      <button class="back" @click="back">← 세이브 관리</button>
      <h1>연구</h1>
      <p class="sub">메타 자원을 들여 영영 풀리는 콘텐츠를 산다. 한 번 연 것은 닫히지 않는다.</p>
    </header>

    <!-- 보유 자원 + 어떻게 모이는가 -->
    <section class="resources">
      <div v-for="r in RESOURCES" :key="r.key" class="res">
        <div class="res__top">
          <span class="res__label" :style="{ color: r.color }">{{ r.label }}</span>
          <span class="res__val" :style="{ color: r.color }">{{ r.pool() }}</span>
        </div>
        <span class="res__source">{{ r.source }}</span>
      </div>
    </section>

    <!-- 해금 카탈로그 (탭 = 자원 도메인) -->
    <section v-if="catalog.length > 0" class="catalog">
      <div v-for="group in catalog" :key="group.key" class="group">
        <h2 class="group__title" :style="{ color: group.color }">{{ group.title }}</h2>
        <div class="group__items">
          <div
            v-for="u in group.items"
            :key="u.id"
            class="unlock"
            :class="{ 'unlock--owned': isPurchased(u) }"
          >
            <div class="unlock__main">
              <span class="unlock__name">{{ u.name }}</span>
              <p v-if="u.description" class="unlock__desc">{{ u.description }}</p>
            </div>
            <div class="unlock__side">
              <span class="unlock__cost" :style="{ color: resourceColor[u.resource] }">
                {{ resourceLabel[u.resource] }} {{ u.cost }}
              </span>
              <span class="unlock__path">{{ resourceSource[u.resource] }}</span>
              <span v-if="isPurchased(u)" class="unlock__owned-tag">해금됨</span>
              <button
                v-else
                class="unlock__buy"
                :disabled="!canBuy(u)"
                @click="buy(u)"
              >
                {{ canBuy(u) ? '해금' : '자원 부족' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
    <section v-else class="empty"><p>아직 열 수 있는 해금이 없다.</p></section>

    <!-- 카오스는 별도 화면으로 분리 — 안내만 둔다. -->
    <section class="chaos-link">
      <p>카오스(도전 점수)는 <strong>영혼</strong>으로 카오스 화면에서 산다.</p>
      <button class="chaos-link__btn" @click="toChaos">카오스 보러 가기 →</button>
    </section>

    <!-- 누적 진행도 요약 -->
    <details class="summary">
      <summary>누적 진행도</summary>
      <div class="gauges">
        <div v-for="g in gauges" :key="g.key" class="gauge">
          <div class="gauge__head">
            <span class="gauge__label" :style="{ color: g.color }">{{ g.label }}</span>
            <span class="gauge__num">
              {{ meta.gauges[g.key].current }} / {{ meta.gauges[g.key].max }}
            </span>
          </div>
          <div class="gauge__bar">
            <div
              class="gauge__fill"
              :style="{
                width: percent(meta.gauges[g.key].current, meta.gauges[g.key].max) + '%',
                background: g.color,
              }"
            />
          </div>
        </div>
      </div>
      <div class="meta-info">
        <p>영혼 자원: <strong>{{ meta.soulResource }}</strong></p>
        <p>해금 종족: <strong>{{ meta.unlockedRaceIds.length }}</strong></p>
        <p>구매한 해금: <strong>{{ meta.purchasedUnlocks.length }}</strong></p>
      </div>
    </details>
  </main>
</template>

<style scoped>
.research-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.hdr { margin-bottom: 1.6rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.sub { color: #888; margin: 0.4rem 0 0; font-size: 0.92rem; }

.resources {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.6rem;
  flex-wrap: wrap;
}
.res {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.7rem 1.2rem;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  min-width: 180px;
  flex: 1;
}
.res__top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
.res__label { font-size: 0.8rem; letter-spacing: 0.04em; }
.res__val { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.res__source { font-size: 0.74rem; color: #8a8a99; line-height: 1.35; }

.catalog { display: flex; flex-direction: column; gap: 1.8rem; }
.group__title { font-size: 1rem; margin: 0 0 0.6rem; letter-spacing: 0.04em; }
.group__items { display: flex; flex-direction: column; gap: 0.6rem; }
.unlock {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1.1rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
}
.unlock--owned { opacity: 0.55; }
.unlock__main { flex: 1; min-width: 0; }
.unlock__name { font-weight: 600; color: #f6e8b8; }
.unlock__desc { color: #bdb6a0; font-size: 0.85rem; line-height: 1.45; margin: 0.25rem 0 0; }
.unlock__side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; flex-shrink: 0; }
.unlock__cost { font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.unlock__path { font-size: 0.72rem; color: #8a8a99; }
.unlock__owned-tag { font-size: 0.8rem; color: #7fd58f; font-weight: 600; }
.unlock__buy {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.25);
  color: #f6e8b8;
  padding: 0.35rem 0.9rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}
.unlock__buy:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
.unlock__buy:disabled { opacity: 0.4; cursor: not-allowed; }

.empty { text-align: center; padding: 3rem 2rem; color: #6c6c7c; }

/* === 카오스 분리 안내 === */
.chaos-link {
  margin-top: 2rem;
  padding: 1rem 1.2rem;
  background: rgba(192,142,255,0.06);
  border: 1px solid rgba(192,142,255,0.28);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.chaos-link p { margin: 0; color: #bdb6a0; font-size: 0.88rem; }
.chaos-link strong { color: #c08eff; }
.chaos-link__btn {
  background: rgba(192,142,255,0.16);
  border: 1px solid rgba(192,142,255,0.4);
  color: #f6e8b8; padding: 0.4rem 0.9rem; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.85rem;
  white-space: nowrap;
}
.chaos-link__btn:hover { background: rgba(192,142,255,0.28); }

.summary { margin-top: 2.4rem; }
.summary summary { cursor: pointer; color: #c0b693; font-size: 0.9rem; padding: 0.4rem 0; }
.gauges { display: flex; flex-direction: column; gap: 0.9rem; margin-top: 0.8rem; }
.gauge { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.8rem; }
.gauge__head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem; }
.gauge__label { font-weight: 600; font-size: 0.88rem; }
.gauge__num { color: #888; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
.gauge__bar { position: relative; height: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; }
.gauge__fill { position: absolute; inset: 0 auto 0 0; transition: width 360ms ease; }
.meta-info { margin-top: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.6rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; }
.meta-info p { margin: 0; color: #b6b6c4; font-size: 0.88rem; }
.meta-info strong { color: #f6e8b8; }

@media (max-width: 640px) {
  .research-view { padding: 1.2rem; }
}
</style>
