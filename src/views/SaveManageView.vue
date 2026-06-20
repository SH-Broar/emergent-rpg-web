<script setup lang="ts">
/**
 * 세이브 관리 — 메인 메뉴의 보조 허브.
 *
 * 메인 화면 정보 과다 정리(2026-06-20): 첫 진입에는 게임 시작 / 세이브 코드만 노출하고,
 * 연구·도감·기록·카오스는 이 화면 안으로 수납한다. (메인에서는 "한 번이라도 플레이한 뒤"에만
 * 이 화면 진입 카드가 등장.)
 */

import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';

const router = useRouter();
const meta = useMetaStore();

function back() {
  router.push('/main');
}
function goResearch() {
  router.push('/research');
}
function goCodex() {
  router.push('/codex');
}
function goLog() {
  router.push('/log');
}
function goChaos() {
  router.push('/chaos');
}
</script>

<template>
  <main class="save-manage-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>세이브 관리</h1>
    </header>

    <section class="menu-grid">
      <button class="menu-card" type="button" @click="goResearch">
        <span class="menu-card__title">연구</span>
        <span class="menu-card__sub">진행도 {{ Math.round(meta.compositeRatio * 100) }}%</span>
      </button>

      <button class="menu-card" type="button" @click="goCodex">
        <span class="menu-card__title">도감</span>
        <span class="menu-card__sub">{{ meta.codex.length }}개 항목</span>
      </button>

      <button class="menu-card" type="button" @click="goLog">
        <span class="menu-card__title">기록</span>
        <span class="menu-card__sub">{{ (meta.runHistory ?? []).length }}개의 기록</span>
      </button>

      <button class="menu-card menu-card--chaos" type="button" @click="goChaos">
        <span class="menu-card__title">카오스</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.save-manage-view {
  min-height: 100vh; min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 2rem;
  gap: 2rem;
  max-width: 1100px;
  margin: 0 auto;
}
.hdr h1 { color: #f6e8b8; margin: 0; }
.back {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.2rem;
}
.menu-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.4rem;
  padding: 1.4rem 1.2rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}
.menu-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.25);
}
.menu-card:focus-visible {
  outline: 2px solid #c08eff;
  outline-offset: 2px;
}
.menu-card--chaos {
  background: rgba(255, 80, 80, 0.06);
  border-color: rgba(255, 100, 100, 0.25);
}
.menu-card__title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #f6e8b8;
}
.menu-card__sub {
  font-size: 0.85rem;
  color: #888;
}
</style>
