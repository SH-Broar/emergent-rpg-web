<script setup lang="ts">
/**
 * 이벤트 화면 — 선택지 분기.
 *
 * Phase 2c 스텁. Phase 2d에서 event 데이터 로드 + 선택지 처리.
 */

import { useRouter } from 'vue-router';
const router = useRouter();
function back() { router.push('/game/map'); }
</script>

<template>
  <main class="event-view">
    <h1>이벤트 (스텁)</h1>
    <p>Phase 2d에서 본격 구현. 본문 + 선택지 + 분기 효과.</p>
    <button @click="back">← 맵으로 돌아가기</button>
  </main>
</template>

<style scoped>
.event-view { max-width: 700px; margin: 0 auto; padding: 2rem; }
.event-view h1 { color: #8eedff; }
button { padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; margin-top: 1rem; }
</style>
