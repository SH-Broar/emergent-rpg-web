<script setup lang="ts">
/**
 * 게임 중 고정 상단 HUD — 슬림 버전 (M2).
 *
 * 사용자 요구 (2026-05-15):
 *  - 4 슬롯만 노출: HP / 골드 / 시간의 조각 / 시간
 *  - 3 메뉴 버튼: 캐릭터 / 소지품 / 설정 (햄버거 패턴)
 *  - 일차/덱/유물/아이템/동료/6컬러/스탯은 메뉴로 이동
 *  - 모바일 375px 한 줄 (4슬롯 + 3버튼)
 *  - 각 슬롯/버튼에 Tooltip 부착
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { XP_PER_LEVEL } from '@/systems/enhance';
import { clockOfTurn, clockLabel } from '@/systems/time';
import Tooltip from '@/components/Tooltip.vue';

const props = defineProps<{
  characterOpen: boolean;
  inventoryOpen: boolean;
  settingsOpen: boolean;
}>();
const emit = defineEmits<{
  (e: 'toggle-character'): void;
  (e: 'toggle-inventory'): void;
  (e: 'toggle-settings'): void;
}>();

/**
 * 모바일 통합 메뉴 — 상단 버튼 3개를 하나의 햄버거로 묶어 펼친다.
 * 화면 여백이 좁아 슬롯(HP/골드/시간)이 늘어나면 버튼이 가려지던 문제(#3) 회피.
 * 데스크톱은 기존 3버튼 유지 — 미디어 쿼리로 분기.
 */
const menuOpen = ref(false);
function toggleMenu() { menuOpen.value = !menuOpen.value; }
function openMenuItem(target: 'character' | 'inventory' | 'settings') {
  menuOpen.value = false;
  if (target === 'character') emit('toggle-character');
  else if (target === 'inventory') emit('toggle-inventory');
  else emit('toggle-settings');
}
// 메뉴 외부 클릭 시 닫기. 키보드 ESC 도 지원.
function onDocClick(e: MouseEvent) {
  if (!menuOpen.value) return;
  const tgt = e.target as HTMLElement | null;
  if (tgt?.closest('.menu-pop, .menu-toggle')) return;
  menuOpen.value = false;
}
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') menuOpen.value = false; }
if (typeof window !== 'undefined') {
  window.addEventListener('click', onDocClick);
  window.addEventListener('keydown', onKey);
  onBeforeUnmount(() => {
    window.removeEventListener('click', onDocClick);
    window.removeEventListener('keydown', onKey);
  });
}
// 메뉴 모달 중 하나가 열리면(외부에서 열렸을 수도 있음) 메뉴 자체도 접는다 — 두 패널이 동시에 떠 있을 이유 없음.
watch(
  () => [props.characterOpen, props.inventoryOpen, props.settingsOpen],
  (open) => { if (open.some(Boolean)) menuOpen.value = false; },
);

const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const timeUrgent = computed(() => {
  const tl = timeline.value;
  if (!tl) return false;
  // 경과 턴(시계 진실원 = visitedNodes)이 제한의 90%를 넘으면 위급 — remainingTime 의존 제거(B4 정합).
  const elapsed = run.data.visitedNodes.length;
  return elapsed >= tl.timeLimit - Math.max(3, Math.floor(tl.timeLimit * 0.1));
});

// 현재 게임 시각 — visitedNodes.length(경과 턴) 기반 시계. day는 currentDay와 동기. (systems/time.ts)
const clock = computed(() => clockOfTurn(run.data.visitedNodes.length));
const clockHHMM = computed(() => clockLabel(run.data.visitedNodes.length));

/**
 * 표시용 HP — 전투 중이면 *전투 내 실시간 HP*를 우선한다(B1 수정).
 * 격자 전투는 run.gridCombat.player, 구 1v1 전투는 run.combat.player가 진짜 HP를 들고 있는데,
 * run.data.hp는 전투 종료 후에야 라이트백되어 전투 내내 옛값(예 41/41)을 보여 주던 비동기 버그를 막는다.
 * 전투가 없으면 그대로 런 HP.
 */
const displayHp = computed(() =>
  run.data.gridCombat?.player.hp ?? run.data.combat?.player.hp ?? run.data.hp,
);
const displayMaxHp = computed(() =>
  run.data.gridCombat?.player.maxHp ?? run.data.combat?.player.maxHp ?? run.data.maxHp,
);

