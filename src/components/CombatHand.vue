<script setup lang="ts">
/**
 * 전투 손패 — CombatView / BossView 공용 컴포넌트.
 *
 * 두 화면의 손패 마크업이 거의 동일했던 것을 한 곳으로 모은다(중복 제거·패리티 보장).
 * 표현 계층만 담당 — 전투 로직(play/canPlay/애니메이션 상태)은 부모가 소유하고
 * 함수/값으로 주입받는다. 부모는 `play` 이벤트로 *손패 배열 인덱스*를 받아 기존 play(i)를 호출한다.
 *
 * 두 가지 뷰 모드:
 *  1) 그리드(기본) — 카드를 여러 줄로(높이 ~60% 축소 → 약 4줄 노출 + 내부 스크롤).
 *  2) 스택('정리' 토글 ON) — 왼쪽에 제목(코스트+이름)만 보이게 세로로 겹쳐 쌓고,
 *     선택한 카드를 오른쪽에 1장 전체 프리뷰. 프리뷰를 다시 누르면 발동.
 *
 * 은폐(obscure) 상태에서는 두 모드 모두 카드 뒷면(?)으로 — 위치로만 사용.
 */
import { computed, ref, watch } from 'vue';
import type { Card, CardEffect } from '@/data/schemas';

const props = defineProps<{
  /** 현재 손패(전투 상태의 hand 배열). 인덱스 = play 대상. */
  hand: Card[];
  /** 적 행동 중 — 입력 잠금. */
  enemyActing: boolean;
  /** 카드 사용 애니메이션 중인 손패 인덱스(없으면 null). */
  playingIndex: number | null;
  /** 은폐(손패 가림) 상태 — 뒷면 표시 + 위치로만 사용. */
  obscured: boolean;
  /** 카드 사용 가능 여부(마나/잠금/잡카드 등 부모 판정). */
  canPlay: (c: Card) => boolean;
  /** 표시·판정용 실효 비용(cost-up 반영). */
  displayCost: (c: Card) => number;
  /** 등급 테두리 색. */
  cardBorder: (c: Card) => string;
  /** 잠김(구속/닻) 여부. */
  isLocked: (c: Card) => boolean;
  /** effect 최종 정적값(컬러 보너스 반영). */
  effectiveValue: (e: CardEffect) => number;
  /** 전투 buff/debuff 부가치((+1)/(-2)). */
  statusDelta: (e: CardEffect) => number;
  /** 카드 effect 라벨(예: "피해"). */
  effectKindLabel: (e: CardEffect) => string;
  /** 카드 effect 상세(툴팁). */
  effectDescription: (e: CardEffect) => string;
  /** 카드 전체 상세(롱프레스 툴팁). */
  cardDetailText: (c: Card) => string;
}>();

const emit = defineEmits<{ (e: 'play', index: number): void }>();

/** '정리' 토글 — true면 스택뷰, false면 그리드뷰(기본). */
const tidy = ref(false);

/** 스택뷰에서 오른쪽에 프리뷰할 손패 인덱스(없으면 null → 첫 카드 안내). */
const previewIndex = ref<number | null>(null);

/** 프리뷰 대상 카드(인덱스가 유효할 때만). */
const previewCard = computed<Card | null>(() => {
  const i = previewIndex.value;
  if (i === null || i < 0 || i >= props.hand.length) return null;
  return props.hand[i] ?? null;
});

/** 손패가 바뀌면(카드 사용·드로우) 프리뷰 선택을 안전하게 초기화. */
watch(
  () => props.hand.map((c) => c.instanceId ?? c.id).join('|'),
  () => {
    // 선택 인덱스가 범위를 벗어났거나 그 자리에 다른 카드가 오면 선택 해제.
    if (previewIndex.value !== null && previewIndex.value >= props.hand.length) {
      previewIndex.value = null;
    }
  },
);

/** 입력 잠금(공통) — 적 행동 중·카드 애니메이션 중. */
const locked = computed(() => props.enemyActing || props.playingIndex !== null);

/** 스택에서 카드 선택 → 오른쪽 프리뷰로. */
function selectForPreview(index: number) {
  previewIndex.value = index;
}

