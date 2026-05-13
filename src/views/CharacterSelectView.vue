<script setup lang="ts">
/**
 * 캐릭터 선택 화면 (게임 시작 2단계).
 *
 * Phase 2c 스텁: 더미 캐릭터 1명만. Phase 2d에서 풀 구현.
 */

import { useRouter } from 'vue-router';

const router = useRouter();

function startRun() {
  // Phase 2d: 실제 run 시작 + map으로 이동
  router.push('/game/map');
}

function back() {
  router.push('/game/timeline-select');
}
</script>

<template>
  <main class="char-view">
    <header class="hdr">
      <button class="back" @click="back">← 시간대 선택</button>
      <h1>캐릭터 선택</h1>
      <p>임페리시아: "그 시대의 누구에게 깃들 것입니까?"</p>
    </header>

    <section class="grid">
      <button class="card" @click="startRun">
        <div class="card__name">테스트 전생자</div>
        <div class="card__race">— 인간 —</div>
        <p class="card__desc">MVR 단계의 더미 캐릭터. Phase 2d에서 본격 캐릭터 풀로 교체.</p>
      </button>
    </section>
  </main>
</template>

<style scoped>
.char-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
.hdr h1 { color: #f6e8b8; }
.hdr p { color: #a4a4b0; font-style: italic; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
.card { padding: 1.4rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: inherit; cursor: pointer; text-align: left; }
.card:hover { background: rgba(255,255,255,0.08); }
.card__name { font-size: 1.2rem; font-weight: 600; color: #f6e8b8; }
.card__race { font-size: 0.9rem; color: #c08eff; margin-bottom: 0.4rem; }
.card__desc { font-size: 0.9rem; color: #b6b6c4; margin: 0; }
</style>
