<script setup lang="ts">
/**
 * 거미줄 노드 맵 화면.
 *
 * Phase 2c 스텁: 안내 메시지만. Phase 2d/2e에서 SVG 그래프 본격 구현.
 */

import { useRouter } from 'vue-router';

const router = useRouter();

function back() { router.push('/main'); }
function goCombat() { router.push('/game/combat'); }
function goEvent() { router.push('/game/event'); }
function goBoss() { router.push('/game/boss'); }
</script>

<template>
  <main class="map-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴 (런 포기)</button>
      <h1>노드 맵 (스텁)</h1>
      <p>Phase 2d/2e에서 SVG 거미줄 그래프로 본격 구현.</p>
    </header>
    <section class="stub-nav">
      <button @click="goCombat">전투 노드로 →</button>
      <button @click="goEvent">이벤트 노드로 →</button>
      <button @click="goBoss">보스 게이트로 →</button>
    </section>
  </main>
</template>

<style scoped>
.map-view { max-width: 900px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
.hdr h1 { color: #f6e8b8; }
.hdr p { color: #a4a4b0; }
.stub-nav { display: flex; gap: 1rem; margin-top: 2rem; }
.stub-nav button { padding: 0.8rem 1.4rem; background: rgba(192,142,255,0.15); border: 1px solid rgba(192,142,255,0.4); color: #f6e8b8; border-radius: 6px; cursor: pointer; }
.stub-nav button:hover { background: rgba(192,142,255,0.25); }
</style>
