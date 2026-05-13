<script setup lang="ts">
/**
 * 연구 화면 — 5게이지 시각화 + 해금 노드 트리.
 *
 * spec v2 Round 11/12: 히페리온 ① ② + 해석 ① ② + 종합 = 5게이지.
 * Phase 2에서는 *시각화 스텁*만. Phase 4에서 해금 노드 트리 본격 구현.
 */

import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';
import { computed } from 'vue';

const router = useRouter();
const meta = useMetaStore();

interface GaugeDisplay {
  key: keyof typeof meta.gauges;
  label: string;
  description: string;
  color: string;
}

const gauges: GaugeDisplay[] = [
  {
    key: 'hyperion1',
    label: '히페리온 ① — 시그니처',
    description: '각 캐릭터의 5단계 미션을 얼마나 클리어해왔는가',
    color: '#c08eff',
  },
  {
    key: 'hyperion2',
    label: '히페리온 ② — 친밀의 깊이',
    description: '시대의 NPC들과 얼마나 친해졌는가',
    color: '#ffb88e',
  },
  {
    key: 'insight1',
    label: '해석 ① — 시대 미션',
    description: '그 시대가 안긴 과제를 얼마나 풀어냈는가',
    color: '#8eedff',
  },
  {
    key: 'insight2',
    label: '해석 ② — 종말 위협',
    description: '그 시대의 보스를 얼마나 마주했는가',
    color: '#ff8e8e',
  },
  {
    key: 'composite',
    label: '종합 — 모노의 세계 간섭',
    description: '위 4개의 함수. 새 시간대와 캐릭터가 풀려나는 척도',
    color: '#ffe88e',
  },
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
      <h1>연구 — 모노의 세계 간섭</h1>
      <p>임페리시아: "더 많은 시간이 그분을 부른다. 더 풀려나는 가능성이…"</p>
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
          <!-- 임계 마커 -->
          <div
            v-for="(t, i) in meta.gauges[g.key].unlockThresholds"
            :key="i"
            class="gauge__threshold"
            :style="{ left: (t * 100) + '%' }"
          />
        </div>
        <p class="gauge__desc">{{ g.description }}</p>
      </div>
    </section>

    <section class="meta-info">
      <p>영혼 자원: <strong>{{ meta.soulResource }}</strong></p>
      <p>해금된 캐릭터: <strong>{{ meta.unlockedCharacterIds.length }}</strong></p>
      <p>해금된 시간대: <strong>{{ meta.unlockedTimelineIds.length }}</strong></p>
      <p>해금 토큰: <strong>{{ meta.unlockedKeys.length }}</strong></p>
    </section>
  </main>
</template>

<style scoped>
.research-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.hdr {
  margin-bottom: 2rem;
}
.back {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.back:hover {
  background: rgba(255, 255, 255, 0.08);
}

h1 {
  color: #f6e8b8;
  margin: 0 0 0.4rem;
}
.hdr p {
  color: #a4a4b0;
  font-style: italic;
  margin: 0;
}

.gauges {
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
}
.gauge {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
}
.gauge__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5rem;
}
.gauge__label {
  font-weight: 600;
}
.gauge__num {
  color: #888;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.gauge__bar {
  position: relative;
  height: 10px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 5px;
  overflow: hidden;
}
.gauge__fill {
  position: absolute;
  inset: 0 auto 0 0;
  transition: width 360ms ease;
}
.gauge__threshold {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(255, 255, 255, 0.4);
}
.gauge__desc {
  color: #888;
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
}

.meta-info {
  margin-top: 2rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}
.meta-info p {
  margin: 0;
  color: #b6b6c4;
}
.meta-info strong {
  color: #f6e8b8;
}
</style>
