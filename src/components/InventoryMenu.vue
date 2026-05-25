<script setup lang="ts">
/**
 * 소지품 메뉴 — 글로벌 모달 (M4).
 *
 * 헤더: Day {currentDay}
 * 탭 2개: 유물 / 아이템
 * RelicPanel + ItemPanel 본문을 흡수해 인라인 표시.
 *
 * 기존 RelicPanel.vue / ItemPanel.vue는 dead code 가능 — App.vue에서 import 제거.
 */

import { computed, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useItem, isUsableItem } from '@/systems/item';
import { relicEffectText, relicTriggerLabel, colorLabel, statusLabel } from '@/systems/labels';
import type { Item, Node, Relic } from '@/data/schemas';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const data = useDataStore();

const tab = ref<'relic' | 'item' | 'clue'>('relic');
const expandedClueId = ref<string | null>(null);
function toggleClue(id: string) {
  expandedClueId.value = expandedClueId.value === id ? null : id;
}

// 모달 닫힐 때 텔레포트 sub-modal도 같이 닫고, 탭은 기본값으로 복원
watch(
  () => props.open,
  (o) => {
    if (!o) {
      teleportFor.value = null;
      reviveFor.value = null;
      tab.value = 'relic';
    }
  },
);

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
const rankOrder: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };

// ===== 유물 ===== (라벨은 systems/labels.ts에 중앙화)
function describeRelic(r: Relic): string[] {
  return r.effects.map(relicEffectText);
}

// ===== 아이템 =====
/**
 * 같은 아이템(id)을 한 줄로 묶어 ×N 표시. 대표는 첫 인스턴스.
 * 정렬: 랭크 → 이름. 사용 시에는 대표 인스턴스를 useItem에 넘긴다(소비형은 한 점만 제거됨).
 */
interface ItemGroup { rep: Item; count: number; usable: boolean }
const groupedItems = computed<ItemGroup[]>(() => {
  const map = new Map<string, ItemGroup>();
  for (const it of run.data.items) {
    const g = map.get(it.id);
    if (g) g.count += 1;
    else map.set(it.id, { rep: it, count: 1, usable: isUsableItem(it) });
  }
  return [...map.values()].sort((a, b) => {
    const r = (rankOrder[a.rep.rank] ?? 0) - (rankOrder[b.rep.rank] ?? 0);
    if (r !== 0) return r;
    return a.rep.name.localeCompare(b.rep.name);
  });
});

const teleportFor = ref<Item | null>(null);
const teleportTargets = computed<Node[]>(() => {
  const tl = data.timelines.get(run.data.timelineId);
  const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
  if (!map) return [];
  return map.nodes.filter((n) => n.kind === 'village' && n.id !== run.data.currentNodeId);
});

// 부활 포션 — 이미 소진한 노드(전투 정리/사건 지남/활동 완료/채집)를 되살릴 대상 선택.
const reviveFor = ref<Item | null>(null);
const reviveTargets = computed<Node[]>(() => {
  const tl = data.timelines.get(run.data.timelineId);
  const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
  if (!map) return [];
  return map.nodes.filter((n) => {
    const st = run.data.nodeStates[n.id];
    if (!st) return false;
    return (
      !!st.combatCleared ||
      !!st.combatStealthed ||
      !!st.eventTriggered ||
      !!st.activityDone ||
      !!st.gatherDone
    );
  });
});