/** 그리드/뒷면 직접 클릭 → 즉시 발동(기존 동작 유지). */
function clickPlay(index: number) {
  if (locked.value) return;
  const card = props.hand[index];
  if (!card || !props.canPlay(card)) return;
  emit('play', index);
}

/** 프리뷰 카드를 다시 눌러 발동. */
function playPreview() {
  const i = previewIndex.value;
  if (i === null) return;
  if (locked.value) return;
  const card = props.hand[i];
  if (!card || !props.canPlay(card)) return;
  emit('play', i);
  // 발동 후 프리뷰 해제 — 손패가 줄어도 옆 카드로 미끄러지지 않고 빈 안내로 복귀.
  previewIndex.value = null;
}
</script>

<template>
  <div class="hand-wrap" :class="{ 'hand-wrap--tidy': tidy }">
    <!-- 모드 토글 — '정리'(스택) ↔ 그리드 -->
    <div class="hand-toolbar">
      <button
        type="button"
        class="tidy-toggle"
        :class="{ 'tidy-toggle--on': tidy }"
        :aria-pressed="tidy"
        @click="tidy = !tidy"
      >
        {{ tidy ? '🗂 정리됨' : '🗂 정리' }}
      </button>
    </div>

    <!-- ===== 그리드 뷰(기본) ===== -->
    <section v-if="!tidy" class="hand hand--grid">
      <!-- 은폐(obscure): 카드 뒷면 — 위치로만 사용 -->
      <template v-if="obscured">
        <div
          v-for="(card, i) in hand"
          :key="`fd-${card.instanceId ?? card.id}-${i}`"
          class="card card--facedown"
          :class="{ 'card--disabled': !canPlay(card) || enemyActing, 'card--playing': playingIndex === i }"
          @click="clickPlay(i)"
        >
          <div class="facedown__mark">?</div>
          <div class="facedown__note">가려진 카드</div>
        </div>
      </template>

      <template v-else>
        <div
          v-for="(card, i) in hand"
          :key="`${card.instanceId ?? card.id}-${i}`"
          class="card"
          :class="{
            'card--disabled': !canPlay(card) || enemyActing,
            'card--locked': isLocked(card),
            'card--junk': card.unplayable,
            'card--playing': playingIndex === i,
          }"
          :style="{ borderColor: cardBorder(card) }"
          v-tooltip.hold="cardDetailText(card)"
          @click="clickPlay(i)"
        >
          <div class="card__head">
            <span class="card__cost" :class="{ 'card__cost--up': displayCost(card) > card.cost, 'card__cost--down': displayCost(card) < card.cost }">{{ displayCost(card) }}</span>
            <span class="card__name">{{ card.name }}</span>
            <span v-if="isLocked(card)" class="card__lock" title="묶여서 쓸 수 없다">🔒</span>
          </div>
          <div class="card__effects">
            <span v-for="(e, ei) in card.effects" :key="ei" class="effect" v-tooltip.hold="effectDescription(e)">
              <span class="effect__label">{{ effectKindLabel(e) }}</span>
              <strong class="eff-val">{{ effectiveValue(e) || (e.value ?? '') }}</strong>
              <span
                v-if="statusDelta(e) !== 0"
                class="eff-delta"
                :class="statusDelta(e) > 0 ? 'eff-delta--up' : 'eff-delta--down'"
              >({{ statusDelta(e) > 0 ? '+' : '' }}{{ statusDelta(e) }})</span>
            </span>
          </div>
        </div>
      </template>
    </section>

    <!-- ===== 스택 뷰('정리' ON) ===== -->
    <section v-else class="hand hand--stack">
      <!-- 왼쪽: 제목만 보이게 겹쳐 쌓은 더미 -->
      <div class="stack-list" role="list">
        <button
          v-for="(card, i) in hand"
          :key="`st-${card.instanceId ?? card.id}-${i}`"
          type="button"
          class="stack-item"
          :class="{
            'stack-item--active': previewIndex === i,
            'stack-item--disabled': obscured ? false : (!canPlay(card) && !obscured),
            'stack-item--locked': !obscured && isLocked(card),
            'stack-item--junk': !obscured && card.unplayable,
            'stack-item--playing': playingIndex === i,
          }"
          :style="obscured ? undefined : { borderLeftColor: cardBorder(card) }"
          @click="selectForPreview(i)"
        >
          <span v-if="obscured" class="stack-item__cost">?</span>
          <span v-else class="stack-item__cost" :class="{ 'card__cost--up': displayCost(card) > card.cost, 'card__cost--down': displayCost(card) < card.cost }">{{ displayCost(card) }}</span>
          <span class="stack-item__name">{{ obscured ? '가려진 카드' : card.name }}</span>
          <span v-if="!obscured && isLocked(card)" class="stack-item__lock">🔒</span>
        </button>
      </div>

      <!-- 오른쪽: 선택 카드 1장 전체 프리뷰 (다시 누르면 발동) -->
      <div class="stack-preview">
        <!-- 은폐: 뒷면 프리뷰 -->
        <div
          v-if="obscured && previewCard"
          class="card card--big card--facedown"
          :class="{ 'card--disabled': previewIndex === null || !canPlay(previewCard) || enemyActing, 'card--playing': playingIndex === previewIndex }"
          @click="playPreview"
        >
          <div class="facedown__mark">?</div>
          <div class="facedown__note">가려진 카드 — 눌러서 사용</div>
        </div>

        <div
          v-else-if="previewCard"
          class="card card--big"
          :class="{
            'card--disabled': !canPlay(previewCard) || enemyActing,
            'card--locked': isLocked(previewCard),
            'card--junk': previewCard.unplayable,
            'card--playing': playingIndex === previewIndex,
          }"
          :style="{ borderColor: cardBorder(previewCard) }"
          @click="playPreview"
        >
          <div class="card__head">
            <span class="card__cost" :class="{ 'card__cost--up': displayCost(previewCard) > previewCard.cost, 'card__cost--down': displayCost(previewCard) < previewCard.cost }">{{ displayCost(previewCard) }}</span>
            <span class="card__name">{{ previewCard.name }}</span>
            <span v-if="isLocked(previewCard)" class="card__lock" title="묶여서 쓸 수 없다">🔒</span>
          </div>
          <div class="card__effects">
            <span v-for="(e, ei) in previewCard.effects" :key="ei" class="effect">
              <span class="effect__label">{{ effectKindLabel(e) }}</span>
              <strong class="eff-val">{{ effectiveValue(e) || (e.value ?? '') }}</strong>
              <span
                v-if="statusDelta(e) !== 0"
                class="eff-delta"
                :class="statusDelta(e) > 0 ? 'eff-delta--up' : 'eff-delta--down'"
              >({{ statusDelta(e) > 0 ? '+' : '' }}{{ statusDelta(e) }})</span>
            </span>
          </div>
          <p v-if="previewCard.flavor" class="card__flavor card__flavor--shown">{{ previewCard.flavor }}</p>
          <p class="stack-preview__hint">{{ canPlay(previewCard) && !enemyActing ? '다시 눌러 사용' : (isLocked(previewCard) ? '묶여서 쓸 수 없다' : '지금은 쓸 수 없다') }}</p>
        </div>

        <p v-else class="stack-preview__empty">왼쪽에서 카드를 고르면 여기에서 자세히 보고 사용할 수 있어.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hand-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* 모드 토글 바 — 손패 위쪽 우측. */