const hpRatio = computed(() => {
  if (displayMaxHp.value === 0) return 0;
  return displayHp.value / displayMaxHp.value;
});

const hpColor = computed(() => {
  const r = hpRatio.value;
  if (r > 0.6) return '#8effb8';
  if (r > 0.3) return '#ffe88e';
  return '#ff8e8e';
});

/** 레벨·경험치 (XP·각성 시스템) — 구세이브 폴백 1/0. 강화권 잔여가 있으면 배지로 알림. */
const level = computed(() => run.data.level ?? 1);
const xp = computed(() => run.data.xp ?? 0);
const pendingPicks = computed(() => run.data.pendingEnhancePicks ?? 0);
function openPicks() {
  if (pendingPicks.value > 0) ui.openEnhancePick();
}

/**
 * 전투 후에도 *런에 지속*되는 상태/효과 — 체력과 골드 사이에 작은 배지로 표시.
 * 부정(혼란·심수화)과 지속 요소(축복·방울 표식·드래곤화) 모두. 활성인 것만 노출(없으면 슬롯 자체 숨김).
 */
const persistentStatuses = computed(() => {
  const r = run.data;
  const out: { key: string; emoji: string; label: string; tip: string; bad: boolean }[] = [];
  if ((r.possessed ?? 0) > 0) {
    out.push({ key: 'possessed', emoji: '🌀', label: `혼란 ${r.possessed}`, bad: true,
      tip: '혼란 — 전투에서 주는 피해가 절반이 되고 매 턴 HP를 잃습니다. 마을·전투·하루 경과로 정화됩니다.' });
  }
  if ((r.feralHeavy ?? 0) > 0) {
    out.push({ key: 'feral-heavy', emoji: '🐺', label: '심수화', bad: true,
      tip: '심수화 — 공격이 2배지만 회복도 방어도 못 합니다. 탐색 보상이 늘고, 마을이나 휴식에서만 가라앉습니다.' });
  }
  if ((r.blessingCombats ?? 0) > 0) {
    out.push({ key: 'blessing', emoji: '✨', label: `축복 ${r.blessingCombats}`, bad: false,
      tip: `축복 — 앞으로 ${r.blessingCombats}번의 전투까지 보상이 25% 늘어납니다.` });
  }
  if ((r.bellMarked ?? 0) > 0) {
    out.push({ key: 'bell', emoji: '🔔', label: '방울 표식', bad: false,
      tip: '방울 표식 — 다음 일반 전투가 엘리트 전투로 바뀝니다.' });
  }
  if ((r.dragonCombats ?? 0) > 0) {
    out.push({ key: 'dragon', emoji: '🐉', label: `드래곤화 ${r.dragonCombats}`, bad: false,
      tip: `드래곤화 — 남은 ${r.dragonCombats}번의 전투 동안 모든 컬러가 상승합니다.` });
  }
  return out;
});
</script>