function tryUseItem(item: Item) {
  // 재료/특산물 등 사용 불가 아이템은 클릭해도 무반응(useItem이 가드하지만 UI에서도 차단).
  if (!isUsableItem(item)) return;
  if (item.effects.some((e) => e.kind === 'teleport-village')) {
    teleportFor.value = item;
    return;
  }
  if (item.effects.some((e) => e.kind === 'revive-node')) {
    reviveFor.value = item;
    return;
  }
  useItem(item);
}
function confirmTeleport(nodeId: string) {
  const item = teleportFor.value;
  if (!item) return;
  useItem(item, { selectedNodeId: nodeId });
  teleportFor.value = null;
}
function confirmRevive(nodeId: string) {
  const item = reviveFor.value;
  if (!item) return;
  useItem(item, { selectedNodeId: nodeId });
  reviveFor.value = null;
}
function itemEffectLabel(eff: Item['effects'][number]): string {
  switch (eff.kind) {
    case 'heal': return `HP +${eff.value ?? 0}`;
    case 'gold': return `골드 +${eff.value ?? 0}`;
    case 'time-shards': return `시간의 조각 +${eff.value ?? 0}`;
    case 'color-boost': return `${colorLabel(String(eff.param ?? ''))} +${eff.value ?? 0}`;
    case 'color-all': return `8 컬러 모두 +${eff.value ?? 0}`;
    case 'grant-card': return `카드 ${data.cards.get(String(eff.param ?? ''))?.name ?? eff.param}`;
    case 'grant-relic': return `유물 ${data.relics.get(String(eff.param ?? ''))?.name ?? eff.param}`;
    case 'teleport-village': return '마을로 즉시 이동';
    case 'revive-node': return '다녀온 장소 1곳 되살리기';
    case 'cleanse-transform': return '변신 정화';
    case 'combat-mana': return `[전투] 마나 +${eff.value ?? 0}`;
    case 'combat-draw': return `[전투] 드로우 ${eff.value ?? 0}`;
    case 'combat-block': return `[전투] 방어 +${eff.value ?? 0}`;
    case 'combat-enemy-status': return `[전투] 적 ${statusLabel(String(eff.param ?? ''))} +${eff.value ?? 0}`;
    case 'combat-self-status': return `[전투] ${statusLabel(String(eff.param ?? ''))} +${eff.value ?? 0}`;
    case 'combat-free-grapple': return '[전투] 구속 해제';
    case 'cleanse-group': {
      const g: Record<string, string> = {
        low: '하급 디버프 정화', mid: '중급 디버프 정화', high: '상급 디버프 정화', all: '디버프 전체 정화',
      };
      return `[전투] ${g[String(eff.param ?? 'all')] ?? '디버프 정화'}`;
    }
  }
  return '';
}
</script>