.hand-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 0 1rem;
}
.tidy-toggle {
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.25rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  color: #c9c3da;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.18);
}
.tidy-toggle:hover { background: rgba(255, 255, 255, 0.1); }
.tidy-toggle--on {
  color: #f6e8b8;
  background: rgba(192, 142, 255, 0.2);
  border-color: rgba(192, 142, 255, 0.5);
}

/* === 손패 — 카드 높이를 기존(폭×1.4)의 ~60%인 폭×0.84로 축소. 한 줄이 낮아져 약 4줄 노출 + 내부 스크롤. === */
.hand {
  /* 폭은 기존 그리드와 동일하게 유지(가독성) — 줄어드는 것은 높이뿐(×1.4 → ×0.84 = ~60%). */
  --card-w: clamp(80px, 19vw, 168px);
  --card-h: calc(var(--card-w) * 0.84); /* 기존 ×1.4 대비 ~60% 높이 */
}
.hand--grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 1rem 1.2rem;
  align-items: flex-start;
  /* align-content는 flex-start로 — flex-end + overflow는 넘친 줄이 위로 밀려 스크롤 불가(브라우저 버그성).
     하단 고정은 wrapper 안에서 margin-top:auto로 처리한다(아래). */
  align-content: flex-start;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  /* 위쪽 공간을 밀어 카드 더미를 하단에 붙인다(로그 등장 시 위로 점프 방지). */
  margin-top: auto;
  /* 약 4줄 = 카드높이×4 + 간격×3. 그 이상은 내부 스크롤. flex:1을 빼 max-height가 실제 상한이 되게. */
  min-height: calc(var(--card-h) + 1rem);
  max-height: calc((var(--card-h) * 4) + (0.5rem * 3) + 1.7rem);
  scrollbar-width: thin;
}

