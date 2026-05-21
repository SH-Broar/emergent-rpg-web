<script setup lang="ts">
/**
 * 연표 선택 — 가로 선 + 원 노드.
 *
 * M7 (2026-05-15):
 *   기존 SVG `preserveAspectRatio="none"`이 viewBox 비율을 무시해 원이 *타원*으로 깨졌다.
 *   해법: SVG 폐기 → CSS 그리드 + fixed-size DOM 노드(`<button class="node">`).
 *   원은 width/height 동일한 px → 어떤 컨테이너 비율에서도 정원 유지.
 */

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { canEnterTimeline } from '@/frame/Mono';
import type { Timeline } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();

const timelines = computed<Timeline[]>(() =>
  Array.from(data.timelines.values()).sort((a, b) => a.year - b.year),
);

const selectedId = ref<string | null>(null);

watch(
  timelines,
  (list) => {
    if (!selectedId.value && list.length > 0) selectedId.value = list[0].id;
  },
  { immediate: true },
);

const selected = computed<Timeline | null>(() => {
  if (!selectedId.value) return null;
  return timelines.value.find((t) => t.id === selectedId.value) ?? null;
});

/** 노드 좌측 % 좌표 — 균등 분배, 양쪽 패딩. */
function nodeLeftPct(index: number, total: number): number {
  if (total <= 1) return 50;
  const pad = 12;
  return pad + ((100 - pad * 2) * index) / (total - 1);
}

function selectTimeline(id: string) {
  if (!canEnterTimeline(id)) {
    ui.toast('warning', '잠긴 시대입니다.');
    return;
  }
  ui.pendingRunSetup.timelineId = id;
  // 흐름: 시간대 → 종족 → 카오스 → 게임 시작.
  ui.pendingRunSetup.raceId = null;
  ui.pendingRunSetup.activeChaos = [];
  router.push('/game/race-select');
}

function focus(id: string) {
  selectedId.value = id;
}

function back() {
  router.push('/main');
}

const isLocked = (id: string) => !canEnterTimeline(id);
</script>

<template>
  <main class="tl-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>연표 선택</h1>
      <p class="sub">한 연표를 골라 — 그 시대의 단면으로 깃들어 간다.</p>
    </header>

    <section v-if="timelines.length > 0" class="timeline-rail">
      <!-- DOM 기반 레일: 가로 선 + 원 노드. SVG preserveAspectRatio 비등방 늘림 회피. -->
      <div class="rail" role="tablist" aria-label="연표">
        <div class="rail-line" aria-hidden="true" />
        <button
          v-for="(t, i) in timelines"
          :key="t.id"
          class="rail-node"
          :class="{ 'rail-node--active': t.id === selectedId, 'rail-node--locked': isLocked(t.id) }"
          :style="{ left: nodeLeftPct(i, timelines.length) + '%' }"
          role="tab"
          :aria-selected="t.id === selectedId"
          :aria-disabled="isLocked(t.id)"
          @mouseenter="focus(t.id)"
          @click="focus(t.id)"
        >
          <span class="rail-node__halo" aria-hidden="true" />
          <span class="rail-node__dot" aria-hidden="true" />
          <span class="rail-node__label">{{ t.year }}년</span>
        </button>
      </div>

      <!-- 설명 패널 (선택된 연표) -->
      <transition name="panel">
        <article v-if="selected" :key="selected.id" class="panel">
          <header class="panel__hdr">
            <span class="panel__era">{{ selected.era ?? '—' }}</span>
            <h2 class="panel__name">{{ selected.name }}</h2>
            <p v-if="selected.tagline" class="panel__tagline">{{ selected.tagline }}</p>
          </header>

          <p class="panel__desc">{{ selected.description }}</p>

          <dl class="panel__meta">
            <div>
              <dt>제한 시간</dt>
              <dd>{{ selected.timeLimit }}턴</dd>
            </div>
            <div>
              <dt>덱 확장</dt>
              <dd>{{ selected.deckExpansionThresholds[0] }} / {{ selected.deckExpansionThresholds[1] }}</dd>
            </div>
            <div>
              <dt>선택 종족</dt>
              <dd>{{ selected.availableRaceIds.length }}</dd>
            </div>
            <div>
              <dt>등장 NPC</dt>
              <dd>{{ selected.availableNpcIds.length }}</dd>
            </div>
          </dl>

          <p class="panel__mission">
            <strong>미션 —</strong> {{ selected.missionGoal }}
          </p>

          <footer class="panel__cta">
            <button
              class="enter"
              :disabled="isLocked(selected.id)"
              @click="selectTimeline(selected.id)"
            >
              {{ isLocked(selected.id) ? '잠긴 시대' : '이 연표에 깃든다' }}
            </button>
          </footer>
        </article>
      </transition>
    </section>

    <section v-else class="empty">
      <p>—</p>
    </section>
  </main>
