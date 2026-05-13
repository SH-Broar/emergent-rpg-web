<script setup lang="ts">
/**
 * 이벤트 화면 — 노드의 이벤트 풀에서 추첨 + 선택지 표시.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { pickEvent, selectChoice } from '@/systems/event-runner';
import type { Event, EventChoice } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const currentEvent = ref<Event | undefined>();
const resultText = ref<string | null>(null);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

const pool = computed<Event[]>(() => {
  const node = currentNode.value;
  if (!node) return [];
  return (node.contentRef?.eventIdPool ?? [])
    .map((id: string) => data.events.get(id))
    .filter((e: Event | undefined): e is Event => e !== undefined);
});

function choose(c: EventChoice) {
  resultText.value = selectChoice(c);
}

function leave() {
  router.push('/game/map');
}

onMounted(() => {
  currentEvent.value = pickEvent(pool.value);
  // 이벤트가 추첨됐다면 *발생 마킹* — 재방문 시 이 이벤트는 다시 안 나옴.
  if (currentEvent.value) {
    run.markEventTriggered(run.data.currentNodeId, currentEvent.value.id);
  }
});
</script>

<template>
  <main class="event-view">
    <article v-if="currentEvent" class="event">
      <h1>{{ currentEvent.name }}</h1>
      <p class="body">{{ currentEvent.body }}</p>

      <div v-if="!resultText" class="choices">
        <button
          v-for="(c, i) in currentEvent.choices"
          :key="i"
          class="choice"
          @click="choose(c)"
        >
          {{ c.label }}
        </button>
      </div>

      <div v-else class="result">
        <p>{{ resultText }}</p>
        <button class="leave" @click="leave">계속 →</button>
      </div>
    </article>
    <p v-else class="empty">이 자리엔 이야기가 없습니다…</p>
  </main>
</template>

<style scoped>
.event-view { max-width: 720px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; }
.event h1 { color: #8eedff; margin-bottom: 1rem; }
.body { white-space: pre-line; line-height: 1.8; color: #d6d6e0; margin-bottom: 2rem; }
.choices { display: flex; flex-direction: column; gap: 0.7rem; }
.choice { padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; }
.choice:hover { background: rgba(142,237,255,0.1); border-color: rgba(142,237,255,0.4); }
.result { margin-top: 2rem; padding: 1.2rem; background: rgba(0,0,0,0.4); border-left: 3px solid #8eedff; border-radius: 4px; }
.result p { white-space: pre-line; color: #d6d6e0; margin-bottom: 1rem; }
.leave { padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; }
.empty { text-align: center; padding: 4rem; color: #6c6c7c; font-style: italic; }
</style>
