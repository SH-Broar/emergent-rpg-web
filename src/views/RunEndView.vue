<script setup lang="ts">
/**
 * 런 종료 결과 화면.
 *
 * 시간 만료(time-up), 자유 종료(free-end) 등 *전투/보스가 아닌* 종료에 사용.
 * 메타 변환 결과를 *명시적으로* 보여주고 메인 메뉴로 복귀.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

interface AbsorbResult {
  granted: { key: string }[];
  soulGain: number;
}

const result = ref<AbsorbResult | null>(null);
const timeline = computed(() => data.timelines.get(run.data.timelineId));

const reasonLabel: Record<string, string> = {
  'time-up': '시간이 다 됐다.',
  'free-end': '런을 포기했다.',
  'hp-zero': 'HP가 0이 되었다.',
  'boss-cleared': '보스를 마주하고 살아 돌아왔다.',
  'boss-defeated': '보스에게 무너졌다.',
};

function returnMain() {
  run.reset();
  router.push('/main');
}

onMounted(async () => {
  if (!run.data.ended) {
    router.push('/main');
    return;
  }
  // 메타 변환
  const { absorbRunIntoMeta } = await import('@/systems/progression');
  result.value = absorbRunIntoMeta(run.data);
});
</script>

<template>
  <main class="run-end-view">
    <h1>런 종료</h1>
    <p class="reason">{{ reasonLabel[run.data.endReason ?? ''] ?? '여정이 끝났다.' }}</p>
    <p v-if="timeline" class="tl">— {{ timeline.name }} —</p>

    <section class="stats">
      <div class="stat">
        <span class="stat__label">방문한 노드</span>
        <span class="stat__value">{{ run.data.visitedNodes.length }}개</span>
      </div>
      <div class="stat">
        <span class="stat__label">발견한 카드</span>
        <span class="stat__value">{{ run.data.newCardEncounters.length }}장</span>
      </div>
      <div class="stat">
        <span class="stat__label">발견한 유물</span>
        <span class="stat__value">{{ run.data.newRelicEncounters.length }}개</span>
      </div>
      <div class="stat">
        <span class="stat__label">클리어한 전투</span>
        <span class="stat__value">
          {{ Object.values(run.data.nodeStates).filter((s) => s.combatCleared).length }}회
        </span>
      </div>
    </section>

    <section v-if="result" class="meta">
      <h3>메타 진행</h3>
      <p v-if="result.soulGain > 0">영혼 +{{ result.soulGain }}</p>
      <p v-for="(k, i) in result.granted" :key="i" class="unlock">해금: {{ k.key }}</p>
      <p v-if="result.granted.length === 0 && result.soulGain === 0" class="empty">
        이번 런은 메타에 남기지 못했다.
      </p>
    </section>

    <button class="finish" @click="returnMain">메인 메뉴로 →</button>
  </main>
</template>

<style scoped>
.run-end-view {
  max-width: 560px;
  margin: 0 auto;
  padding: 4rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  min-height: 100vh;
}
h1 { color: #c08eff; margin: 0; font-size: 2.4rem; }
.reason { color: #d6d6e0; font-style: italic; margin: 0; }
.tl { color: #888; margin: 0; }

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
  width: 100%;
  margin-top: 1rem;
}
.stat {
  display: flex;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
}
.stat__label { color: #b6b6c4; }
.stat__value { color: #f6e8b8; font-weight: 600; }

.meta {
  width: 100%;
  margin-top: 1rem;
  padding: 1rem;
  background: rgba(192,142,255,0.08);
  border: 1px solid rgba(192,142,255,0.3);
  border-radius: 6px;
}
.meta h3 { color: #c08eff; margin: 0 0 0.5rem; }
.meta p { color: #d6d6e0; margin: 0.2rem 0; }
.meta .unlock { color: #ffe88e; }
.meta .empty { color: #6c6c7c; font-style: italic; }

.finish {
  margin-top: 1.5rem;
  padding: 0.8rem 1.6rem;
  background: rgba(192,142,255,0.2);
  border: 1px solid rgba(192,142,255,0.5);
  color: inherit;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.finish:hover { background: rgba(192,142,255,0.3); }
</style>