</template>

<style scoped>
.tl-view { max-width: 1100px; margin: 0 auto; padding: 2rem; }

.back {
  background: none;
  border: 1px solid rgba(255,255,255,0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.hdr h1 { color: #f6e8b8; margin: 0; }
.hdr .sub { color: #888; margin: 0.4rem 0 1.6rem; font-size: 0.92rem; }

.timeline-rail {
  display: grid;
  grid-template-columns: 1fr;
  gap: 2.4rem;
}

/* 레일: 가로 선 + 절대 위치 원 노드. */
.rail {
  position: relative;
  width: 100%;
  height: 110px;
  user-select: none;
}
.rail-line {
  position: absolute;
  top: 50%;
  left: 6%;
  right: 6%;
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-50%);
  pointer-events: none;
}

/* 노드 — fixed-size DOM 버튼. 컨테이너 비율과 무관하게 정원. */
.rail-node {
  position: absolute;
  top: 50%;
  /* :style의 left가 노드 중심 좌표 → -50% 평행이동 */
  transform: translate(-50%, -50%);
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font: inherit;
}
.rail-node__halo {
  position: absolute;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid rgba(246, 232, 184, 0.25);
  background: rgba(246, 232, 184, 0);
  transition: background 220ms ease, border-color 220ms ease, width 220ms ease, height 220ms ease;
}
.rail-node__dot {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #c0b693;
  transition: background 220ms ease, transform 220ms ease;
}
.rail-node__label {
  position: absolute;
  bottom: -1.4rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.78rem;
  color: #888;
  white-space: nowrap;
  transition: color 220ms ease;
}

.rail-node:hover .rail-node__halo,
.rail-node--active .rail-node__halo {
  background: rgba(246, 232, 184, 0.10);
  border-color: rgba(246, 232, 184, 0.7);
  width: 50px;
  height: 50px;
}
.rail-node:hover .rail-node__dot,
.rail-node--active .rail-node__dot {
  background: #f6e8b8;
}
.rail-node:hover .rail-node__label,
.rail-node--active .rail-node__label {
  color: #f6e8b8;
}

.rail-node--locked { cursor: not-allowed; }
.rail-node--locked .rail-node__dot { background: #555; }
.rail-node--locked .rail-node__halo { border-color: rgba(255, 255, 255, 0.08); }
.rail-node--locked .rail-node__label { color: #555; }
.rail-node--locked:hover .rail-node__halo {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

/* 설명 패널 */
.panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 1.6rem 1.8rem;
  color: inherit;
  display: grid;
  gap: 1rem;
}
.panel__hdr { display: grid; gap: 0.3rem; }
.panel__era {
  font-size: 0.78rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #c0b693;
}
.panel__name { color: #f6e8b8; margin: 0; font-size: 1.6rem; font-weight: 600; }
.panel__tagline { color: #a59f88; margin: 0; font-style: italic; }

.panel__desc { color: #bdb6a0; line-height: 1.6; margin: 0; }

.panel__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.6rem 1rem;
  margin: 0;
}
.panel__meta div { display: grid; gap: 0.1rem; }
.panel__meta dt { font-size: 0.7rem; color: #888; letter-spacing: 0.06em; }
.panel__meta dd { color: #f6e8b8; margin: 0; font-weight: 500; }

.panel__mission {
  background: rgba(0,0,0,0.25);
  border-left: 2px solid rgba(246, 232, 184, 0.45);
  padding: 0.6rem 0.9rem;
  margin: 0;
  color: #d6cfb8;
  font-size: 0.92rem;
}
.panel__mission strong { color: #f6e8b8; }

.panel__cta { display: flex; justify-content: flex-end; }
.enter {
  background: linear-gradient(180deg, #c0b693 0%, #a39872 100%);
  color: #1a1a26;
  border: none;
  padding: 0.7rem 1.4rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: transform 120ms ease, filter 120ms ease;
}
.enter:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.06); }
.enter:disabled { opacity: 0.4; cursor: not-allowed; }

.empty { text-align: center; padding: 4rem 2rem; color: #6c6c7c; }

/* 패널 전환 애니메이션 */
.panel-enter-active, .panel-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.panel-enter-from { opacity: 0; transform: translateY(6px); }
.panel-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 640px) {
  .tl-view { padding: 1.2rem; }
  .rail { height: 90px; }
  .rail-node { width: 48px; height: 48px; }
  .rail-node__halo { width: 38px; height: 38px; }
  .rail-node__dot { width: 18px; height: 18px; }
  .rail-node:hover .rail-node__halo,
  .rail-node--active .rail-node__halo { width: 44px; height: 44px; }
  .rail-node__label { font-size: 0.72rem; bottom: -1.3rem; }
}
</style>
