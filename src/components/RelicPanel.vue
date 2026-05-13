<script setup lang="ts">
/**
 * 유물 보기 패널 — 글로벌 모달.
 *
 * 각 유물의 *효과*를 사람 친화적 텍스트로 변환해 표시.
 */

import { useRunStore } from '@/stores/run';
import type { Relic, RelicEffect } from '@/data/schemas';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};

const triggerLabels: Record<string, string> = {
  passive: '패시브',
  'on-combat-start': '전투 시작 시',
  'on-combat-end': '전투 승리 시',
  'on-node-enter': '노드 진입 시',
  'on-card-play': '카드 사용 시',
  'on-rest': '휴식 시',
};

function effectText(eff: RelicEffect): string {
  const v = eff.value ?? 0;
  switch (eff.kind) {
    case 'bonus-hp': return `최대 HP +${v}`;
    case 'bonus-mana': return `마나 +${v}`;
    case 'bonus-gold': return `골드 +${v}`;
    case 'bonus-damage': return `모든 데미지 +${v}`;
    case 'discount': return `제작 비용 ${Math.round(v * 100)}% 할인`;
    default: return `${eff.kind}${eff.value !== undefined ? ` ${eff.value}` : ''}`;
  }
}

function describeRelic(r: Relic): string[] {
  return r.effects.map(effectText);
}
</script>

<template>
  <transition name="rel-fade">
    <div v-if="open" class="rel-backdrop" @click.self="emit('close')">
      <div class="rel-modal" role="dialog">
        <header class="rel-modal__hdr">
          <h2>유물 ({{ run.data.relics.length }})</h2>
          <button class="rel-modal__x" @click="emit('close')" aria-label="닫기">×</button>
        </header>

        <p v-if="run.data.relics.length === 0" class="empty">아직 유물이 없습니다.</p>

        <ul v-else class="rel-list">
          <li
            v-for="(r, i) in run.data.relics"
            :key="`${r.id}-${i}`"
            class="rel-card"
            :style="{ borderLeftColor: rankColors[r.rank] }"
          >
            <div class="rel-card__head">
              <span class="rel-card__name">{{ r.name }}</span>
              <span class="rel-card__rank" :style="{ color: rankColors[r.rank] }">{{ r.rank }}</span>
            </div>
            <div class="rel-card__trigger">{{ triggerLabels[r.trigger] ?? r.trigger }}</div>
            <ul class="rel-card__effects">
              <li v-for="(t, ei) in describeRelic(r)" :key="ei">· {{ t }}</li>
            </ul>
            <p v-if="r.flavor" class="rel-card__flavor">{{ r.flavor }}</p>
          </li>
        </ul>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.rel-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 950;
  padding: 1rem;
}
.rel-modal {
  max-width: 560px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(255, 232, 142, 0.4);
  border-radius: 12px;
  padding: 1.2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.rel-modal__hdr {
  display: flex;
  align-items: center;
  margin-bottom: 0.8rem;
}
.rel-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.2rem; }
.rel-modal__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.rel-modal__x:hover { color: #f6e8b8; }

.empty { color: #6c6c7c; text-align: center; padding: 2rem; font-style: italic; }

.rel-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.rel-card {
  padding: 0.7rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
}
.rel-card__head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
}
.rel-card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.rel-card__rank { font-size: 0.7rem; text-transform: uppercase; }
.rel-card__trigger { font-size: 0.8rem; color: #c08eff; margin-bottom: 0.3rem; }
.rel-card__effects { margin: 0; padding: 0; list-style: none; font-size: 0.85rem; color: #b6b6c4; }
.rel-card__effects li { padding: 0.1rem 0; }
.rel-card__flavor { font-size: 0.75rem; color: #6c6c7c; font-style: italic; margin: 0.4rem 0 0; }

.rel-fade-enter-active, .rel-fade-leave-active { transition: opacity 180ms ease; }
.rel-fade-enter-from, .rel-fade-leave-to { opacity: 0; }
</style>