<template>
  <header class="hud">
    <div class="row row--main">
      <!-- HP -->
      <Tooltip text="체력. 0이 되면 목숨 1개 소모.">
        <div class="slot slot--hp">
          <span class="emoji">❤</span>
          <span class="lbl">HP</span>
          <div class="bar"><div class="bar__fill" :style="{ width: hpRatio * 100 + '%', background: hpColor }" /></div>
          <span class="num">{{ displayHp }}/{{ displayMaxHp }}</span>
        </div>
      </Tooltip>

      <!-- 레벨·경험치 (XP·각성) — 전투 승리로 적립. 강화권이 있으면 눌러서 강화 픽 모달을 연다. -->
      <Tooltip :text="`경험치 ${xp}/${XP_PER_LEVEL}${pendingPicks > 0 ? ` · 강화권 ${pendingPicks} (눌러서 사용)` : ''}`">
        <button
          class="slot slot--level"
          :class="{ 'slot--level-pick': pendingPicks > 0 }"
          :disabled="pendingPicks <= 0"
          aria-label="레벨·강화"
          @click="openPicks"
        >
          <span class="emoji">⭐</span>
          <span class="lbl">Lv</span>
          <span class="num">{{ level }}</span>
          <span v-if="pendingPicks > 0" class="pickbadge">+{{ pendingPicks }}</span>
        </button>
      </Tooltip>

      <!-- 현재 시각 — 1일차 정오 시작, 행동·이동마다 시간이 흐른다(1회 14.4분). -->
      <Tooltip text="4일차 정오에 런 종료.">
        <div class="slot" :class="{ 'slot--urgent': timeUrgent }">
          <span class="emoji">🕛</span>
          <span class="lbl">{{ clock.day }}일차</span>
          <span class="num">{{ clockHHMM }}</span>
        </div>
      </Tooltip>

      <!-- 전투 후 지속 상태 — 활성인 것만. -->
      <div v-if="persistentStatuses.length" class="slot slot--status">
        <Tooltip v-for="s in persistentStatuses" :key="s.key" :text="s.tip">
          <span class="statusbadge" :class="{ 'statusbadge--bad': s.bad }">
            <span class="emoji">{{ s.emoji }}</span>
            <span class="lbl">{{ s.label }}</span>
          </span>
        </Tooltip>
      </div>

      <!-- 데스크톱: 3 버튼 분리. (모바일에서는 .desk-only로 숨김) -->
      <Tooltip text="캐릭터의 스테이터스를 확인한다.">
        <button
          class="slot slot--btn slot--menu desk-only"
          :class="{ 'slot--btn-on': characterOpen }"
          aria-label="캐릭터 메뉴"
          @click="emit('toggle-character')"
        >
          <span class="emoji">👤</span>
          <span class="lbl">캐릭터</span>
        </button>
      </Tooltip>

      <Tooltip text="가지고 있는 아이템을 확인한다.">
        <button
          class="slot slot--btn slot--menu desk-only"
          :class="{ 'slot--btn-on': inventoryOpen }"
          aria-label="소지품 메뉴"
          @click="emit('toggle-inventory')"
        >
          <span class="emoji">🎒</span>
          <span class="lbl">소지품</span>
        </button>
      </Tooltip>

      <Tooltip text="설정 — 현재 시대 확인, 런 포기.">
        <button
          class="slot slot--btn slot--menu desk-only"
          :class="{ 'slot--btn-on': settingsOpen }"
          aria-label="설정 메뉴"
          @click="emit('toggle-settings')"
        >
          <span class="emoji">⚙</span>
          <span class="lbl">설정</span>
        </button>
      </Tooltip>

      <!-- 모바일: 햄버거 1개 + 드롭다운(.mob-only 로만 노출). 버튼이 늘어나도 가려지지 않게. -->
      <div class="menu-wrap mob-only">
        <button
          class="slot slot--btn slot--menu menu-toggle"
          :class="{ 'slot--btn-on': menuOpen || characterOpen || inventoryOpen || settingsOpen }"
          aria-label="메뉴"
          :aria-expanded="menuOpen"
          @click.stop="toggleMenu"
        >
          <span class="emoji">≡</span>
        </button>
        <transition name="menu-fade">
          <div v-if="menuOpen" class="menu-pop" role="menu">
            <button class="menu-pop__item" :class="{ 'menu-pop__item--on': characterOpen }" role="menuitem" @click="openMenuItem('character')">
              <span class="menu-pop__emoji">👤</span><span class="menu-pop__label">캐릭터</span>
            </button>
            <button class="menu-pop__item" :class="{ 'menu-pop__item--on': inventoryOpen }" role="menuitem" @click="openMenuItem('inventory')">
              <span class="menu-pop__emoji">🎒</span><span class="menu-pop__label">소지품</span>
            </button>
            <button class="menu-pop__item" :class="{ 'menu-pop__item--on': settingsOpen }" role="menuitem" @click="openMenuItem('settings')">
              <span class="menu-pop__emoji">⚙</span><span class="menu-pop__label">설정</span>
            </button>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--z-hud);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.4rem 0.7rem 0.45rem;
  background: rgba(13, 14, 20, 0.94);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: #d6d6e0;
  font-size: 0.85rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.slot {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.28rem 0.5rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  white-space: nowrap;
  font: inherit;
}
.slot--hp { flex: 1; min-width: 140px; max-width: 260px; }
.slot--hp .bar { flex: 1; height: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; overflow: hidden; }
.slot--hp .bar__fill { height: 100%; transition: width 220ms ease, background 220ms ease; }

