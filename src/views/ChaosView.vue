<script setup lang="ts">
/**
 * 카오스 화면 (메인 메뉴) — *영혼으로 구매하는 상점*.
 *
 * 카오스 = 자기부여 핸디캡 + 도전 점수(systems/chaos.ts). 높을수록 원래 세계에서 멀어진다.
 *   - 구매(영혼 소비)는 *여기서* 한다 (2026-06-10: 연구 화면에서 이관 — 자원/성격 혼재 해소).
 *   - 적용(토글·강도 선택)은 런 시작 직전 카오스 선택 단계에서.
 *
 * 진열 규칙(이중 게이트): tier ≤ chaosTierRevealed 만 구매 가능하게 진열.
 *   T(n) 카오스를 켜고 클리어하면 다음 티어가 열린다(잠긴 티어는 안내만).
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { useUiStore } from '@/stores/ui';
import {
  shopChaos,
  purchaseChaos,
  chaosTierLabel,
  chaosCostFor,
  chaosLevelSummary,
} from '@/systems/chaos';
import type { Chaos } from '@/data/schemas';

const router = useRouter();
const data = useDataStore();
const meta = useMetaStore();
const ui = useUiStore();

/** 진열되는 카오스 — tier ≤ chaosTierRevealed. 티어별 그룹(오름차순). */
const groups = computed(() => {
  const byTier = new Map<number, Chaos[]>();
  for (const c of shopChaos()) {
    if (!byTier.has(c.tier)) byTier.set(c.tier, []);
    byTier.get(c.tier)!.push(c);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, items]) => ({ tier, items: items.sort((x, y) => x.name.localeCompare(y.name)) }));
});

/** 아직 잠긴 다음 티어(있으면) — 안내문 표기용. */
const nextLockedTier = computed(() => {
  const revealed = meta.chaosTierRevealed;
  return revealed < 4 ? revealed + 1 : null;
});

function owns(c: Chaos): boolean {
  return meta.unlockedChaosIds.includes(c.id);
}
function canBuy(c: Chaos): boolean {
  return !owns(c) && meta.canAfford('soul', chaosCostFor(c.tier));
}
function buy(c: Chaos) {
  if (purchaseChaos(c.id)) {
    ui.toast('success', `카오스 '${c.name}' 구매`);
  } else {
    ui.toast('warning', '구매할 수 없습니다.');
  }
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
        높을수록 원래 세계에서 멀어진다. 영혼으로 사두면 매 런 자유로 켤 수 있고, 도전 점수만 기록된다.
        적용은 <strong>런 시작 직전</strong>에 한다.
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
              <span class="chaos__cost">영혼 {{ chaosCostFor(c.tier) }}</span>
              <span v-if="owns(c)" class="chaos__owned">보유</span>
              <button
                v-else
                class="chaos__buy"
                :disabled="!canBuy(c)"
                @click="buy(c)"
              >
                {{ canBuy(c) ? '구매' : '영혼 부족' }}
              </button>
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
      <p v-if="nextLockedTier" class="locked">
        🔒 {{ chaosTierLabel(nextLockedTier) }} — 진열된 카오스를 하나라도 켜고 클리어하면 열린다.
      </p>
    </section>
    <section v-else class="empty">
      <p>진열된 카오스가 없습니다.</p>
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
.chaos__cost { font-size: 0.82rem; color: #c08eff; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.chaos__owned { font-size: 0.8rem; color: #7fd58f; font-weight: 600; white-space: nowrap; }
.chaos__buy {
  background: rgba(192,142,255,0.16);
  border: 1px solid rgba(192,142,255,0.4);
  color: #f6e8b8; padding: 0.32rem 0.85rem; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.83rem;
  white-space: nowrap;
}
.chaos__buy:hover:not(:disabled) { background: rgba(192,142,255,0.28); }
.chaos__buy:disabled { opacity: 0.4; cursor: not-allowed; }
.chaos__desc { color: #bdb6a0; font-size: 0.85rem; line-height: 1.45; margin: 0.35rem 0 0; }

.levels { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.level { display: flex; align-items: baseline; gap: 0.5rem; font-size: 0.82rem; }
.level__step { color: #888; min-width: 3.4rem; }
.level__summary { flex: 1; color: #c0b693; }
.level__score { color: #ffe88e; font-variant-numeric: tabular-nums; }

.locked { color: #9a8fb8; font-size: 0.83rem; margin: 0.4rem 0 0; }
.empty { padding: 3rem 1rem; color: #6c6c7c; text-align: center; }

@media (max-width: 640px) { .chaos-view { padding: 1.2rem; } }
</style>
