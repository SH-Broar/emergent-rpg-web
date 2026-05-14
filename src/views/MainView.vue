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

import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';

const router = useRouter();
const meta = useMetaStore();
const run = useRunStore();
const data = useDataStore();

/** 저장된 런이 있으면 modal 띄움 — 사용자가 Y/N 선택. */
const showResume = ref(false);

onMounted(async () => {
  // 데이터가 아직이면 기다림 (resume이 의미 있으려면 timelines/cards 로드 필요).
  await data.ensureLoaded();
  if (run.hasSavedRun()) showResume.value = true;
  window.addEventListener('keydown', onResumeKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onResumeKey);
});

/** 사용자 사양: Y/N 키로 즉시 응답. modal 떠 있을 때만 작동. */
function onResumeKey(e: KeyboardEvent) {
  if (!showResume.value) return;
  const k = e.key.toLowerCase();
  if (k === 'y' || k === 'enter') {
    e.preventDefault();
    resumeRun();
  } else if (k === 'n' || k === 'escape') {
    e.preventDefault();
    discardRun();
  }
}

function resumeRun() {
  if (!run.loadActiveRun()) {
    // 손상된 스냅샷 — 정리하고 modal 닫음.
    run.clearSavedRun();
    showResume.value = false;
    return;
  }
  showResume.value = false;
  // 전투 중 저장이면 그 전투로 복귀, 아니면 맵.
  router.push(run.data.combat ? '/game/combat' : '/game/map');
}

function discardRun() {
  run.clearSavedRun();
  showResume.value = false;
}

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

    <!-- 이어하기 modal — 저장된 런 발견 시 Y/N 묻기. -->
    <transition name="resume-fade">
      <div v-if="showResume" class="resume-backdrop" role="dialog" aria-modal="true">
        <div class="resume-modal">
          <h2 class="resume-modal__title">진행 중인 런이 있습니다</h2>
          <p class="resume-modal__body">이어서 시작하시겠습니까? (N을 누르면 저장된 진행이 삭제됩니다)</p>
          <div class="resume-modal__actions">
            <button class="resume-btn resume-btn--yes" autofocus @click="resumeRun">Y — 이어하기</button>
            <button class="resume-btn resume-btn--no" @click="discardRun">N — 새로 시작</button>
          </div>
        </div>
      </div>
    </transition>
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

/* 이어하기 modal */
.resume-backdrop {
  position: fixed;
  inset: 0;
  z-index: 980;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.resume-modal {
  max-width: 460px;
  width: 100%;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1.5rem 1.6rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  display: grid;
  gap: 0.9rem;
  text-align: center;
}
.resume-modal__title {
  color: #f6e8b8;
  margin: 0;
  font-size: 1.2rem;
}
.resume-modal__body {
  color: #b6b6c4;
  margin: 0;
  font-size: 0.92rem;
}
.resume-modal__actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 0.4rem;
}
.resume-btn {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  border: 1px solid transparent;
  transition: filter 120ms ease, transform 120ms ease;
}
.resume-btn--yes {
  background: linear-gradient(180deg, #c0b693 0%, #a39872 100%);
  color: #1a1a26;
}
.resume-btn--no {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.18);
  color: #b6b6c4;
}
.resume-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.resume-fade-enter-active, .resume-fade-leave-active {
  transition: opacity 200ms ease;
}
.resume-fade-enter-from, .resume-fade-leave-to {
  opacity: 0;
}
</style>