/* 레벨 슬롯 — 버튼(강화권 있을 때만 활성). 강화권 잔여 시 노란 펄스 배지. */
.slot--level { gap: 0.28rem; cursor: default; }
.slot--level:disabled { cursor: default; }
.slot--level-pick {
  cursor: pointer;
  background: rgba(246, 232, 184, 0.16);
  border-color: rgba(246, 232, 184, 0.5);
}
.slot--level-pick:hover { background: rgba(246, 232, 184, 0.28); }
.pickbadge {
  font-size: 0.66rem; font-weight: 800; color: #0d0e14;
  background: #ffe88e; border-radius: 8px; padding: 0.02rem 0.34rem;
  animation: pick-pulse 1400ms ease-in-out infinite;
}
@keyframes pick-pulse {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 1; box-shadow: 0 0 6px rgba(255, 232, 142, 0.8); }
}

/* 전투 후 지속 상태 슬롯 — 작은 배지 묶음. */
.slot--status { gap: 0.25rem; padding: 0.2rem 0.3rem; }
.statusbadge {
  display: inline-flex; align-items: center; gap: 0.22rem;
  padding: 0.14rem 0.4rem; border-radius: 10px;
  background: rgba(150, 230, 170, 0.16); border: 1px solid rgba(150, 230, 170, 0.4);
  white-space: nowrap;
}
.statusbadge .lbl { color: #d6f0dd; }
.statusbadge--bad { background: rgba(200, 90, 90, 0.18); border-color: rgba(255, 140, 140, 0.45); }
.statusbadge--bad .lbl { color: #ffc9c9; }

.emoji { font-size: 0.95rem; }
.lbl { color: #c0b693; font-size: 0.78rem; }
.num { font-variant-numeric: tabular-nums; font-weight: 600; color: #f6e8b8; }

.slot--urgent { background: rgba(255, 100, 100, 0.15); border-color: rgba(255, 100, 100, 0.5); }
.slot--urgent .num { color: #ff8e8e; }

.slot--btn { cursor: pointer; transition: background 120ms ease, border-color 120ms ease; }
.slot--btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); }
.slot--btn-on { background: rgba(192, 142, 255, 0.18); border-color: rgba(192, 142, 255, 0.5); }

.slot--menu { margin-left: 0.15rem; }

/* 통합 메뉴 (모바일) — 햄버거 1개 + 드롭다운. */
.menu-wrap { position: relative; }
.menu-pop {
  position: absolute;
  top: calc(100% + 0.45rem);
  right: 0;
  z-index: calc(var(--z-hud) + 1);
  display: flex;
  flex-direction: column;
  min-width: 132px;
  padding: 0.3rem;
  background: rgba(20, 22, 30, 0.98);
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 8px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
}
.menu-pop__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.86rem;
  color: #d6d6e0;
  background: transparent;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.menu-pop__item:hover { background: rgba(192, 142, 255, 0.15); }
.menu-pop__item--on { background: rgba(192, 142, 255, 0.22); color: #f6e8b8; }
.menu-pop__emoji { font-size: 1rem; }
.menu-pop__label { font-weight: 600; }

.menu-fade-enter-active, .menu-fade-leave-active { transition: opacity 130ms ease, transform 130ms ease; }
.menu-fade-enter-from, .menu-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* 데스크톱 기본: 3 버튼 노출, 햄버거 숨김. */
.mob-only { display: none; }

/* 모바일 압축 — 4슬롯 + (3버튼 대신) 햄버거 1개 한 줄 */
@media (max-width: 640px) {
  .hud { padding: 0.28rem 0.35rem 0.36rem; font-size: 0.72rem; gap: 0.2rem; }
  .row { gap: 0.2rem; }
  .slot { padding: 0.2rem 0.32rem; gap: 0.18rem; }
  .lbl { display: none; }
  .slot--hp { min-width: 90px; }
  .slot--hp .bar { height: 6px; }
  .emoji { font-size: 0.85rem; }
  .slot--menu { margin-left: 0.08rem; }
  /* 데스크톱 전용 3 버튼 숨기고, 햄버거 1개 노출 — 슬롯이 늘어나도 메뉴가 가려지지 않게. */
  .desk-only { display: none !important; }
  .mob-only { display: inline-flex; align-items: center; }
}
</style>
