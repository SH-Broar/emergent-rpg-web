<script setup lang="ts">
/**
 * 공방 화면 — 더 좋은 카드 + 카드 강화 (placeholder).
 *
 * 사용자 정의 (Step C):
 *   - 마을: 랜덤·저렴·일반 등급
 *   - 공방: 선택·비쌈·희귀+전설 + *카드 강화*
 *
 * 본격 메커니즘(특히 강화 방식)은 다음 라운드 분기 결정 후 구현.
 */

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

function leave() {
  router.push('/game/map');
}
</script>

<template>
  <main class="workshop-view">
    <header class="hdr">
      <button class="back" @click="leave">← 맵으로</button>
      <h1>{{ currentNode?.label ?? '공방' }}</h1>
    </header>

    <p v-if="currentNode?.description" class="desc">{{ currentNode.description }}</p>

    <div class="resources">
      <span>HP {{ run.data.hp }}/{{ run.data.maxHp }}</span>
      <span>골드 {{ run.data.gold }}</span>
      <span>시간의 조각 {{ run.data.timeShards }}</span>
    </div>

    <section class="placeholder">
      <p>여기에 공방 인터페이스가 들어옵니다.</p>
      <ul class="todo">
        <li>희귀·전설 카드 선택 제작 (시간의 조각 비싼 비용)</li>
        <li>카드 강화 (메커니즘 분기 결정 후)</li>
      </ul>
    </section>

    <button class="leave" @click="leave">떠나기</button>
  </main>
</template>

<style scoped>
.workshop-view { max-width: 720px; margin: 0 auto; padding: 2rem; min-height: 100vh; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #c08eff; margin: 0; }
.desc { color: #b6b6c4; font-style: italic; margin: 0.6rem 0 1.5rem; }
.resources { display: flex; gap: 1rem; padding: 0.6rem 1rem; background: rgba(0,0,0,0.4); border-radius: 6px; color: #b6b6c4; font-size: 0.9rem; margin-bottom: 1.5rem; }
.placeholder { padding: 2rem; background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.2); border-radius: 8px; color: #888; }
.placeholder p { margin: 0 0 0.8rem; }
.todo { padding-left: 1.2rem; margin: 0; color: #b6b6c4; }
.todo li { padding: 0.2rem 0; }
.leave { margin-top: 1.5rem; padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; }
</style>
