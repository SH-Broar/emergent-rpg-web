<script setup lang="ts">
/**
 * 레벨업 강화 픽 모달 (XP·각성 시스템, 2026-06-10).
 *
 * 전투 승리로 레벨업하면 자동으로 열린다(App.vue 전역 배치, ui.enhancePickOpen).
 * 보유 카드(컬렉션) 목록에서 1장을 골라 +1강 — 강화권(pendingEnhancePicks) 1장 소비.
 *  - 5강 도달 + 미각성 카드: "각성 필요(공방)" 비활성 라벨 — 여기선 강화 불가.
 *  - 10강(각성 카드) 도달: "최대" 비활성.
 * 스킵(닫기) 시 강화권은 이월된다 — 캐릭터 메뉴에서 다시 쓸 수 있다.
 *
 * 카드 수치는 *실행 시점 스케일*(enhance.ts scaledValue)이라, +1강 직후 표시 수치가 즉시 갱신된다.
 */

import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import {
  canEnhance,
  needsAwakening,
  enhanceBadge,
  scaledValue,
  MAX_ENHANCE_LEVEL,
  AWAKEN_GATE_LEVEL,
} from '@/systems/enhance';
import { cardEffectKindLabel, cardEffectDescription } from '@/systems/labels';
import type { Card, CardEffect } from '@/data/schemas';

const run = useRunStore();
const ui = useUiStore();

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
const rankOrder: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };

const open = computed(() => ui.enhancePickOpen);
const picks = computed(() => run.data.pendingEnhancePicks ?? 0);
const level = computed(() => run.data.level ?? 1);

