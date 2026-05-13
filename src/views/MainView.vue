<script setup lang="ts">
/**
 * 메인 메뉴.
 *
 * 4 메뉴 — 게임 시작 / 연구 / 도감 / 버그.
 *  - 연구: 영구 해금 시스템 (메타 진행, 되돌아가지 않음)
 *  - 버그: 매 판 열었다 닫았다 할 수 있는 특수 기능 토글
 *
 * 플레이버 텍스트는 사용자가 직접 채울 영역으로 비워둠.
 * (제목·도입문구·메뉴 설명 등)
 */

import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';

const router = useRouter();
const meta = useMetaStore();

// === 플레이버 텍스트 (사용자 채움 영역) ===
// 비워두면 화면에 표시되지 않음.
const TITLE = 'RDC';     // 빌드 식별용 제목. (변경 시 확실히 새 빌드인지 시각 확인.)
const TAGLINE = '';      // 예: 도입 문구

/** 빌드 버전 — vite.config.ts에서 commit count 주입. */
const VERSION = `v.${__APP_VERSION__}`;

function goTimelineSelect() {
  router.push('/game/timeline-select');
}
function goResearch() {
  router.push('/research');
}
function goChaos() {
  router.push('/chaos');
}
function goCodex() {
  router.push('/codex');
}
</script>

<template>
  <main class="main-view">
    <header v-if="TITLE || TAGLINE" class="hero">
      <h1 v-if="TITLE" class="title">{{ TITLE }}</h1>
      <p v-if="TAGLINE" class="tagline">{{ TAGLINE }}</p>
    </header>

    <section class="menu-grid">
      <button class="menu-card menu-card--primary" type="button" @click="goTimelineSelect">
        <span class="menu-card__title">게임 시작</span>
      </button>

      <button class="menu-card" type="button" @click="goResearch">
        <span class="menu-card__title">연구</span>
        <span class="menu-card__sub">진행도 {{ Math.round(meta.compositeRatio * 100) }}%</span>
      </button>

      <button class="menu-card" type="button" @click="goCodex">
        <span class="menu-card__title">도감</span>
        <span class="menu-card__sub">{{ meta.codex.length }}개 항목</span>
      </button>

      <button class="menu-card menu-card--chaos" type="button" @click="goChaos">
        <span class="menu-card__title">카오스</span>
      </button>
    </section>

    <footer class="legacy-note">
      <small>전생 {{ meta.totalRuns }} · 보스 클리어 {{ meta.totalBossClears }}</small>
    </footer>

    <!-- 빌드 버전 — 우하단 고정. 새 빌드 배포 확인용. -->
    <div class="version-badge" :title="`빌드 버전 ${VERSION}`">{{ VERSION }}</div>
  </main>
</template>

<style scoped>
.main-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem 2rem;
  gap: 3rem;
  max-width: 1100px;
  margin: 0 auto;
}

.hero {
  text-align: center;
}
.title {
  font-size: 3rem;
  margin: 0 0 0.4rem;
  letter-spacing: 0.1em;
  color: #f6e8b8;
}
.tagline {
  color: #a4a4b0;
  font-size: 1.05rem;
  margin: 0;
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

.menu-card--primary {
  background: linear-gradient(135deg, #2a1c4a, #1a3a5a);
  border-color: rgba(180, 140, 255, 0.4);
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

.legacy-note {
  text-align: center;
  color: #6c6c7c;
}

.version-badge {
  position: fixed;
  right: 0.8rem;
  bottom: 0.6rem;
  font-size: 0.72rem;
  color: #6c6c7c;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  background: rgba(0, 0, 0, 0.35);
  padding: 0.18rem 0.5rem;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: none;
  user-select: none;
}
</style>
