<script setup lang="ts">
/**
 * 보스전 화면.
 *
 * Phase 2c 스텁. Phase 2d에서 연표 종말 위협 + 시그니처 양상 통합.
 */

import { useRouter } from 'vue-router';
const router = useRouter();
function back() { router.push('/game/map'); }
</script>

<template>
  <main class="boss-view">
    <h1>보스전 (스텁)</h1>
    <p>Phase 2d에서 본격 구현. 연표별 종말 위협 + 캐릭터별 시그니처 양상.</p>
    <button @click="back">← 맵으로 돌아가기</button>
  </main>
</template>

<style scoped>
.boss-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.boss-view h1 { color: #ffe88e; }
button { padding: 0.6rem 1.2rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); color: inherit; border-radius: 6px; cursor: pointer; margin-top: 1rem; }
</style>
