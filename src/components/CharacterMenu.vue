<script setup lang="ts">
/**
 * 캐릭터 메뉴 — 글로벌 모달 (M3 → M10에서 장비 섹션 추가).
 *
 * 섹션 5개 (세로 스크롤):
 *   1) 6 컬러 막대 (불·전기·흙·철·물·바람 — 순서 절대 보존). effective 표시.
 *   2) 도출 스탯 ATK/DEF/MAG + 전투 보너스 (effective 기반)
 *   3) 장비 (M10) — 장착 3슬롯 + 소지 인벤토리. 클릭 토글.
 *   4) 덱 (요약 + 편집 버튼 → DeckPanel)
 *   5) 동료 (NPC 이름 + 슬롯 N/3)
 *
 * RelicPanel과 동일 모달 패턴, z-index 950.
 * DeckPanel은 nested 모달 (z-index 960).
 */

import { computed, ref } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { deriveStats, deriveBonuses } from '@/systems/stats';
import {
  effectiveColors,
  labelOfColor,
  labelOfSlot,
  recomputeAndCascadeUnequip,
  tryEquip,
  unequip,
} from '@/systems/equipment';
import type { Element, Equipment, EquipmentSlot } from '@/data/schemas';
import DeckPanel from '@/components/DeckPanel.vue';
import Tooltip from '@/components/Tooltip.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

// 6 컬러 막대 (GameHUD.vue:50 colorBars 원본 순서 그대로 — 절대 변경 금지)
interface ColorBar {
  key: 'fire' | 'electric' | 'earth' | 'iron' | 'water' | 'wind';
  label: string;
  color: string;
  meaning: string;
}
const colorBars: ColorBar[] = [
  { key: 'fire',     label: '불',   color: '#ff8e8e', meaning: '불 — 전기와 함께 ATK(공격력) 산출' },
  { key: 'electric', label: '전기', color: '#f2e36a', meaning: '전기 — 불과 함께 ATK(공격력) 산출' },
  { key: 'earth',    label: '흙',   color: '#c2a36a', meaning: '흙 — 철과 함께 DEF(방어력) 산출' },
  { key: 'iron',     label: '철',   color: '#a4a4b0', meaning: '철 — 흙과 함께 DEF(방어력) 산출' },
  { key: 'water',    label: '물',   color: '#8eedff', meaning: '물 — 바람과 함께 MAG(마법) 산출' },
  { key: 'wind',     label: '바람', color: '#a8e8b8', meaning: '바람 — 물과 함께 MAG(마법) 산출' },
];

const COLOR_CAP = 100;
const COLOR_HEX: Record<Element, string> = {
  fire: '#ff8e8e',
  electric: '#f2e36a',
  earth: '#c2a36a',
  iron: '#a4a4b0',
  water: '#8eedff',
  wind: '#a8e8b8',
  light: '#f6e8b8',
  dark: '#c08eff',
};

// effective(베이스 + 장비)으로 표시. 음수는 표시 시 0 clamp.
const effective = computed(() => effectiveColors(run.data, data.equipments));
function colorEffectiveValue(key: ColorBar['key']) {
  return Math.max(0, effective.value[key] ?? 0);
}
function colorPct(key: ColorBar['key']) {
  return Math.min(100, Math.round((colorEffectiveValue(key) / COLOR_CAP) * 100));
}

const stats = computed(() => deriveStats(effective.value));
const bonus = computed(() => deriveBonuses(stats.value));

const companionNames = computed(() =>
  run.data.companions.map((id) => data.npcs.get(id)?.name ?? id),
);

// 덱 편집 nested 모달
const deckEditOpen = ref(false);
function openDeckEdit() {
  deckEditOpen.value = true;
}

// === 장비 (M10) ===
// 사용자 요청(2026-05): 가방에서 장비 섹션 *숨김*. 시스템 코드/데이터는 전투에 연결돼 있으므로
// 삭제하지 않고 UI 섹션만 끈다(장착 아이템 없으면 보너스 0이라 무해). 토글로 되살릴 수 있게 상수화.
const SHOW_EQUIPMENT = false;
interface SlotMeta { key: EquipmentSlot; icon: string; }
const slotMetas: SlotMeta[] = [
  { key: 'weapon', icon: '🗡' },
  { key: 'chest', icon: '🎽' },
  { key: 'accessory', icon: '💍' },
];

function equippedAt(slot: EquipmentSlot): Equipment | undefined {
  const id = slot === 'weapon'
    ? run.data.equippedWeapon
    : slot === 'chest'
    ? run.data.equippedChest
    : run.data.equippedAccessory;
  if (!id) return undefined;
  return data.equipments.get(id) ?? run.data.equipmentInventory.find((e) => e.id === id);
}

