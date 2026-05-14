<script setup lang="ts">
/**
 * 아이템 인벤토리 — *즉시 사용*형 소비품 패널.
 *
 * - 카드 모달과 동일한 패턴.
 * - 클릭 시 useItem 호출. 효과 즉시 적용 + (consumable) 인벤토리에서 제거.
 * - teleport-village 등 *대상이 필요한 효과*는 마을 선택 모달로 분기.
 */

import { computed, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useItem } from '@/systems/item';
import type { Item, Node } from '@/data/schemas';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const data = useDataStore();

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
const rankOrder: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };

const sortedItems = computed(() => {
  return [...run.data.items].sort((a: Item, b: Item) => {
    const r = (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  });
});

// teleport 대상 노드 선택 모달
const teleportFor = ref<Item | null>(null);
const teleportTargets = computed<Node[]>(() => {
  const tl = data.timelines.get(run.data.timelineId);
  const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
  if (!map) return [];
  return map.nodes.filter((n) => n.kind === 'village' && n.id !== run.data.currentNodeId);
});

function tryUse(item: Item) {
  const needsTarget = item.effects.some((e) => e.kind === 'teleport-village');
  if (needsTarget) {
    teleportFor.value = item;
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

watch(
  () => props.open,
  (o) => {
    if (!o) teleportFor.value = null;
  },
);

function effectLabel(eff: Item['effects'][number]): string {
  switch (eff.kind) {
    case 'heal': return `HP +${eff.value ?? 0}`;
    case 'gold': return `골드 +${eff.value ?? 0}`;
    case 'time-shards': return `시간의 조각 +${eff.value ?? 0}`;
    case 'color-boost': return `${eff.param} +${eff.value ?? 0}`;
    case 'color-all': return `8 컬러 모두 +${eff.value ?? 0}`;
    case 'grant-card': return `카드 ${eff.param}`;
    case 'grant-relic': return `유물 ${eff.param}`;
    case 'teleport-village': return '마을로 즉시 이동';
  }
  return '';
}
</script>

<template>
  <transition name="item-fade">
    <div v-if="props.open" class="item-backdrop" @click.self="emit('close')">
      <div class="item-modal" role="dialog">
        <header class="item-modal__hdr">
          <h2>아이템 — {{ sortedItems.length }}개</h2>
          <button class="x" @click="emit('close')" aria-label="닫기">×</button>
        </header>

        <p class="hint">클릭 한 번이면 즉시 효과가 적용됩니다. 소비형 아이템은 한 번 쓰면 사라져요.</p>

        <ul v-if="sortedItems.length > 0" class="items">
          <li
            v-for="it in sortedItems"
            :key="it.instanceId ?? it.id"
            class="item"
            :style="{ borderLeftColor: rankColors[it.rank] }"
            @click="tryUse(it)"
          >
            <div class="item__row">
              <span class="item__name">{{ it.name }}</span>
              <span class="item__rank" :style="{ color: rankColors[it.rank] }">{{ it.rank }}</span>
            </div>
            <div v-if="it.description" class="item__desc">{{ it.description }}</div>
            <div class="item__effects">
              <span v-for="(e, ei) in it.effects" :key="ei" class="effect">{{ effectLabel(e) }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="empty">아직 아이템이 없습니다.</p>

        <!-- teleport 대상 선택 -->
        <transition name="item-fade">
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
      </div>
    </div>
  </transition>
</template>

<style scoped>
.item-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex; align-items: center; justify-content: center;
  z-index: 950; padding: 1rem;
}
.item-modal {
  max-width: 520px; width: 100%;
  max-height: 86vh;
  display: flex; flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1rem 1.2rem 0.8rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.item-modal__hdr {
  display: flex; align-items: center;
  gap: 0.6rem; margin-bottom: 0.4rem;
}
.item-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.1rem; }
.x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.x:hover { color: #f6e8b8; }

.hint { font-size: 0.8rem; color: #888; margin: 0 0 0.6rem; }

.items {
  list-style: none; padding: 0; margin: 0;
  overflow-y: auto; flex: 1;
  display: flex; flex-direction: column; gap: 0.4rem;
}
.item {
  padding: 0.55rem 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  border-left: 3px solid;
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms ease;
}
.item:hover { background: rgba(255, 255, 255, 0.09); }
.item__row { display: flex; align-items: center; gap: 0.5rem; }
.item__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.item__rank { font-size: 0.65rem; text-transform: uppercase; }
.item__desc { font-size: 0.78rem; color: #a4a4b0; margin: 0.2rem 0; }
.item__effects { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.7rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.08rem 0.4rem; border-radius: 3px; color: #b6b6c4; }

.empty { color: #6c6c7c; text-align: center; padding: 2rem; font-style: italic; }

.teleport-modal {
  margin-top: 0.8rem;
  padding: 0.8rem;
  background: rgba(0,0,0,0.5);
  border-radius: 8px;
  border: 1px solid rgba(192, 142, 255, 0.3);
  display: grid;
  gap: 0.5rem;
}
.teleport-modal h3 { color: #f6e8b8; margin: 0; font-size: 0.95rem; }
.teleport-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.3rem; }
.teleport-btn {
  width: 100%;
  padding: 0.5rem 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #f6e8b8;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
.teleport-btn:hover { background: rgba(255, 255, 255, 0.12); }
.teleport-empty { color: #888; font-size: 0.85rem; }
.teleport-cancel {
  padding: 0.4rem 0.8rem;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #888;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

.item-fade-enter-active, .item-fade-leave-active { transition: opacity 180ms ease; }
.item-fade-enter-from, .item-fade-leave-to { opacity: 0; }
</style>
