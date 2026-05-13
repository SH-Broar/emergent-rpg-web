<script setup lang="ts">
/**
 * 덱 편집 패널 — 글로벌 모달.
 *
 * 사용자 사양:
 *   - 카드 무제한 보유 (collection)
 *   - 덱 슬롯 = 10 (전투에 들고가는 카드)
 *   - 클릭으로 On/Off 토글
 *   - 저장 시 deck.length === deckSize 정확히 일치해야 함
 */

import { computed, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import type { Card } from '@/data/schemas';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const ui = useUiStore();

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
const rankOrder: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };

/** 편집 중인 활성 카드 ID 세트 (저장 시 deck에 반영). */
const activeIds = ref<Set<string>>(new Set());

/** 패널이 열릴 때마다 현재 deck 상태를 편집 세트에 복사. */
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      activeIds.value = new Set(run.data.deck.map((c) => c.id));
    }
  },
  { immediate: true },
);

const sortedCollection = computed(() => {
  return [...run.data.collection].sort((a: Card, b: Card) => {
    const r = (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });
});

const activeCount = computed(() => activeIds.value.size);
const canSave = computed(() => activeCount.value === run.data.deckSize);

function toggle(card: Card) {
  if (activeIds.value.has(card.id)) {
    activeIds.value.delete(card.id);
  } else {
    if (activeIds.value.size >= run.data.deckSize) {
      ui.toast('warning', `덱 슬롯은 ${run.data.deckSize}장으로 제한됩니다.`);
      return;
    }
    activeIds.value.add(card.id);
  }
  // Vue reactivity — Set 변경은 직접 트리거 필요
  activeIds.value = new Set(activeIds.value);
}

function save() {
  if (!canSave.value) {
    ui.toast('warning', `정확히 ${run.data.deckSize}장이어야 저장 가능합니다. (현재 ${activeCount.value})`);
    return;
  }
  run.setDeckFromCollection(Array.from(activeIds.value));
  ui.toast('success', '덱이 저장되었습니다');
  emit('close');
}

function reset() {
  activeIds.value = new Set(run.data.deck.map((c) => c.id));
}
</script>

<template>
  <transition name="deck-fade">
    <div v-if="props.open" class="deck-backdrop" @click.self="emit('close')">
      <div class="deck-modal" role="dialog">
        <header class="deck-modal__hdr">
          <h2>덱 편집 — {{ activeCount }} / {{ run.data.deckSize }}</h2>
          <span class="status" :class="{ ok: canSave, no: !canSave }">
            {{ canSave ? '저장 가능' : `${run.data.deckSize - activeCount > 0 ? '+' : ''}${run.data.deckSize - activeCount}` }}
          </span>
          <button class="x" @click="emit('close')" aria-label="닫기">×</button>
        </header>

        <p class="hint">컬렉션의 카드를 클릭해 덱에 넣거나 뺍니다. 정확히 {{ run.data.deckSize }}장이어야 저장됩니다.</p>

        <ul v-if="sortedCollection.length > 0" class="cards">
          <li
            v-for="c in sortedCollection"
            :key="c.id"
            class="card"
            :class="{ 'card--on': activeIds.has(c.id) }"
            :style="{ borderLeftColor: rankColors[c.rank] }"
            @click="toggle(c)"
          >
            <div class="card__row">
              <span class="card__check">{{ activeIds.has(c.id) ? '◉' : '○' }}</span>
              <span class="card__cost">{{ c.cost }}</span>
              <span class="card__name">{{ c.name }}</span>
              <span class="card__rank" :style="{ color: rankColors[c.rank] }">{{ c.rank }}</span>
            </div>
            <div class="card__effects">
              <span v-for="(e, ei) in c.effects" :key="ei" class="effect">
                {{ e.kind }} {{ e.value ?? '' }} {{ e.target ?? '' }}
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="empty">컬렉션이 비어 있습니다.</p>

        <footer class="deck-modal__ftr">
          <button class="btn-reset" @click="reset">현재 덱으로 되돌리기</button>
          <button class="btn-save" :disabled="!canSave" @click="save">
            저장 {{ canSave ? '' : `(${activeCount}/${run.data.deckSize})` }}
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.deck-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 950; padding: 1rem;
}
.deck-modal {
  max-width: 620px; width: 100%;
  max-height: 86vh;
  display: flex; flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1rem 1.2rem 0.8rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.deck-modal__hdr {
  display: flex; align-items: center;
  gap: 0.6rem; margin-bottom: 0.4rem;
}
.deck-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.1rem; }
.status { font-size: 0.8rem; padding: 0.18rem 0.5rem; border-radius: 10px; font-variant-numeric: tabular-nums; }
.status.ok { background: rgba(142, 255, 184, 0.18); color: #8effb8; }
.status.no { background: rgba(255, 142, 142, 0.18); color: #ff8e8e; }
.x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.x:hover { color: #f6e8b8; }

.hint { font-size: 0.8rem; color: #888; margin: 0 0 0.6rem; }

.cards {
  list-style: none; padding: 0; margin: 0;
  overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.card {
  padding: 0.5rem 0.7rem;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid;
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.card:hover { background: rgba(255, 255, 255, 0.07); }
.card--on { background: rgba(192, 142, 255, 0.12); }
.card__row { display: flex; align-items: center; gap: 0.45rem; }
.card__check { color: #c08eff; width: 12px; font-weight: 700; }
.card__cost { background: #c08eff; color: #0d0e14; padding: 0.05rem 0.4rem; border-radius: 50%; font-weight: 700; font-size: 0.75rem; }
.card__name { flex: 1; color: #f6e8b8; font-weight: 600; font-size: 0.9rem; }
.card__rank { font-size: 0.65rem; text-transform: uppercase; }
.card__effects { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.2rem; font-size: 0.7rem; padding-left: 1.5rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.05rem 0.35rem; border-radius: 3px; color: #b6b6c4; }

.empty { color: #6c6c7c; text-align: center; padding: 2rem; font-style: italic; }

.deck-modal__ftr {
  display: flex; gap: 0.5rem;
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
.btn-reset {
  padding: 0.5rem 0.9rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #b6b6c4;
  border-radius: 6px; cursor: pointer; font: inherit;
}
.btn-reset:hover { background: rgba(255, 255, 255, 0.08); }
.btn-save {
  flex: 1;
  padding: 0.55rem 1rem;
  background: rgba(192, 142, 255, 0.25);
  border: 1px solid rgba(192, 142, 255, 0.6);
  color: #f6e8b8;
  border-radius: 6px; cursor: pointer;
  font: inherit; font-weight: 600;
}
.btn-save:hover:not(:disabled) { background: rgba(192, 142, 255, 0.4); }
.btn-save:disabled { opacity: 0.35; cursor: not-allowed; }

.deck-fade-enter-active, .deck-fade-leave-active { transition: opacity 180ms ease; }
.deck-fade-enter-from, .deck-fade-leave-to { opacity: 0; }
</style>