const equipmentInventoryView = computed(() => run.data.equipmentInventory);

function onEquipClick(eq: Equipment) {
  const result = tryEquip(run.data, data.equipments, eq);
  if (!result.ok) {
    ui.toast('warning', `${eq.name} 장착 불가 — ${labelOfColor(result.failingColor)} 컬러가 부족합니다.`);
    return;
  }
  ui.toast('success', `${eq.name} 장착`);
  // 장착 후 다른 카스케이드는 거의 없지만 안전 차원에서 재평가.
  const cascadeRemoved = recomputeAndCascadeUnequip(run.data, data.equipments);
  for (const r of cascadeRemoved) {
    ui.toast('info', `${r.name} 자동 해제 (컬러 조건 부족)`);
  }
}

function onUnequipClick(slot: EquipmentSlot) {
  const target = equippedAt(slot);
  if (!target) return;
  const { removed } = unequip(run.data, data.equipments, slot);
  ui.toast('info', `${target.name} 해제`);
  for (const r of removed) {
    ui.toast('info', `${r.name} 자동 해제 (컬러 조건 부족)`);
  }
}
</script>

<template>
  <transition name="cm-fade">
    <div v-if="open" class="cm-backdrop" @click.self="emit('close')">
      <div class="cm-modal" role="dialog" aria-label="캐릭터 메뉴">
        <header class="cm-modal__hdr">
          <h2>캐릭터</h2>
          <button class="cm-modal__x" aria-label="닫기" @click="emit('close')">×</button>
        </header>

        <div class="cm-body">
          <!-- 1) 6 컬러 (effective — base + 장비 합산) -->
          <section class="cm-sec">
            <h3 class="cm-sec__title">6 컬러</h3>
            <div class="cm-colors">
              <Tooltip
                v-for="c in colorBars"
                :key="c.key"
                :text="`${c.meaning} (실효 ${colorEffectiveValue(c.key)} / ${COLOR_CAP}, 베이스 ${run.data.colors[c.key]})`"
              >
                <div class="cm-color">
                  <span class="cm-color__label" :style="{ color: c.color }">{{ c.label }}</span>
                  <div class="cm-color__bar">
                    <div class="cm-color__fill" :style="{ width: colorPct(c.key) + '%', background: c.color }" />
                  </div>
                  <span class="cm-color__num">{{ colorEffectiveValue(c.key) }}</span>
                </div>
              </Tooltip>
            </div>
          </section>

          <!-- 2) 히페리온 (= 6 컬러로 산출된 한 런의 최종 결과 능력. ATK/DEF/MAG/드로우/마나 보너스의 총합) -->
          <section class="cm-sec">
            <Tooltip text="히페리온 — 6 컬러가 누적되어 만들어진 *이 런의 최종 결과 능력*. ATK / DEF / MAG / 드로우 / 마나 보너스의 총합.">
              <h3 class="cm-sec__title">히페리온</h3>
            </Tooltip>
            <div class="cm-stats">
              <Tooltip text="ATK — 불·전기로 산출. 공격 카드 최소 데미지 +(ATK/10)">
                <div class="cm-stat cm-stat--atk">
                  <span class="cm-stat__lbl">ATK</span>
                  <span class="cm-stat__val">{{ Math.round(stats.atk) }}</span>
                  <span class="cm-stat__bonus">+{{ bonus.damage }}</span>
                </div>
              </Tooltip>
              <Tooltip text="DEF — 흙·철로 산출. 방어 카드 방어력 +(DEF/10)">
                <div class="cm-stat cm-stat--def">
                  <span class="cm-stat__lbl">DEF</span>
                  <span class="cm-stat__val">{{ Math.round(stats.def) }}</span>
                  <span class="cm-stat__bonus">+{{ bonus.block }}</span>
                </div>
              </Tooltip>
              <Tooltip text="MAG — 물·바람으로 산출. MAG 10단위 — 홀수마다 드로우+1, 짝수마다 마나+1">
                <div class="cm-stat cm-stat--mag">
                  <span class="cm-stat__lbl">MAG</span>
                  <span class="cm-stat__val">{{ Math.round(stats.mag) }}</span>
                  <span class="cm-stat__bonus">D+{{ bonus.drawExtra }} / M+{{ bonus.manaExtra }}</span>
                </div>
              </Tooltip>
            </div>
          </section>

          <!-- 3) 장비 (M10) — 사용자 요청으로 가방 UI에서 숨김. 시스템(전투 보너스)은 유지. -->
          <section v-if="SHOW_EQUIPMENT" class="cm-sec">
            <h3 class="cm-sec__title">장비</h3>
            <div class="cm-equip-slots">
              <div
                v-for="m in slotMetas"
                :key="m.key"
                class="cm-equip-slot"
                :class="{ 'cm-equip-slot--filled': !!equippedAt(m.key) }"
              >
                <div class="cm-equip-slot__hdr">
                  <span class="cm-equip-slot__icon">{{ m.icon }}</span>
                  <span class="cm-equip-slot__title">{{ labelOfSlot(m.key) }}</span>
                  <button
                    v-if="equippedAt(m.key)"
                    class="cm-equip-slot__off"
                    aria-label="해제"
                    @click="onUnequipClick(m.key)"
                  >해제</button>
                </div>
                <div v-if="equippedAt(m.key)" class="cm-equip-slot__body">
                  <span class="cm-equip-slot__name">{{ equippedAt(m.key)!.name }}</span>
                  <div class="cm-equip-effects">
                    <span
                      v-for="(ce, i) in equippedAt(m.key)!.colorEffects"
                      :key="i"
                      class="cm-equip-chip"
                      :class="{ 'cm-equip-chip--neg': ce.value < 0 }"
                      :style="{ color: COLOR_HEX[ce.color] }"
                    >
                      {{ labelOfColor(ce.color) }} {{ ce.value >= 0 ? '+' : '' }}{{ ce.value }}
                    </span>
                  </div>
                </div>
                <div v-else class="cm-equip-slot__empty">비어있음</div>
              </div>
            </div>

            <div class="cm-equip-inv">
              <div class="cm-equip-inv__title">소지중 ({{ equipmentInventoryView.length }})</div>
              <p v-if="equipmentInventoryView.length === 0" class="cm-empty">소지중인 장비가 없습니다.</p>
              <ul v-else class="cm-equip-inv__list">
                <li
                  v-for="(eq, i) in equipmentInventoryView"
                  :key="`${eq.id}-${i}`"
                  class="cm-equip-inv__item"
                >
                  <span class="cm-equip-inv__icon">{{ eq.slot === 'weapon' ? '🗡' : eq.slot === 'chest' ? '🎽' : '💍' }}</span>
                  <div class="cm-equip-inv__main">
                    <span class="cm-equip-inv__name">{{ eq.name }}</span>
                    <div class="cm-equip-effects">
                      <span
                        v-for="(ce, j) in eq.colorEffects"
                        :key="j"
                        class="cm-equip-chip"
                        :class="{ 'cm-equip-chip--neg': ce.value < 0 }"
                        :style="{ color: COLOR_HEX[ce.color] }"
                      >
                        {{ labelOfColor(ce.color) }} {{ ce.value >= 0 ? '+' : '' }}{{ ce.value }}
                      </span>
                    </div>
                  </div>
                  <button class="cm-equip-inv__on" @click="onEquipClick(eq)">장착</button>
                </li>
              </ul>
            </div>
          </section>

          <!-- 4) 덱 -->
          <section class="cm-sec">
            <h3 class="cm-sec__title">덱</h3>
            <div class="cm-deck">
              <div class="cm-deck__summary">
                <span class="cm-deck__count">{{ run.data.deck.length }} / {{ run.data.deckSize }}</span>
                <span class="cm-deck__hint">전투에 들고 갈 카드</span>
              </div>
              <button class="cm-btn cm-btn--primary" @click="openDeckEdit">덱 편집</button>
            </div>
          </section>

          <!-- 5) 동료 -->
          <section class="cm-sec">
            <h3 class="cm-sec__title">동료 ({{ run.data.companions.length }}/3)</h3>
            <p v-if="run.data.companions.length === 0" class="cm-empty">아직 동료가 없습니다.</p>
            <ul v-else class="cm-companions">
              <li v-for="(name, i) in companionNames" :key="i" class="cm-companion">
                <span class="cm-companion__icon">🤝</span>
                <span class="cm-companion__name">{{ name }}</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </transition>

  <!-- nested 덱 편집 (z-index 960) -->
  <DeckPanel :open="deckEditOpen" @close="deckEditOpen = false" />
