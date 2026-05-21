<script setup lang="ts">
/**
 * 연구 — 영구 해금 *투자* 시스템 (A단계).
 *
 * 메타 자원(히페리온/해석/영혼)을 *소비해 콘텐츠를 개방*한다.
 * 한 번 산 해금은 되돌아가지 않는다. (cf. 카오스는 매 런 토글)
 *
 * 자원→도메인 전담: 히페리온=종족, 해석=카드·유물, 영혼=시간대.
 * A단계는 unlocks.txt에 종족 항목만 들어 있어 *종족 해금만 실동작*.
 */

import { useRouter } from 'vue-router';
import { computed, onMounted } from 'vue';
import { useMetaStore } from '@/stores/meta';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import type { Chaos, MetaResource, MetaUnlock } from '@/data/schemas';
import { shopChaos, purchaseChaos, chaosCostFor, chaosTierLabel } from '@/systems/chaos';

const router = useRouter();
const meta = useMetaStore();
const data = useDataStore();
const ui = useUiStore();

interface ResourceDisplay {
  key: MetaResource;
  label: string;
  color: string;
  pool: () => number;
}

const RESOURCES: ResourceDisplay[] = [
  { key: 'hyperion', label: '히페리온', color: '#ffb86c', pool: () => meta.hyperionPool },
  { key: 'insight', label: '해석', color: '#8eedff', pool: () => meta.insightPool },
  { key: 'soul', label: '영혼', color: '#c08eff', pool: () => meta.soulPool },
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

/** 자원별로 묶인 해금 카탈로그. 항목 없는 자원 그룹은 숨김. */
const catalog = computed(() => {
  const all = Array.from(data.unlocks.values());
  return RESOURCES.map((r) => ({
    ...r,
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

// === 카오스 상점 (도전-점수 시스템) ===
/** 진열되는 카오스 — tier ≤ chaosTierRevealed. 티어별 그룹. */
const chaosGroups = computed(() => {
  const list = shopChaos();
  const byTier = new Map<number, Chaos[]>();
  for (const c of list) {
    if (!byTier.has(c.tier)) byTier.set(c.tier, []);
    byTier.get(c.tier)!.push(c);
  }
  return [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([tier, items]) => ({ tier, items }));
});
/** 아직 잠긴 다음 티어(있으면). 안내문 표기용. */
const nextLockedTier = computed(() => {
  const revealed = meta.chaosTierRevealed;
  return revealed < 4 ? revealed + 1 : null;
});
function ownsChaos(c: Chaos): boolean {
  return meta.unlockedChaosIds.includes(c.id);
}
function canBuyChaos(c: Chaos): boolean {
  return !ownsChaos(c) && meta.canAfford('soul', chaosCostFor(c.tier));
}
function buyChaos(c: Chaos) {
  if (purchaseChaos(c.id)) {
    ui.toast('success', `카오스 '${c.name}' 구매`);
  } else {
    ui.toast('warning', '구매할 수 없습니다.');
  }
}

// === 하단 요약: 5게이지 누적 진행바 ===
interface GaugeDisplay {
  key: keyof typeof meta.gauges;
  label: string;
  color: string;
}
const gauges: GaugeDisplay[] = [
  { key: 'hyperion1', label: '히페리온 ①', color: '#ffb86c' },
  { key: 'hyperion2', label: '히페리온 ②', color: '#ffd2a0' },
  { key: 'insight1', label: '해석 ①', color: '#8eedff' },
  { key: 'insight2', label: '해석 ②', color: '#bdf3ff' },
  { key: 'composite', label: '종합 진행도', color: '#ffe88e' },
];
const percent = (v: number, max: number) =>
  Math.min(100, Math.round((v / Math.max(1, max)) * 100));

function back() {
  router.push('/main');
}

onMounted(() => {
  data.ensureLoaded();
});
</script>

<template>
  <main class="research-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>연구</h1>
      <p class="sub">메타 자원을 들여 영영 풀리는 콘텐츠를 산다. 한 번 연 것은 닫히지 않는다.</p>
    </header>

    <!-- 보유 자원 -->
    <section class="resources">
      <div v-for="r in RESOURCES" :key="r.key" class="res">
        <span class="res__label" :style="{ color: r.color }">{{ r.label }}</span>
        <span class="res__val" :style="{ color: r.color }">{{ r.pool() }}</span>
      </div>
    </section>

    <!-- 해금 카탈로그 -->
    <section v-if="catalog.length > 0" class="catalog">
      <div v-for="group in catalog" :key="group.key" class="group">
        <h2 class="group__title" :style="{ color: group.color }">{{ group.label }}</h2>
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

    <!-- 카오스 상점 (도전-점수 시스템) -->
    <section class="chaos-shop">
      <h2 class="chaos-shop__title">카오스</h2>
      <p class="chaos-shop__sub">높을수록 원래 세계에서 멀어진다. 영혼으로 사두면 매 런 자유로 켤 수 있다.</p>
      <div v-for="g in chaosGroups" :key="g.tier" class="cgroup">
        <h3 class="cgroup__title">{{ chaosTierLabel(g.tier) }}</h3>
        <div class="cgroup__items">
          <div
            v-for="c in g.items"
            :key="c.id"
            class="citem"
            :class="{ 'citem--owned': ownsChaos(c) }"
          >
            <div class="citem__main">
              <span class="citem__name">{{ c.name }}</span>
              <p class="citem__desc">{{ c.description }}</p>
            </div>
            <div class="citem__side">
              <span class="citem__cost">영혼 {{ chaosCostFor(c.tier) }}</span>
              <span v-if="ownsChaos(c)" class="citem__owned">보유</span>
              <button
                v-else
                class="citem__buy"
                :disabled="!canBuyChaos(c)"
                @click="buyChaos(c)"
              >
                {{ canBuyChaos(c) ? '구매' : '영혼 부족' }}
              </button>
            </div>
          </div>
        </div>
      </div>
      <p v-if="nextLockedTier" class="chaos-shop__locked">
        🔒 {{ chaosTierLabel(nextLockedTier) }} — 진열된 카오스를 하나라도 켜고 클리어하면 열린다.
      </p>
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
  gap: 0.2rem;
  padding: 0.7rem 1.2rem;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  min-width: 100px;
}
.res__label { font-size: 0.8rem; letter-spacing: 0.04em; }
.res__val { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }

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
.unlock__side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem; flex-shrink: 0; }
.unlock__cost { font-size: 0.85rem; font-weight: 600; font-variant-numeric: tabular-nums; }
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

/* === 카오스 상점 === */
.chaos-shop {
  margin-top: 2.4rem;
  padding: 1.4rem;
  background: rgba(192,142,255,0.06);
  border: 1px solid rgba(192,142,255,0.28);
  border-radius: 10px;
}
.chaos-shop__title { color: #c08eff; margin: 0; font-size: 1.05rem; letter-spacing: 0.03em; }
.chaos-shop__sub { color: #888; font-size: 0.85rem; margin: 0.35rem 0 1rem; }
.cgroup { margin-bottom: 1.1rem; }
.cgroup__title { color: #bdb0e0; font-size: 0.85rem; margin: 0 0 0.5rem; letter-spacing: 0.04em; }
.cgroup__items { display: flex; flex-direction: column; gap: 0.5rem; }
.citem {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.8rem 1rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
}
.citem--owned { opacity: 0.6; }
.citem__main { flex: 1; min-width: 0; }
.citem__name { font-weight: 600; color: #f6e8b8; }
.citem__desc { color: #bdb6a0; font-size: 0.82rem; line-height: 1.4; margin: 0.2rem 0 0; }
.citem__side { display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; flex-shrink: 0; }
.citem__cost { font-size: 0.82rem; color: #c08eff; font-weight: 600; font-variant-numeric: tabular-nums; }
.citem__owned { font-size: 0.8rem; color: #7fd58f; font-weight: 600; }
.citem__buy {
  background: rgba(192,142,255,0.16);
  border: 1px solid rgba(192,142,255,0.4);
  color: #f6e8b8; padding: 0.32rem 0.85rem; border-radius: 6px; cursor: pointer; font-size: 0.83rem;
}
.citem__buy:hover:not(:disabled) { background: rgba(192,142,255,0.28); }
.citem__buy:disabled { opacity: 0.4; cursor: not-allowed; }
.chaos-shop__locked { color: #9a8fb8; font-size: 0.83rem; margin: 0.8rem 0 0; }

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