.card {
  flex-shrink: 0;
  width: var(--card-w);
  height: var(--card-h);
  padding: 0.4rem 0.45rem;
  background: rgba(255, 255, 255, 0.04);
  border: 2px solid;
  border-radius: 9px;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: hidden;
}
.card:hover:not(.card--disabled) {
  transform: translateY(-8px) scale(1.05);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.5);
  z-index: 5;
}
.card--disabled { opacity: 0.4; cursor: not-allowed; }
.card__head { display: flex; align-items: center; gap: 0.25rem; min-height: 1.35rem; }
.card__cost {
  flex-shrink: 0;
  background: #c08eff; color: #0d0e14;
  width: 1.35rem; height: 1.35rem;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; font-weight: 700; font-size: 0.85rem;
}
.card__name {
  flex: 1; color: #f6e8b8; font-weight: 600; font-size: 0.8rem; line-height: 1.1;
  overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
}
.card__effects {
  display: flex; flex-wrap: wrap; gap: 0.2rem; font-size: 0.72rem;
  align-content: flex-start; flex: 1; overflow: hidden;
}
.effect {
  background: rgba(0, 0, 0, 0.4); padding: 0.1rem 0.34rem; border-radius: 5px;
  color: #b6b6c4; display: inline-flex; gap: 0.16rem; align-items: baseline; max-width: 100%;
}
.effect__label { white-space: normal; }
.eff-val { color: #f6e8b8; font-weight: 700; }
.eff-delta { font-size: 0.85em; font-weight: 700; }
.eff-delta--up { color: #8effb8; }
.eff-delta--down { color: #ff8e8e; }
/* 그리드의 작은 카드에선 flavor 숨김(상세는 툴팁/도감/프리뷰에서). */
.card__flavor { display: none; }

/* 카드 사용 애니메이션 — 번쩍→위로 날아가며 페이드. */
.card--playing {
  pointer-events: none;
  animation: hand-card-play 260ms ease-in forwards;
  z-index: 20;
}
@keyframes hand-card-play {
  0%   { transform: translateY(0) scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(246, 232, 184, 0); }
  35%  { transform: translateY(-14px) scale(1.16); filter: brightness(2.2); box-shadow: 0 0 26px rgba(246, 232, 184, 0.9); }
  100% { transform: translateY(-80px) scale(0.7); filter: brightness(1.4); opacity: 0; }
}

/* 잠긴 카드 / 잡카드 / 비용 상승 / 뒷면 */
.card--locked { border-style: dashed !important; }
.card__lock { font-size: 0.66rem; }
.card--junk { background: rgba(120, 90, 90, 0.18); }
.card__cost--up { background: #ff8e8e; color: #160d0d; }
.card__cost--down { background: #8effa6; color: #0d160f; }
.card--facedown {
  align-items: center; justify-content: center; text-align: center;
  border-color: #555 !important;
  background: repeating-linear-gradient(45deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 16px);
}
.facedown__mark { font-size: 1.4rem; color: #8a8a99; font-weight: 800; }
.facedown__note { font-size: 0.58rem; color: #6c6c7c; }

/* ===== 스택 뷰 ===== */
.hand--stack {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) minmax(0, 1.3fr);
  gap: 0.8rem;
  padding: 0.4rem 1rem 1rem;
  flex: 1;
  min-height: 0;
  align-items: start;
}
/* 왼쪽 — 제목만 보이게 음수 마진으로 겹쳐 쌓은 더미. */
.stack-list {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: 100%;
  padding-top: 0.2rem;
  scrollbar-width: thin;
}
.stack-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  text-align: left;
  font: inherit;
  width: 100%;
  padding: 0.32rem 0.5rem;
  margin-top: -0.45rem;       /* 음수 마진 — 카드 상단 띠만 노출(더미처럼). */
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-left: 4px solid #a4a4b0;
  border-radius: 7px;
  background: #1a1b24;
  color: #d6d6e0;
  cursor: pointer;
  transition: transform 100ms ease, background 100ms ease;
}
.stack-item:first-child { margin-top: 0; }
.stack-item:hover { background: #23242f; transform: translateX(3px); }
.stack-item--active {
  background: #2c2d3c;
  transform: translateX(6px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  z-index: 2;
}
.stack-item--disabled { opacity: 0.5; }
.stack-item--locked { border-left-style: dashed; }
.stack-item--junk { background: rgba(120, 90, 90, 0.2); }
.stack-item--playing { animation: stack-flash 260ms ease-in; }
@keyframes stack-flash {
  0% { filter: brightness(1); }
  40% { filter: brightness(2); }
  100% { filter: brightness(1); }
}
.stack-item__cost {
  flex-shrink: 0;
  background: #c08eff; color: #0d0e14;
  width: 1.3rem; height: 1.3rem;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; font-weight: 700; font-size: 0.78rem;
}
.stack-item__name {
  flex: 1; font-weight: 600; font-size: 0.84rem; color: #f6e8b8;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stack-item__lock { font-size: 0.7rem; }

/* 오른쪽 — 선택 카드 1장 전체 프리뷰. */
.stack-preview {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
}
.card--big {
  width: min(100%, 240px);
  height: auto;
  min-height: 200px;
  padding: 0.9rem;
  gap: 0.5rem;
}
.card--big .card__head { min-height: 1.8rem; }
.card--big .card__cost { width: 1.7rem; height: 1.7rem; font-size: 1rem; }
.card--big .card__name {
  font-size: 1.05rem; line-height: 1.25;
  -webkit-line-clamp: 3; line-clamp: 3;
}
.card--big .card__effects { font-size: 0.86rem; gap: 0.3rem; flex: 0 0 auto; }
.card--big .effect { padding: 0.18rem 0.5rem; }
.card__flavor--shown {
  display: block;
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  font-style: italic;
  color: #9a94ab;
  line-height: 1.4;
}
.stack-preview__hint {
  margin: auto 0 0;
  padding-top: 0.4rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #c08eff;
  text-align: center;
}
.card--big.card--disabled .stack-preview__hint { color: #8a8a99; }
.stack-preview__empty {
  margin: 1.5rem 0 0;
  color: #6f6f80;
  font-size: 0.86rem;
  text-align: center;
  line-height: 1.5;
}

/* 모바일 — 카드 폭은 기존과 동일(높이만 60%), 스택은 위/아래 2단으로. */
@media (max-width: 640px) {
  .hand { --card-w: clamp(92px, 25vw, 168px); }
  .card__name { font-size: 0.74rem; }
  .card__effects { font-size: 0.66rem; gap: 0.12rem; }
  .effect { padding: 0.06rem 0.28rem; }
  .hand--stack {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    gap: 0.6rem;
  }
  .stack-list { max-height: 38vh; }
  .card--big { width: min(100%, 220px); margin: 0 auto; }
}

/* 모션 감소 — 흔들림/이동 최소화. */
@media (prefers-reduced-motion: reduce) {
  .card--playing { animation: none; opacity: 0; }
  .stack-item--playing { animation: none; }
  .card:hover:not(.card--disabled) { transform: translateY(-3px); }
  .stack-item:hover, .stack-item--active { transform: none; }
}
</style>
