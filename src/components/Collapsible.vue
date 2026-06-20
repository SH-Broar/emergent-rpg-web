<script setup lang="ts">
/**
 * 접이식 섹션 (아코디언) — 거점 화면들의 정보 과다를 줄이기 위한 범용 컴포넌트.
 *
 * 헤더(제목 + 펼침 화살표 + 선택적 badge/subtitle) 탭으로 본문을 토글한다.
 * 토글 상태는 *로컬 UI 상태(ref)*만 — run/세이브에 영향 없음(표시 전용).
 * 접힘 시 본문은 미렌더(v-if).
 */

import { ref } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    defaultOpen?: boolean;
    badge?: string | number;
    subtitle?: string;
  }>(),
  { defaultOpen: false },
);

const open = ref(props.defaultOpen);
function toggle() {
  open.value = !open.value;
}
</script>

<template>
  <section class="collapsible" :class="{ 'collapsible--open': open }">
    <button class="collapsible__head" :aria-expanded="open" @click="toggle">
      <span class="collapsible__arrow">{{ open ? '▾' : '▸' }}</span>
      <span class="collapsible__title">{{ title }}</span>
      <span v-if="subtitle" class="collapsible__subtitle">{{ subtitle }}</span>
      <span v-if="badge !== undefined && badge !== ''" class="collapsible__badge">{{ badge }}</span>
    </button>
    <div v-if="open" class="collapsible__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.collapsible {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  overflow: hidden;
}
.collapsible--open {
  border-color: var(--border-strong, rgba(255, 255, 255, 0.25));
  background: rgba(255, 255, 255, 0.05);
}
.collapsible__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.75rem 1rem;
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.collapsible__head:hover {
  background: rgba(255, 255, 255, 0.04);
}
.collapsible__arrow {
  color: #c0b693;
  font-size: 0.85rem;
  width: 1rem;
  flex-shrink: 0;
}
.collapsible__title {
  flex: 1;
  min-width: 0;
  color: #f6e8b8;
  font-weight: 600;
  font-size: 0.95rem;
}
.collapsible__subtitle {
  color: #888;
  font-size: 0.82rem;
}
.collapsible__badge {
  color: #c0b693;
  font-size: 0.8rem;
  padding: 0.15rem 0.55rem;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.collapsible__body {
  padding: 0.4rem 1rem 0.9rem;
  border-top: 1px solid var(--border, rgba(255, 255, 255, 0.12));
}
</style>
