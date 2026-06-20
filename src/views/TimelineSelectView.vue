<script setup lang="ts">
/**
 * 챕터 선택 — 미니멀 리스트 (2026-06-20 정보 과다 정리).
 *
 * 감성 문구·"연표" 용어·메타 나열(덱 확장/선택 종족/등장 NPC/설명/미션)을 화면에서 걷어내고,
 * 챕터명(N장) / 제한 시간 / 도감 해금 % 만 노출한다. 미션은 런 시작 직전 브리핑 팝업에서 다시 안내.
 * 진입 버튼은 건조하게 "선택". (내부 데이터/변수는 timeline 용어를 유지 — 표시만 "챕터".)
 */

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { canEnterTimeline } from '@/frame/Mono';
import type { Timeline } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();
const meta = useMetaStore();

const isLocked = (id: string) => !canEnterTimeline(id);

/** 해금 순서대로 — 해금된 챕터 먼저, 그 안에서 연도(=챕터 진행) 오름차순. */
const timelines = computed<Timeline[]>(() =>
  Array.from(data.timelines.values()).sort((a, b) => {
    const la = isLocked(a.id) ? 1 : 0;
    const lb = isLocked(b.id) ? 1 : 0;
    if (la !== lb) return la - lb;
    return a.year - b.year;
  }),
);

/**
 * 도감 해금 정도(%) — 전역 기준(현재는 단일 챕터 구조라 챕터별 분리 없이 전역 표기).
 * 분모 = 도감 대상 종류(카드(기본)/유물/NPC/사건/보스/챕터)의 총수.
 */
const codexPercent = computed(() => {
  const baseCards = [...data.cards.values()].filter((c) => !c.id.endsWith('-plus')).length;
  const denom =
    baseCards + data.relics.size + data.npcs.size + data.events.size + data.bosses.size + data.timelines.size;
  if (denom <= 0) return 0;
  return Math.min(100, Math.round((meta.codex.length / denom) * 100));
});

function selectTimeline(id: string) {
  if (!canEnterTimeline(id)) {
    ui.toast('warning', '잠긴 챕터입니다.');
    return;
  }
  ui.pendingRunSetup.timelineId = id;
  // 흐름: 챕터 → 캐릭터 → 카오스 → 런 시작.
  ui.pendingRunSetup.raceId = null;
  ui.pendingRunSetup.activeChaos = [];
  router.push('/game/race-select');
}

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="tl-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>챕터 선택</h1>
    </header>

    <section v-if="timelines.length > 0" class="chapter-list">
      <article
        v-for="(t, i) in timelines"
        :key="t.id"
        class="chapter"
        :class="{ 'chapter--locked': isLocked(t.id) }"
      >
        <span class="chapter__no">{{ i + 1 }}장</span>
        <dl class="chapter__meta">
          <div>
            <dt>제한 시간</dt>
            <dd>{{ t.timeLimit }}턴</dd>
          </div>
          <div>
            <dt>도감 해금</dt>
            <dd>{{ codexPercent }}%</dd>
          </div>
        </dl>
        <button class="enter" :disabled="isLocked(t.id)" @click="selectTimeline(t.id)">
          {{ isLocked(t.id) ? '잠김' : '선택' }}
        </button>
      </article>
    </section>

    <section v-else class="empty"><p>—</p></section>
  </main>
</template>

<style scoped>
.tl-view { max-width: 760px; margin: 0 auto; padding: 2rem; }

.back {
  background: none;
  border: 1px solid rgba(255,255,255,0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.hdr h1 { color: #f6e8b8; margin: 0 0 1.4rem; }

.chapter-list { display: flex; flex-direction: column; gap: 1rem; }

.chapter {
  display: flex;
  align-items: center;
  gap: 1.4rem;
  padding: 1.4rem 1.6rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
}
.chapter--locked { opacity: 0.5; }

.chapter__no {
  font-size: 1.5rem;
  font-weight: 700;
  color: #f6e8b8;
  min-width: 3.2rem;
}

.chapter__meta {
  flex: 1;
  display: flex;
  gap: 1.6rem;
  margin: 0;
}
.chapter__meta div { display: grid; gap: 0.15rem; }
.chapter__meta dt { font-size: 0.72rem; color: #888; letter-spacing: 0.06em; }
.chapter__meta dd { color: #f6e8b8; margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }

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

@media (max-width: 640px) {
  .tl-view { padding: 1.2rem; }
  .chapter { flex-wrap: wrap; gap: 1rem; }
}
</style>
