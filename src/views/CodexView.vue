<script setup lang="ts">
/**
 * 도감 화면.
 *
 * spec v2 Round 11: 한 런의 휘발 재화 (카드/유물/만난 NPC/보스/이벤트)가
 * 영구 기록되는 곳. "흔적이 누적되는 주인공" 비전의 수집적 표현.
 */

import { useRouter } from 'vue-router';
import { useCodexStore } from '@/stores/codex';
import { computed } from 'vue';

const router = useRouter();
const codex = useCodexStore();

const groupLabels: Record<string, string> = {
  card: '카드',
  relic: '유물',
  npc: '만난 인물',
  event: '겪은 사건',
  boss: '도전한 종말',
  timeline: '방문한 시대',
};

const grouped = computed(() => codex.byKind);

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="codex-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>도감 — 전생자의 흔적</h1>
      <p>그동안 마주친 모든 것이 여기에 남습니다.</p>
    </header>

    <section class="groups">
      <div v-for="(entries, kind) in grouped" :key="kind" class="group">
        <h2>{{ groupLabels[kind] }} ({{ entries.length }})</h2>
        <ul v-if="entries.length > 0" class="entry-list">
          <li v-for="e in entries" :key="`${e.kind}:${e.id}`" class="entry">
            <span class="entry__id">{{ e.id }}</span>
            <span class="entry__count">×{{ e.encounterCount }}</span>
          </li>
        </ul>
        <p v-else class="empty">아직 마주친 적이 없습니다.</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.codex-view {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
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
.hdr h1 {
  color: #f6e8b8;
}
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.4rem;
  margin-top: 1.5rem;
}
.group {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 1rem;
}
.group h2 {
  color: #c08eff;
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}
.entry-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.entry {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: #b6b6c4;
}
.entry__count {
  color: #6c6c7c;
  font-variant-numeric: tabular-nums;
}
.empty {
  color: #6c6c7c;
  font-style: italic;
  margin: 0;
}
</style>
