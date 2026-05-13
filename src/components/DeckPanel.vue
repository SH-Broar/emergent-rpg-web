<script setup lang="ts">
/**
 * 덱 보기 패널 — 글로벌 모달.
 *
 * 사용자 정의: 덱 편집은 *어디서나* 가능한 외부 메뉴.
 * 현 단계: *덱 보기*만. 슬롯 교체 UI는 다음 라운드.
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();

const sortedDeck = computed(() => {
  const order: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };
  return [...run.data.deck].sort((a, b) => (order[a.rank] ?? 0) - (order[b.rank] ?? 0));
});

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
</script>

<template>
  <transition name="deck-fade">
    <div v-if="open" class="deck-backdrop" @click.self="emit('close')">
      <div class="deck-modal" role="dialog">
        <header class="deck-modal__hdr">
          <h2>덱 — {{ run.data.deck.length }} / {{ run.data.deckSize }}</h2>
          <button class="deck-modal__x" @click="emit('close')" aria-label="닫기">×</button>
        </header>

        <p v-if="run.data.deck.length === 0" class="empty">덱이 비어 있습니다.</p>

        <ul v-else class="deck-list">
          <li
            v-for="(c, i) in sortedDeck"
            :key="`${c.id}-${i}`"
            class="deck-card"
            :style="{ borderLeftColor: rankColors[c.rank] }"
          >
            <div class="deck-card__row">
              <span class="deck-card__cost">{{ c.cost }}</span>
              <span class="deck-card__name">{{ c.name }}</span>
              <span class="deck-card__rank" :style="{ color: rankColors[c.rank] }">{{ c.rank }}</span>
            </div>
            <div class="deck-card__effects">
              <span v-for="(e, ei) in c.effects" :key="ei" class="effect">
                {{ e.kind }} {{ e.value ?? '' }} {{ e.target ?? '' }}
              </span>
            </div>
          </li>
        </ul>

        <footer class="deck-modal__ftr">
          <small>슬롯 교체 UI는 다음 라운드 제작 시점에 추가됩니다.</small>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.deck-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 950;
  padding: 1rem;
}
.deck-modal {
  max-width: 560px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1.2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.deck-modal__hdr {
  display: flex;
  align-items: center;
  margin-bottom: 0.8rem;
}
.deck-modal__hdr h2 {
  flex: 1;
  color: #f6e8b8;
  margin: 0;
  font-size: 1.2rem;
}
.deck-modal__x {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
}
.deck-modal__x:hover { color: #f6e8b8; }

.empty { color: #6c6c7c; text-align: center; padding: 2rem; font-style: italic; }

.deck-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.deck-card {
  padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
}
.deck-card__row { display: flex; align-items: center; gap: 0.5rem; }
.deck-card__cost {
  background: #c08eff;
  color: #0d0e14;
  padding: 0.1rem 0.45rem;
  border-radius: 50%;
  font-weight: 700;
  font-size: 0.8rem;
}
.deck-card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.deck-card__rank { font-size: 0.7rem; text-transform: uppercase; }
.deck-card__effects { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; font-size: 0.75rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.1rem 0.4rem; border-radius: 3px; color: #b6b6c4; }

.deck-modal__ftr { margin-top: 0.8rem; color: #6c6c7c; text-align: center; }

.deck-fade-enter-active, .deck-fade-leave-active { transition: opacity 180ms ease; }
.deck-fade-enter-from, .deck-fade-leave-to { opacity: 0; }
</style>