<template>
  <transition name="inv-fade">
    <div v-if="open" class="inv-backdrop" @click.self="emit('close')">
      <div class="inv-modal" role="dialog" aria-label="소지품 메뉴">
        <header class="inv-modal__hdr">
          <h2>소지품</h2>
          <span class="inv-day">Day {{ run.data.currentDay }}</span>
          <button class="inv-modal__x" aria-label="닫기" @click="emit('close')">×</button>
        </header>

        <!-- 탭 -->
        <div class="inv-tabs" role="tablist">
          <button
            class="inv-tab"
            :class="{ 'inv-tab--on': tab === 'relic' }"
            role="tab"
            :aria-selected="tab === 'relic'"
            @click="tab = 'relic'"
          >
            <span class="inv-tab__icon">💎</span>
            <span>유물 ({{ run.data.relics.length }})</span>
          </button>
          <button
            class="inv-tab"
            :class="{ 'inv-tab--on': tab === 'item' }"
            role="tab"
            :aria-selected="tab === 'item'"
            @click="tab = 'item'"
          >
            <span class="inv-tab__icon">📦</span>
            <span>아이템 ({{ run.data.items.length }})</span>
          </button>
          <button
            class="inv-tab"
            :class="{ 'inv-tab--on': tab === 'clue' }"
            role="tab"
            :aria-selected="tab === 'clue'"
            @click="tab = 'clue'"
          >
            <span class="inv-tab__icon">📜</span>
            <span>단서 ({{ run.data.clues?.length ?? 0 }})</span>
          </button>
        </div>

        <!-- 유물 탭 -->
        <div v-if="tab === 'relic'" class="inv-body">
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
              <div class="rel-card__trigger">{{ relicTriggerLabel(r.trigger) }}</div>
              <ul class="rel-card__effects">
                <li v-for="(t, ei) in describeRelic(r)" :key="ei">· {{ t }}</li>
              </ul>
              <p v-if="r.flavor" class="rel-card__flavor">{{ r.flavor }}</p>
            </li>
          </ul>
        </div>

        <!-- 아이템 탭 -->
        <div v-else-if="tab === 'item'" class="inv-body">
          <p class="hint">클릭 한 번이면 즉시 효과가 적용됩니다. 재료·특산물은 공방 제작에만 쓰입니다.</p>
          <ul v-if="groupedItems.length > 0" class="items">
            <li
              v-for="g in groupedItems"
              :key="g.rep.id"
              class="item"
              :class="{ 'item--material': !g.usable }"
              :style="{ borderLeftColor: rankColors[g.rep.rank] }"
              @click="tryUseItem(g.rep)"
            >
              <div class="item__row">
                <span class="item__name">
                  {{ g.rep.name }}<span v-if="g.count > 1" class="item__x">×{{ g.count }}</span>
                </span>
                <span v-if="!g.usable" class="item__tag">재료</span>
                <span class="item__rank" :style="{ color: rankColors[g.rep.rank] }">{{ g.rep.rank }}</span>
              </div>
              <div v-if="g.rep.description" class="item__desc">{{ g.rep.description }}</div>
              <div v-if="g.rep.effects.length > 0" class="item__effects">
                <span v-for="(e, ei) in g.rep.effects" :key="ei" class="effect">{{ itemEffectLabel(e) }}</span>
              </div>
            </li>
          </ul>
          <p v-else class="empty">아직 아이템이 없습니다.</p>

          <!-- teleport 대상 선택 (인라인) -->
          <transition name="inv-fade">
            <div v-if="teleportFor" class="teleport-modal">
              <h3>이동할 마을 선택</h3>
              <ul class="teleport-list">
                <li v-for="n in teleportTargets" :key="n.id">
                  <button class="teleport-btn" @click="confirmTeleport(n.id)">{{ n.label }}</button>
                </li>
                <li v-if="teleportTargets.length === 0" class="teleport-empty">
                  이동할 다른 마을이 없습니다.
                </li>
              </ul>
              <button class="teleport-cancel" @click="teleportFor = null">취소</button>
            </div>
          </transition>

          <!-- 부활 대상 선택 (인라인) -->
          <transition name="inv-fade">
            <div v-if="reviveFor" class="teleport-modal">
              <h3>되살릴 장소 선택</h3>
              <ul class="teleport-list">
                <li v-for="n in reviveTargets" :key="n.id">
                  <button class="teleport-btn" @click="confirmRevive(n.id)">{{ n.label }}</button>
                </li>
                <li v-if="reviveTargets.length === 0" class="teleport-empty">
                  되살릴 장소가 없습니다 — 아직 지나온 곳이 없습니다.
                </li>
              </ul>
              <button class="teleport-cancel" @click="reviveFor = null">취소</button>
            </div>
          </transition>
        </div>

        <!-- 단서 탭 -->
        <div v-else class="inv-body">
          <p class="hint">단서를 클릭하면 내용이 펼쳐집니다. 단서는 사라지지 않습니다.</p>
          <ul v-if="(run.data.clues?.length ?? 0) > 0" class="clue-list">
            <li
              v-for="c in run.data.clues"
              :key="c.id"
              class="clue"
              :class="{ 'clue--open': expandedClueId === c.id }"
              @click="toggleClue(c.id)"
            >
              <div class="clue__head">
                <span class="clue__name">{{ c.name }}</span>
                <span v-if="c.source" class="clue__source">{{ c.source }}</span>
              </div>
              <p v-if="expandedClueId === c.id" class="clue__body">{{ c.body }}</p>
            </li>
          </ul>
          <p v-else class="empty">아직 단서가 없습니다.</p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.inv-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 1rem;
}
.inv-modal {
  max-width: 560px;
  width: 100%;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1rem 1.2rem 0.9rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.inv-modal__hdr {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.6rem;
}
.inv-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.2rem; }
.inv-day {
  background: rgba(192, 142, 255, 0.18);
  border: 1px solid rgba(192, 142, 255, 0.4);
  color: #f6e8b8;
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.inv-modal__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.inv-modal__x:hover { color: #f6e8b8; }

/* 탭 */
.inv-tabs {
  display: flex;
  gap: 0.3rem;
  margin-bottom: 0.7rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  overflow-x: auto;
}
.inv-tab {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: 0.85rem;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  transition: color 120ms ease, border-color 120ms ease;
}
.inv-tab:hover { color: #f6e8b8; }
.inv-tab--on {
  color: #f6e8b8;
  border-bottom-color: #c08eff;
}
.inv-tab__icon { font-size: 0.95rem; }

.inv-body {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  gap: 0.4rem;
}

.hint { font-size: 0.78rem; color: #888; margin: 0 0 0.3rem; }
.empty { color: #6c6c7c; text-align: center; padding: 1.6rem; font-style: italic; margin: 0; }

/* 단서 탭 */
.clue-list { list-style: none; padding: 0; margin: 0.4rem 0 0; display: flex; flex-direction: column; gap: 0.4rem; }
.clue {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-left: 3px solid #c08eff;
  border-radius: 6px;
  padding: 0.5rem 0.7rem;
  cursor: pointer;
  transition: background 140ms;
}
.clue:hover { background: rgba(255,255,255,0.08); }
.clue--open { background: rgba(192, 142, 255, 0.10); }
.clue__head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
.clue__name { color: #f6e8b8; font-weight: 600; font-size: 0.92rem; }
.clue__source { color: #888; font-size: 0.76rem; font-style: italic; }
.clue__body {
  color: #d0d0dc;
  font-size: 0.85rem;
  line-height: 1.55;
  margin: 0.5rem 0 0;
  padding-top: 0.4rem;
  border-top: 1px dashed rgba(255,255,255,0.10);
  white-space: pre-wrap;
}

/* 유물 카드 */
.rel-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.rel-card {
  padding: 0.65rem 0.85rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
}
.rel-card__head { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.2rem; }
.rel-card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.rel-card__rank { font-size: 0.7rem; text-transform: uppercase; }
.rel-card__trigger { font-size: 0.78rem; color: #c08eff; margin-bottom: 0.25rem; }
.rel-card__effects { margin: 0; padding: 0; list-style: none; font-size: 0.82rem; color: #b6b6c4; }
.rel-card__effects li { padding: 0.08rem 0; }
.rel-card__flavor { font-size: 0.72rem; color: #6c6c7c; font-style: italic; margin: 0.35rem 0 0; }

/* 아이템 카드 */
.items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.item {
  padding: 0.55rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.item:hover { background: rgba(255, 255, 255, 0.09); }
/* 재료/특산물 — 사용 불가. 클릭 비활성 + 흐림 + 기본 커서. */
.item--material { cursor: default; opacity: 0.72; }
.item--material:hover { background: rgba(255, 255, 255, 0.04); }
.item__row { display: flex; align-items: center; gap: 0.5rem; }
.item__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.item__x { margin-left: 0.3rem; color: #c08eff; font-weight: 700; font-size: 0.85em; }
.item__tag {
  font-size: 0.62rem;
  color: #c0b693;
  border: 1px solid rgba(192, 182, 147, 0.4);
  border-radius: 3px;
  padding: 0.04rem 0.32rem;
}
.item__rank { font-size: 0.65rem; text-transform: uppercase; }
.item__desc { font-size: 0.78rem; color: #a4a4b0; margin: 0.2rem 0; }
.item__effects { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.7rem; }
.effect { background: rgba(0, 0, 0, 0.4); padding: 0.08rem 0.4rem; border-radius: 3px; color: #b6b6c4; }

/* 텔레포트 인라인 */
.teleport-modal {
  margin-top: 0.6rem;
  padding: 0.7rem;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 8px;
  border: 1px solid rgba(192, 142, 255, 0.3);
  display: grid;
  gap: 0.4rem;
}
.teleport-modal h3 { color: #f6e8b8; margin: 0; font-size: 0.9rem; }
.teleport-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.3rem; }
.teleport-btn {
  width: 100%;
  padding: 0.45rem 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f6e8b8;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.teleport-btn:hover { background: rgba(255, 255, 255, 0.12); }
.teleport-empty { color: #888; font-size: 0.82rem; }
.teleport-cancel {
  padding: 0.35rem 0.7rem;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  justify-self: end;
}

.inv-fade-enter-active, .inv-fade-leave-active { transition: opacity 180ms ease; }
.inv-fade-enter-from, .inv-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .inv-modal { padding: 0.8rem 0.9rem 0.7rem; }
  .inv-modal__hdr h2 { font-size: 1.05rem; }
  .inv-tab { padding: 0.35rem 0.55rem; font-size: 0.78rem; }
}
</style>
