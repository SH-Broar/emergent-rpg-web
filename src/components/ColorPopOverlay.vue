<script setup lang="ts">
/**
 * 컬러 상승 팝 오버레이 (item 6) — 화면 상단 중앙에 컬러가 오를 때마다 잠깐 알약을 띄운다.
 *
 * applyColorBoost(systems/colors.ts)가 실제 상승분에 대해 ui.colorPop()을 호출하고,
 * 이 컴포넌트는 ui.colorPops를 구독해 "빛 +5 → 42" 형태로 애니메이션과 함께 보여 준다.
 * 토스트(우하단)와 별개의 *눈에 띄는* 피드백 — 모든 행동의 컬러 보상이 일관되게 보이게 한다.
 */
import { useUiStore } from '@/stores/ui';
import { colorLabel } from '@/systems/labels';

const ui = useUiStore();

/** element/컬러 키 → 표시 색(8색 전부, 다른 화면들과 동일 팔레트). */
const COLOR_HEX: Record<string, string> = {
  fire: '#ff8e8e', water: '#8eedff', electric: '#f2e36a', iron: '#a4a4b0',
  earth: '#c2a36a', wind: '#a8e8b8', light: '#f6e8b8', dark: '#c08eff',
};
function hexOf(c: string): string { return COLOR_HEX[c] ?? '#d6d6e0'; }
</script>

<template>
  <div class="colorpop-stack" aria-live="polite">
    <transition-group name="colorpop">
      <div
        v-for="p in ui.colorPops"
        :key="p.id"
        class="colorpop"
        :style="{ '--hex': hexOf(p.color) }"
      >
        <span class="colorpop__dot" />
        <span class="colorpop__name">{{ colorLabel(p.color) }}</span>
        <span class="colorpop__delta">+{{ p.delta }}</span>
        <span class="colorpop__arrow">&rarr;</span>
        <span class="colorpop__total">{{ p.total }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.colorpop-stack {
  position: fixed;
  top: 3.4rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  z-index: var(--z-toast, 1000);
  pointer-events: none;
}
.colorpop {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.32rem 0.8rem;
  border-radius: 999px;
  font-size: 0.92rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--hex);
  background: rgba(20, 22, 32, 0.92);
  border: 1.5px solid color-mix(in srgb, var(--hex) 55%, transparent);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45), 0 0 14px color-mix(in srgb, var(--hex) 30%, transparent);
}
.colorpop__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--hex); }
.colorpop__delta { color: var(--hex); }
.colorpop__arrow { color: #8a8aa0; font-weight: 400; }
.colorpop__total { color: #f0f0f6; }

/* 등장: 아래에서 위로 떠오르며 살짝 커진다. 퇴장: 위로 사라진다. */
.colorpop-enter-active { transition: opacity 220ms ease-out, transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.4); }
.colorpop-leave-active { transition: opacity 320ms ease-in, transform 320ms ease-in; }
.colorpop-enter-from { opacity: 0; transform: translateY(14px) scale(0.85); }
.colorpop-leave-to { opacity: 0; transform: translateY(-10px) scale(0.96); }

@media (prefers-reduced-motion: reduce) {
  .colorpop-enter-active, .colorpop-leave-active { transition: opacity 160ms linear; }
  .colorpop-enter-from, .colorpop-leave-to { transform: none; }
}
</style>