/** 컬렉션 — 등급/이름 정렬. 강화 가능한 카드를 위로 올린다(고를 대상 우선). */
const sortedCollection = computed(() => {
  return [...run.data.collection].sort((a, b) => {
    const ea = canEnhance(a) ? 0 : 1;
    const eb = canEnhance(b) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const r = (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });
});

function keyOf(card: Card): string {
  return card.instanceId ?? card.id;
}

/** 수치형 효과(damage/block/heal)의 *현재 강화 반영* 표시값. 비수치 효과는 원래 value. */
function shownValue(card: Card, eff: CardEffect): number {
  if (eff.kind === 'damage' || eff.kind === 'block' || eff.kind === 'heal') {
    return scaledValue(eff.value ?? 0, card);
  }
  return eff.value ?? 0;
}

/** 그 카드의 강화 상태 라벨 — 버튼/배지에 표시. */
function stateLabel(card: Card): string {
  const lvl = card.enhanceLevel ?? 0;
  if (needsAwakening(card)) return '각성 필요 (공방)';
  if (card.awakened && lvl >= MAX_ENHANCE_LEVEL) return '최대 (10강)';
  if (!card.awakened && lvl >= AWAKEN_GATE_LEVEL) return '각성 필요 (공방)';
  return `+1강 (현재 ${lvl}강)`;
}

function pick(card: Card) {
  if (picks.value <= 0) return;
  if (!canEnhance(card)) return;
  const iid = card.instanceId;
  if (!iid) return;
  const ok = run.enhanceCard(iid);
  if (ok) {
    ui.toast('success', `${card.name} 강화 — ${enhanceBadge(card)}`);
    // 강화권이 떨어지면 자동으로 닫는다(연속 레벨업이면 남은 픽 동안 열린 채 유지).
    if ((run.data.pendingEnhancePicks ?? 0) <= 0) ui.closeEnhancePick();
  }
}

function close() {
  ui.closeEnhancePick();
}
</script>

<template>
  <transition name="ep-fade">
    <div v-if="open" class="ep-backdrop" @click.self="close">
      <div class="ep-modal" role="dialog" aria-label="강화 픽">
        <header class="ep-modal__hdr">
          <div class="ep-modal__title">
            <h2>레벨 업 — 강화권 {{ picks }}</h2>
            <span class="ep-modal__sub">레벨 {{ level }} · 카드 1장을 골라 강화한다</span>
          </div>
          <button class="ep-modal__x" aria-label="닫기" @click="close">×</button>
        </header>

        <p class="ep-hint">
          고른 카드가 +1강 된다(강화권 1 소비). 5강에 닿으면 공방에서 각성해야 더 강해진다.
          닫아도 강화권은 남아 캐릭터 메뉴에서 쓸 수 있어.
        </p>

        <ul v-if="sortedCollection.length > 0" class="ep-cards">
          <li
            v-for="c in sortedCollection"
            :key="keyOf(c)"
            class="ep-card"
            :class="{ 'ep-card--locked': !canEnhance(c) }"
            :style="{ borderLeftColor: rankColors[c.rank] }"
          >
            <div class="ep-card__row">
              <span class="ep-card__cost">{{ c.cost }}</span>
              <span class="ep-card__name">
                {{ c.name }}
                <span v-if="enhanceBadge(c)" class="ep-card__badge">{{ enhanceBadge(c) }}</span>
              </span>
              <button
                class="ep-card__pick"
                :disabled="picks <= 0 || !canEnhance(c)"
                @click="pick(c)"
              >{{ stateLabel(c) }}</button>
            </div>
            <div class="ep-card__effects">
              <span
                v-for="(e, ei) in c.effects"
                :key="ei"
                class="ep-effect"
                v-tooltip="cardEffectDescription(e)"
              >
                {{ cardEffectKindLabel(e) }} {{ shownValue(c, e) || (e.value ?? '') }}
              </span>
            </div>
          </li>
        </ul>
        <p v-else class="ep-empty">강화할 카드가 없습니다.</p>

        <footer class="ep-modal__ftr">
          <button class="ep-btn-skip" @click="close">{{ picks > 0 ? '나중에 (이월)' : '닫기' }}</button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.ep-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: var(--z-modal-nested);
  padding: 1rem;
}
.ep-modal {
  max-width: 600px; width: 100%;
  max-height: 86vh; max-height: 86dvh;
  display: flex; flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(246, 232, 184, 0.45);
  border-radius: 12px;
  padding: 1rem 1.2rem 0.8rem;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.65);
}
.ep-modal__hdr { display: flex; align-items: flex-start; gap: 0.6rem; margin-bottom: 0.4rem; }
.ep-modal__title { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
.ep-modal__title h2 { color: #f6e8b8; margin: 0; font-size: 1.15rem; }
.ep-modal__sub { color: #c0b693; font-size: 0.78rem; }
.ep-modal__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.ep-modal__x:hover { color: #f6e8b8; }

.ep-hint { font-size: 0.78rem; color: #8a8a98; margin: 0 0 0.6rem; line-height: 1.4; }

.ep-cards {
  list-style: none; padding: 0; margin: 0;
  overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 0.3rem;
}
.ep-card {
  padding: 0.5rem 0.7rem;
  background: rgba(255, 255, 255, 0.03);
  border-left: 3px solid;
  border-radius: 4px;
}
.ep-card--locked { opacity: 0.62; }
.ep-card__row { display: flex; align-items: center; gap: 0.45rem; }
.ep-card__cost {
  flex-shrink: 0;
  background: #c08eff; color: #0d0e14;
  width: 1.4rem; height: 1.4rem;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; font-weight: 700; font-size: 0.78rem;
}
.ep-card__name { flex: 1; color: #f6e8b8; font-weight: 600; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 0.35rem; }
.ep-card__badge {
  font-size: 0.72rem; font-weight: 700; color: #ffe88e;
  background: rgba(246, 232, 184, 0.16); border-radius: 6px; padding: 0.02rem 0.35rem;
}
.ep-card__pick {
  flex-shrink: 0;
  background: rgba(246, 232, 184, 0.18);
  border: 1px solid rgba(246, 232, 184, 0.5);
  color: #f6e8b8;
  border-radius: 6px;
  padding: 0.28rem 0.7rem;
  font: inherit; font-size: 0.76rem; font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.ep-card__pick:hover:not(:disabled) { background: rgba(246, 232, 184, 0.32); }
.ep-card__pick:disabled { opacity: 0.4; cursor: not-allowed; background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.15); color: #8a8a98; }
.ep-card__effects { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.2rem; font-size: 0.7rem; padding-left: 1.85rem; }
.ep-effect { background: rgba(0, 0, 0, 0.4); padding: 0.05rem 0.35rem; border-radius: 3px; color: #b6b6c4; }

.ep-empty { color: #6c6c7c; text-align: center; padding: 2rem; font-style: italic; }

.ep-modal__ftr {
  display: flex; gap: 0.5rem; justify-content: flex-end;
  margin-top: 0.6rem; padding-top: 0.6rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.ep-btn-skip {
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #c9c3da;
  border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600;
}
.ep-btn-skip:hover { background: rgba(255, 255, 255, 0.1); }

.ep-fade-enter-active, .ep-fade-leave-active { transition: opacity 180ms ease; }
.ep-fade-enter-from, .ep-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .ep-modal { padding: 0.9rem; max-height: 90dvh; }
  .ep-card__name { font-size: 0.84rem; }
  .ep-card__pick { font-size: 0.72rem; padding: 0.24rem 0.55rem; }
}
</style>
