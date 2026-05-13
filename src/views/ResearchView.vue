<script setup lang="ts">
/**
 * 연구 — 영구 해금 시스템 (5게이지 + 해금 노드 트리).
 *
 * 한 번 오른 진행은 *되돌아가지 않는다*. (cf. 버그는 매 판 토글)
 * 플레이버 텍스트는 사용자가 직접 채울 영역.
 */

import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';
import { computed } from 'vue';

const router = useRouter();
const meta = useMetaStore();

interface GaugeDisplay {
  key: keyof typeof meta.gauges;
  label: string;
  color: string;
}

// === 게이지 라벨 (사용자가 자유롭게 수정) ===
const gauges: GaugeDisplay[] = [
  { key: 'hyperion1', label: '히페리온 ①', color: '#c08eff' },
  { key: 'hyperion2', label: '히페리온 ②', color: '#ffb88e' },
  { key: 'insight1', label: '해석 ①', color: '#8eedff' },
  { key: 'insight2', label: '해석 ②', color: '#ff8e8e' },
  { key: 'composite', label: '종합 진행도', color: '#ffe88e' },
];

const percent = computed(() => (v: number, max: number) => {
  return Math.min(100, Math.round((v / Math.max(1, max)) * 100));
});

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="research-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>연구</h1>
    </header>

    <section class="gauges">
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
          <div
            v-for="(t, i) in meta.gauges[g.key].unlockThresholds"
            :key="i"
            class="gauge__threshold"
            :style="{ left: (t * 100) + '%' }"
          />
        </div>
      </div>
    </section>

    <section class="meta-info">
      <p>영혼 자원: <strong>{{ meta.soulResource }}</strong></p>
      <p>해금 캐릭터: <strong>{{ meta.unlockedCharacterIds.length }}</strong></p>
      <p>해금 시간대: <strong>{{ meta.unlockedTimelineIds.length }}</strong></p>
      <p>해금 토큰: <strong>{{ meta.unlockedKeys.length }}</strong></p>
    </section>
  </main>
</template>

<style scoped>
.research-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.hdr { margin-bottom: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.gauges { display: flex; flex-direction: column; gap: 1.4rem; }
.gauge { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; }
.gauge__head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.5rem; }
.gauge__label { font-weight: 600; }
.gauge__num { color: #888; font-variant-numeric: tabular-nums; font-size: 0.85rem; }
.gauge__bar { position: relative; height: 10px; background: rgba(0,0,0,0.4); border-radius: 5px; overflow: hidden; }
.gauge__fill { position: absolute; inset: 0 auto 0 0; transition: width 360ms ease; }
.gauge__threshold { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.4); }
.meta-info { margin-top: 2rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.6rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px; }
.meta-info p { margin: 0; color: #b6b6c4; }
.meta-info strong { color: #f6e8b8; }
</style>
