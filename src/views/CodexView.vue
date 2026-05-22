<script setup lang="ts">
/**
 * 도감 — 휘발 재화의 영구 기록.
 * 플레이버 텍스트는 사용자 채움 영역.
 */

import { useRouter } from 'vue-router';
import { useCodexStore } from '@/stores/codex';
import { useDataStore } from '@/stores/data';
import { computed, onMounted } from 'vue';

const router = useRouter();
const codex = useCodexStore();
const data = useDataStore();

const groupLabels: Record<string, string> = {
  card: '카드',
  relic: '유물',
  npc: '인물',
  event: '사건',
  boss: '종말',
  timeline: '시대',
};

const grouped = computed(() => codex.byKind);

/** 종류별 데이터 맵 — 도감 항목 id → 정의 조회용. */
function mapFor(kind: string): Map<string, { name: string }> | null {
  switch (kind) {
    case 'card': return data.cards;
    case 'relic': return data.relics;
    case 'npc': return data.npcs;
    case 'event': return data.events;
    case 'boss': return data.bosses;
    case 'timeline': return data.timelines;
    default: return null;
  }
}

/** 영어 id 태그가 아니라 실제 이름을 표시. 정의 누락 시 id로 폴백. */
function displayName(kind: string, id: string): string {
  return mapFor(kind)?.get(id)?.name ?? id;
}

function back() {
  router.push('/main');
}

onMounted(() => {
  // 이름 조회에 데이터가 필요하므로 보장 로드.
  data.ensureLoaded();
});
</script>

<template>
  <main class="codex-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>도감</h1>
    </header>

    <section class="groups">
      <div v-for="(entries, kind) in grouped" :key="kind" class="group">
        <h2>{{ groupLabels[kind] }} ({{ entries.length }})</h2>
        <ul v-if="entries.length > 0" class="entry-list">
          <li v-for="e in entries" :key="`${e.kind}:${e.id}`" class="entry">
            <span class="entry__id">{{ displayName(e.kind, e.id) }}</span>
            <span class="entry__count">×{{ e.encounterCount }}</span>
          </li>
        </ul>
        <p v-else class="empty">—</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.codex-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.4rem; margin-top: 1.5rem; }
.group { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 1rem; }
.group h2 { color: #c08eff; margin: 0 0 0.6rem; font-size: 1.05rem; }
.entry-list { list-style: none; padding: 0; margin: 0; }
.entry { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); color: #b6b6c4; }
.entry__count { color: #6c6c7c; font-variant-numeric: tabular-nums; }
.empty { color: #6c6c7c; margin: 0; }
</style>
