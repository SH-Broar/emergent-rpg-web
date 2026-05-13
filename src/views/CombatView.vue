<script setup lang="ts">
/**
 * 전투 화면 — 덱빌딩 전투.
 *
 * Phase 2c 스텁. Phase 2d에서 systems/combat.ts와 통합.
 */

import { useRouter } from 'vue-router';
const router = useRouter();
function back() { router.push('/game/map'); }
</script>

<template>
  <main class="combat-view">
    <h1>전투 (스텁)</h1>
    <p>Phase 2d에서 본격 구현. 덱 셔플 / 핸드 드로우 / 카드 사용 / 적 행동.</p>
    <button @click="back">← 맵으로 돌아가기</button>
  </main>
</template>

<style scoped>
.combat-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.combat-view h1 { color: #ff8e8e; }
button { padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; margin-top: 1rem; }
</style>
