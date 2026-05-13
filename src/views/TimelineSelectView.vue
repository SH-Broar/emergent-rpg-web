<script setup lang="ts">
/**
 * 연표 선택 — 가로 선 + 원 노드.
 * 클릭 시 우측(또는 하단)에 *애니메이션 설명 패널*이 나타난다.
 *
 * 구조는 *여러 연표 확장 가능* — 현재 1장 하나만 노출되지만, 노드는
 * timeline.year 오름차순으로 가로축에 놓인다.
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

/** 노출할 연표 — year 오름차순. */
const timelines = computed<Timeline[]>(() =>
  Array.from(data.timelines.values()).sort((a, b) => a.year - b.year),
);

/** 현재 선택 (호버/클릭) — 패널에 설명을 표시. */
const selectedId = ref<string | null>(null);

/** 첫 진입 시 기본 선택: 첫 항목. */
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

/** 가로축 노드 좌표 계산 (균등 분배, 양쪽 패딩). */
function nodeX(index: number, total: number): number {
  if (total <= 1) return 50; // 단일 노드는 중앙
  const pad = 12; // % 패딩
  return pad + ((100 - pad * 2) * index) / (total - 1);
}

function selectTimeline(id: string) {
  if (!canEnterTimeline(id)) {
    ui.toast('warning', '잠긴 시대입니다.');
    return;
  }
  ui.pendingRunSetup.timelineId = id;
  router.push('/game/character-select');
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
      <!-- 가로 선 + 노드 -->
      <svg class="rail-svg" viewBox="0 0 100 18" preserveAspectRatio="none">
        <!-- 기본 선 -->
        <line x1="6" y1="9" x2="94" y2="9" class="rail-line" />

        <!-- 각 노드 -->
        <g v-for="(t, i) in timelines" :key="t.id" :class="['node-group', { active: t.id === selectedId, locked: isLocked(t.id) }]"
           @mouseenter="focus(t.id)"
           @click="focus(t.id)">
          <!-- 외곽 후광 -->
          <circle :cx="nodeX(i, timelines.length)" cy="9" r="3.6" class="node-halo" />
          <!-- 본체 -->
          <circle :cx="nodeX(i, timelines.length)" cy="9" r="2.2" class="node-dot" />
          <!-- 라벨 -->
          <text :x="nodeX(i, timelines.length)" y="16" class="node-label" text-anchor="middle">
            {{ t.year }}년
          </text>
        </g>
      </svg>

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
              <dt>등장 캐릭터</dt>
              <dd>{{ selected.availableCharacterIds.length }}</dd>
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

.rail-svg {
  width: 100%;
  height: 120px;
  display: block;
  user-select: none;
}

.rail-line {
  stroke: rgba(255,255,255,0.12);
  stroke-width: 0.4;
}

.node-group { cursor: pointer; }
.node-halo {
  fill: rgba(246, 232, 184, 0.0);
  stroke: rgba(246, 232, 184, 0.25);
  stroke-width: 0.25;
  transition: fill 220ms ease, stroke 220ms ease, r 220ms ease;
}
.node-dot {
  fill: #c0b693;
  transition: fill 220ms ease, transform 220ms ease;
}
.node-label {
  font-size: 3.2px;
  fill: #888;
  transition: fill 220ms ease;
}

.node-group:hover .node-halo,
.node-group.active .node-halo {
  fill: rgba(246, 232, 184, 0.10);
  stroke: rgba(246, 232, 184, 0.7);
}
.node-group:hover .node-dot,
.node-group.active .node-dot {
  fill: #f6e8b8;
}
.node-group:hover .node-label,
.node-group.active .node-label {
  fill: #f6e8b8;
}
.node-group.locked .node-dot { fill: #555; }
.node-group.locked .node-halo { stroke: rgba(255,255,255,0.08); }
.node-group.locked .node-label { fill: #555; }

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

/* 패널 전환 애니메이션 — 클릭 시 살짝 페이드+슬라이드 */
.panel-enter-active, .panel-leave-active {
  transition: opacity 220ms ease, transform 220ms ease;
}
.panel-enter-from { opacity: 0; transform: translateY(6px); }
.panel-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
