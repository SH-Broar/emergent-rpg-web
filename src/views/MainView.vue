<script setup lang="ts">
/**
 * 메인 메뉴.
 *
 * spec v2 Round 12: 3 메뉴 — 게임 시작 / 연구 / 버그
 * (+ 도감은 별도 메뉴로 추가)
 *
 * 외부 프레임 서사: 시간의 신 모노와 임페리시아가 전생자를 맞이하는 공간.
 */

import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';

const router = useRouter();
const meta = useMetaStore();

function goTimelineSelect() {
  router.push('/game/timeline-select');
}
function goResearch() {
  router.push('/research');
}
function goBug() {
  router.push('/bug');
}
function goCodex() {
  router.push('/codex');
}
</script>

<template>
  <main class="main-view">
    <header class="hero">
      <h1 class="title">RDC<span class="title-sub">: 시간의 신탁</span></h1>
      <p class="tagline">
        시간의 신 <strong>모노</strong>가 그대를 부른다. <strong>임페리시아</strong>가 안내하는
        시간대의 갈림길로.
      </p>
    </header>

    <section class="menu-grid">
      <button class="menu-card menu-card--primary" type="button" @click="goTimelineSelect">
        <span class="menu-card__title">게임 시작</span>
        <span class="menu-card__desc">시간대를 선택하고 캐릭터를 골라 전생합니다.</span>
      </button>

      <button class="menu-card" type="button" @click="goResearch">
        <span class="menu-card__title">연구</span>
        <span class="menu-card__desc">
          모노의 세계 간섭 강도 · 해금 노드 트리.
          <span class="menu-card__sub">총 진행도 {{ Math.round(meta.compositeRatio * 100) }}%</span>
        </span>
      </button>

      <button class="menu-card" type="button" @click="goCodex">
        <span class="menu-card__title">도감</span>
        <span class="menu-card__desc">
          만난 인물 · 사용한 카드 · 얻은 유물의 기록.
          <span class="menu-card__sub">{{ meta.codex.length }}개 항목</span>
        </span>
      </button>

      <button class="menu-card menu-card--debug" type="button" @click="goBug">
        <span class="menu-card__title">버그</span>
        <span class="menu-card__desc">특수 효과 토글 (개발자 모드).</span>
      </button>
    </section>

    <footer class="legacy-note">
      <small>총 {{ meta.totalRuns }}회 전생 · 보스 클리어 {{ meta.totalBossClears }}회</small>
    </footer>
  </main>
</template>

<style scoped>
.main-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
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
.title-sub {
  font-size: 1.4rem;
  color: #c0b693;
  margin-left: 0.4rem;
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

.menu-card--debug {
  background: rgba(255, 80, 80, 0.08);
  border-color: rgba(255, 100, 100, 0.3);
}

.menu-card__title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #f6e8b8;
}
.menu-card__desc {
  font-size: 0.9rem;
  color: #b6b6c4;
  line-height: 1.4;
}
.menu-card__sub {
  display: block;
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.2rem;
}

.legacy-note {
  text-align: center;
  color: #6c6c7c;
}
</style>