</template>

<style scoped>
.cm-backdrop {
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
.cm-modal {
  max-width: 560px;
  width: 100%;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1.2rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.cm-modal__hdr {
  display: flex;
  align-items: center;
  margin-bottom: 0.6rem;
}
.cm-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.2rem; }
.cm-modal__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.cm-modal__x:hover { color: #f6e8b8; }

.cm-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.cm-sec__title {
  font-size: 0.78rem;
  color: #c0b693;
  margin: 0 0 0.4rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* 6 컬러 */
.cm-colors {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}
.cm-color {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  padding: 0.3rem 0.55rem;
  border-radius: 4px;
  width: 100%;
}
.cm-color__label {
  font-size: 0.82rem;
  font-weight: 700;
  min-width: 2.4em;
}
.cm-color__bar {
  flex: 1;
  height: 6px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 3px;
  overflow: hidden;
}
.cm-color__fill {
  height: 100%;
  transition: width 280ms ease;
}
.cm-color__num {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: #d6d6e0;
  min-width: 2.2em;
  text-align: right;
}

/* 스탯 */
.cm-stats {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.cm-stat {
  flex: 1;
  min-width: 110px;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.05);
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  border-left: 3px solid;
}
.cm-stat--atk { border-color: #ff8e8e; }
.cm-stat--def { border-color: #a4a4b0; }
.cm-stat--mag { border-color: #8eedff; }
.cm-stat__lbl { font-size: 0.7rem; color: #c0b693; }
.cm-stat__val { font-size: 1.2rem; font-weight: 700; color: #f6e8b8; font-variant-numeric: tabular-nums; }
.cm-stat__bonus { font-size: 0.7rem; color: #c08eff; margin-top: 0.1rem; }

/* 덱 */
.cm-deck {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
}
.cm-deck__summary { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
.cm-deck__count { font-size: 1rem; color: #f6e8b8; font-weight: 700; font-variant-numeric: tabular-nums; }
.cm-deck__hint { font-size: 0.72rem; color: #6c6c7c; }

.cm-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #d6d6e0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 120ms ease, border-color 120ms ease;
}
.cm-btn:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.3); }
.cm-btn--primary {
  background: rgba(192, 142, 255, 0.18);
  border-color: rgba(192, 142, 255, 0.5);
  color: #f6e8b8;
}
.cm-btn--primary:hover { background: rgba(192, 142, 255, 0.3); }

/* 동료 */
.cm-empty {
  color: #6c6c7c;
  font-style: italic;
  text-align: center;
  padding: 0.8rem;
  margin: 0;
}
.cm-companions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.cm-companion {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}
.cm-companion__icon { font-size: 0.95rem; }
.cm-companion__name { color: #f6e8b8; font-size: 0.9rem; }

/* 장비 (M10) */
.cm-equip-slots {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
.cm-equip-slot {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.5rem 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.cm-equip-slot--filled {
  border-color: rgba(192, 142, 255, 0.4);
}
.cm-equip-slot__hdr {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}
.cm-equip-slot__icon { font-size: 0.95rem; }
.cm-equip-slot__title { flex: 1; font-size: 0.78rem; color: #c0b693; font-weight: 700; }
.cm-equip-slot__off {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #888;
  border-radius: 4px;
  padding: 0.12rem 0.4rem;
  font: inherit;
  font-size: 0.7rem;
  cursor: pointer;
}
.cm-equip-slot__off:hover { color: #ff8e8e; border-color: rgba(255, 100, 100, 0.4); }
.cm-equip-slot__name { color: #f6e8b8; font-weight: 600; font-size: 0.88rem; }
.cm-equip-slot__empty { color: #6c6c7c; font-size: 0.78rem; font-style: italic; }

.cm-equip-effects {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.2rem;
}
.cm-equip-chip {
  background: rgba(0, 0, 0, 0.4);
  padding: 0.08rem 0.4rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.cm-equip-chip--neg {
  background: rgba(255, 100, 100, 0.15);
}

.cm-equip-inv {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.cm-equip-inv__title {
  font-size: 0.72rem;
  color: #888;
  letter-spacing: 0.04em;
}
.cm-empty {
  color: #6c6c7c;
  font-style: italic;
  font-size: 0.82rem;
  margin: 0.2rem 0;
}
.cm-equip-inv__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.cm-equip-inv__item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}
.cm-equip-inv__icon { font-size: 0.9rem; margin-top: 0.05rem; }
.cm-equip-inv__main { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.cm-equip-inv__name { color: #f6e8b8; font-weight: 600; font-size: 0.88rem; }
.cm-equip-inv__on {
  background: rgba(192, 142, 255, 0.18);
  border: 1px solid rgba(192, 142, 255, 0.5);
  color: #f6e8b8;
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  flex-shrink: 0;
}
.cm-equip-inv__on:hover { background: rgba(192, 142, 255, 0.3); }

.cm-fade-enter-active, .cm-fade-leave-active { transition: opacity 180ms ease; }
.cm-fade-enter-from, .cm-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .cm-modal { padding: 1rem; }
  .cm-stat { min-width: 90px; padding: 0.4rem 0.55rem; }
  .cm-stat__val { font-size: 1.05rem; }
  .cm-color__label { min-width: 2.1em; font-size: 0.76rem; }
}
</style>
