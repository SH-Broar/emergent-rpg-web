<script setup lang="ts">
/**
 * Tooltip — 재사용 가능한 클릭/탭/호버 툴팁.
 *
 * 사용 패턴:
 *   <Tooltip text="HP — 체력. 0이 되면 런 종료">
 *     <button>...</button>
 *   </Tooltip>
 *
 * - 데스크톱: 호버 + 클릭 모두 지원
 * - 모바일: 탭으로 토글
 * - 외부 포인터다운 시 닫힘
 * - z-index 850 (HUD 800 < tip < 모달 950)
 */

import { computed, onBeforeUnmount, ref, useTemplateRef } from 'vue';

const props = withDefaults(defineProps<{
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
}>(), {
  position: 'bottom',
  disabled: false,
});

const visible = ref(false);
const wrapperEl = useTemplateRef<HTMLDivElement>('wrapperEl');

function show() {
  if (props.disabled) return;
  visible.value = true;
}
function hide() {
  visible.value = false;
}
function toggle() {
  if (props.disabled) return;
  visible.value = !visible.value;
  if (visible.value) {
    document.addEventListener('pointerdown', onOutsidePointer, true);
  } else {
    document.removeEventListener('pointerdown', onOutsidePointer, true);
  }
}
function onOutsidePointer(e: PointerEvent) {
  const root = wrapperEl.value;
  if (!root) return;
  if (e.target instanceof Node && root.contains(e.target)) return;
  hide();
  document.removeEventListener('pointerdown', onOutsidePointer, true);
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutsidePointer, true);
});

const tipClass = computed(() => `tip tip--${props.position}`);
</script>

<template>
  <div
    ref="wrapperEl"
    class="tip-wrap"
    @mouseenter="show"
    @mouseleave="hide"
    @click.stop="toggle"
  >
    <slot />
    <transition name="tip">
      <div v-if="visible && text" :class="tipClass" role="tooltip">
        {{ text }}
      </div>
    </transition>
  </div>
</template>

<style scoped>
.tip-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.tip {
  position: absolute;
  z-index: var(--z-tooltip);
  background: rgba(20, 22, 30, 0.96);
  color: #f6e8b8;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  font-size: 0.72rem;
  line-height: 1.35;
  max-width: 220px;
  width: max-content;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  white-space: normal;
}

.tip::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border: 5px solid transparent;
}

.tip--bottom {
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}
.tip--bottom::after {
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-bottom-color: rgba(20, 22, 30, 0.96);
}

.tip--top {
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
}
.tip--top::after {
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-top-color: rgba(20, 22, 30, 0.96);
}

.tip--left {
  right: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
}
.tip--left::after {
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-left-color: rgba(20, 22, 30, 0.96);
}

.tip--right {
  left: calc(100% + 6px);
  top: 50%;
  transform: translateY(-50%);
}
.tip--right::after {
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border-right-color: rgba(20, 22, 30, 0.96);
}

.tip-enter-active, .tip-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}
.tip-enter-from {
  opacity: 0;
}
.tip-enter-from.tip--bottom { transform: translate(-50%, -4px); }
.tip-enter-from.tip--top    { transform: translate(-50%,  4px); }
.tip-enter-from.tip--left   { transform: translate( 4px, -50%); }
.tip-enter-from.tip--right  { transform: translate(-4px, -50%); }
.tip-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .tip { font-size: 0.68rem; max-width: 180px; padding: 0.34rem 0.5rem; }
}
</style>
