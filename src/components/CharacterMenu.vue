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
import { deriveStats, deriveBonuses, vitHpBonus } from '@/systems/stats';
import {
  effectiveColors,
  labelOfColor,
  labelOfSlot,
  recomputeAndCascadeUnequip,
  tryEquip,
  unequip,
} from '@/systems/equipment';
import { statusLabel } from '@/systems/labels';
import { companionForEntry, rosterEntryName } from '@/systems/companion';
import { XP_PER_LEVEL } from '@/systems/enhance';
import type { Companion, Element, Equipment, EquipmentSlot, RosterEntry } from '@/data/schemas';
import DeckPanel from '@/components/DeckPanel.vue';
import Tooltip from '@/components/Tooltip.vue';

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

// 6 컬러 막대 (GameHUD.vue:50 colorBars 원본 순서 그대로 — 절대 변경 금지)
interface ColorBar {
  key: 'fire' | 'electric' | 'earth' | 'iron' | 'water' | 'wind' | 'light' | 'dark';
  label: string;
  color: string;
  meaning: string;
}
const colorBars: ColorBar[] = [
  { key: 'fire',     label: '불',   color: '#ff8e8e', meaning: '불 — 전기와 함께 ATK(공격력) 산출' },
  { key: 'electric', label: '전기', color: '#f2e36a', meaning: '전기 — 불과 함께 ATK(공격력) 산출' },
  { key: 'earth',    label: '흙',   color: '#c2a36a', meaning: '흙 — 철과 함께 DEF(방어력) 산출' },
  { key: 'iron',     label: '철',   color: '#a4a4b0', meaning: '철 — 흙과 함께 DEF(방어력) 산출' },
  { key: 'water',    label: '물',   color: '#8eedff', meaning: '물 — 바람과 함께 VIT(활력 → 최대 HP) 산출' },
  { key: 'wind',     label: '바람', color: '#a8e8b8', meaning: '바람 — 물과 함께 VIT(활력 → 최대 HP) 산출' },
  { key: 'light',    label: '빛',   color: '#f6e8b8', meaning: '빛 — 어둠과 함께 MAG(마법) 산출 (희귀 컬러)' },
  { key: 'dark',     label: '어둠', color: '#c08eff', meaning: '어둠 — 빛과 함께 MAG(마법) 산출 (희귀 컬러)' },
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
/** VIT(빛·어둠) → 최대 HP 보너스 표시값. */
const vitHp = computed(() => vitHpBonus(effective.value));

/** 통합 동료 정의(passive/skill/card)를 사람이 읽는 효과 설명 줄들로. */
function describeCompanion(comp: Companion | undefined): { typeLabel: string; bonuses: string[] } {
  const bonuses: string[] = [];
  if (!comp) return { typeLabel: '동료', bonuses };
  if (comp.kind === 'skill' && comp.skill) {
    const s = comp.skill;
    bonuses.push(`스킬 「${s.name}」 (쿨다운 ${s.cooldown})`);
    if (s.description) bonuses.push(s.description);
    return { typeLabel: '스킬', bonuses };
  }
  if (comp.kind === 'card') {
    if (comp.cardIds?.length) {
      bonuses.push(`카드: ${comp.cardIds.map((c) => data.cards.get(c)?.name ?? c).join(', ')}`);
    }
    return { typeLabel: '카드', bonuses };
  }
  // passive
  const r = comp.passive;
  if (r) {
    if (r.description) bonuses.push(r.description);
    if (r.statusResist) {
      const parts = Object.entries(r.statusResist)
        .filter(([, v]) => (v ?? 0) !== 0)
        .map(([k, v]) => (k === 'all' ? `모든 상태이상 -${v}` : `${statusLabel(k)} -${v}`));
      if (parts.length) bonuses.push(`상태이상 저항: ${parts.join(', ')}`);
    }
    if (r.combatStart) {
      const parts: string[] = [];
      if (r.combatStart.block) parts.push(`방어 +${r.combatStart.block}`);
      if (r.combatStart.strength) parts.push(`힘 +${r.combatStart.strength}`);
      if (r.combatStart.draw) parts.push(`드로우 +${r.combatStart.draw}`);
      if (parts.length) bonuses.push(`전투 시작: ${parts.join(', ')}`);
    }
    if (r.perTurn) {
      const parts: string[] = [];
      if (r.perTurn.heal) parts.push(`회복 +${r.perTurn.heal}`);
      if (r.perTurn.block) parts.push(`방어 +${r.perTurn.block}`);
      if (parts.length) bonuses.push(`매 턴: ${parts.join(', ')}`);
    }
    if (r.rewardMul) {
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      const parts: string[] = [];
      if (r.rewardMul.gold) parts.push(`골드 +${pct(r.rewardMul.gold)}`);
      if (r.rewardMul.shards) parts.push(`시간조각 +${pct(r.rewardMul.shards)}`);
      if (r.rewardMul.gather) parts.push(`채집 +${pct(r.rewardMul.gather)}`);
      if (parts.length) bonuses.push(`보상: ${parts.join(', ')}`);
    }
  }
  return { typeLabel: '패시브', bonuses };
}

/**
 * companion 정의(없으면 legacy recruit를 passive로 폴백).
 * RosterEntry 기준 — npc/monster/boss(아크) 모두 companionForEntry가 처리.
 * monster/boss 는 legacy recruit 폴백이 없으므로 companionForEntry 결과 그대로.
 */
function companionDef(entry: RosterEntry): Companion | undefined {
  const comp = companionForEntry(entry);
  if (comp) return comp;
  // npc 한정 legacy recruit 폴백(구 데이터 호환).
  if (entry.src === 'npc') {
    const npc = data.npcs.get(entry.id);
    if (npc?.recruit) return { kind: 'passive', passive: npc.recruit };
  }
  return undefined;
}

/** 로스터 전체 — 이름 + 효과 설명 + 편성 여부 + 편성된 슬롯 인덱스. */
const rosterInfo = computed(() =>
  (run.data.roster ?? []).map((e) => {
    const comp = companionDef(e);
    const slotIdx = (run.data.activeSlots ?? []).findIndex((s) => s?.id === e.id);
    const { typeLabel, bonuses } = describeCompanion(comp);
    return { id: e.id, src: e.src, name: rosterEntryName(e), typeLabel, bonuses, slotIdx };
  }),
);

/** 3 활성 슬롯 — 각 칸의 동료 이름(또는 빈 칸). 슬롯1(인덱스0)은 스킬 쿨다운 -1. */
const slotView = computed(() =>
  [0, 1, 2].map((i) => {
    const e = (run.data.activeSlots ?? [])[i] ?? null;
    const name = e ? rosterEntryName(e) : null;
    return { index: i, id: e?.id ?? null, name };
  }),
);

const activeCount = computed(() => (run.data.activeSlots ?? []).filter(Boolean).length);

/** 편성 토글 — 편성돼 있으면 내리고, 아니면 빈 칸에 올린다(가득이면 안내). */
function toggleEquip(npcId: string) {
  if (run.isActive(npcId)) {
    run.unsetActiveByPet(npcId);
    return;
  }
  if (!run.equipCompanion(npcId)) {
    ui.toast('warning', '활성 슬롯 3칸이 모두 찼습니다 — 한 명을 내려주세요.');
  }
}

/** 특정 슬롯에 특정 동료 편성(순서 지정). */
function assignToSlot(slot: number, npcId: string) {
  const entry = (run.data.roster ?? []).find((e) => e.id === npcId);
  if (!entry) return;
  run.setActiveSlot(slot, { id: entry.id, src: entry.src });
}

function clearSlot(slot: number) {
  run.setActiveSlot(slot, null);
}

// 덱 편집 nested 모달
const deckEditOpen = ref(false);
function openDeckEdit() {
  deckEditOpen.value = true;
}

// === 성장 (XP·각성) — 레벨·경험치·이월 강화권. 강화 픽 모달은 ui store가 전역 관리. ===
const level = computed(() => run.data.level ?? 1);
const xp = computed(() => run.data.xp ?? 0);
const pendingPicks = computed(() => run.data.pendingEnhancePicks ?? 0);
function openEnhancePick() {
  ui.openEnhancePick();
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
          <!-- 성장 (XP·각성) — 레벨·경험치·이월 강화권. -->
          <section class="cm-sec">
            <h3 class="cm-sec__title">성장</h3>
            <div class="cm-growth">
              <div class="cm-growth__info">
                <span class="cm-growth__lv">레벨 {{ level }}</span>
                <span class="cm-growth__xp">경험치 {{ xp }} / {{ XP_PER_LEVEL }}</span>
                <span v-if="pendingPicks > 0" class="cm-growth__picks">강화권 {{ pendingPicks }}</span>
              </div>
              <button
                class="cm-btn"
                :class="{ 'cm-btn--primary': pendingPicks > 0 }"
                :disabled="pendingPicks <= 0"
                @click="openEnhancePick"
              >{{ pendingPicks > 0 ? '카드 강화' : '강화권 없음' }}</button>
            </div>
          </section>

          <!-- 덱 (사용자 요청: 맨 위로) -->
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

          <!-- 6 컬러 (effective — base + 장비 합산) -->
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
              <Tooltip text="VIT(활력) — 물·바람으로 산출. VIT 20당 최대 HP +1. 물과 바람을 고루 키울수록 크다.">
                <div class="cm-stat cm-stat--vit">
                  <span class="cm-stat__lbl">VIT</span>
                  <span class="cm-stat__val">{{ Math.round(stats.vit) }}</span>
                  <span class="cm-stat__bonus">HP+{{ vitHp }}</span>
                </div>
              </Tooltip>
              <Tooltip text="MAG — 빛·어둠(희귀 컬러)으로 산출. MAG 100단위 — 홀수마다 드로우+1, 짝수마다 마나+1">
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

          <!-- 동료 — 로스터 + 3칸 편성 (Item 37-② Stage A) -->
          <section class="cm-sec">
            <h3 class="cm-sec__title">동료 · 편성 ({{ activeCount }}/3)</h3>

            <!-- 활성 3칸 -->
            <div class="cm-slots">
              <div
                v-for="s in slotView"
                :key="s.index"
                class="cm-slot"
                :class="{ 'cm-slot--filled': !!s.id, 'cm-slot--lead': s.index === 0 }"
              >
                <div class="cm-slot__hdr">
                  <span class="cm-slot__num">슬롯 {{ s.index + 1 }}</span>
                  <span v-if="s.index === 0" class="cm-slot__lead-tag" v-tooltip="'슬롯 1에 편성된 동료의 스킬은 쿨다운이 1 줄어듭니다.'">쿨다운 -1</span>
                </div>
                <div v-if="s.name" class="cm-slot__body">
                  <span class="cm-slot__name">{{ s.name }}</span>
                  <button class="cm-slot__off" @click="clearSlot(s.index)">비우기</button>
                </div>
                <div v-else class="cm-slot__empty">비어있음</div>
              </div>
            </div>
            <p class="cm-slot__hint">슬롯 1에 편성한 동료의 스킬은 쿨다운이 1 줄어듭니다 (편성 순서가 전략).</p>

            <!-- 로스터 목록 — 동행/이탈 토글 + 슬롯 지정 -->
            <p v-if="rosterInfo.length === 0" class="cm-empty">아직 영입한 동료가 없습니다.</p>
            <ul v-else class="cm-companions">
              <li v-for="c in rosterInfo" :key="c.id" class="cm-companion" :class="{ 'cm-companion--active': c.slotIdx >= 0 }">
                <div class="cm-companion__row">
                  <span class="cm-companion__icon">{{ c.slotIdx >= 0 ? '🟢' : '⚪' }}</span>
                  <span class="cm-companion__name">{{ c.name }}</span>
                  <span class="cm-companion__type">{{ c.typeLabel }}</span>
                  <span v-if="c.slotIdx >= 0" class="cm-companion__slot">슬롯 {{ c.slotIdx + 1 }}</span>
                  <button class="cm-companion__toggle" @click="toggleEquip(c.id)">
                    {{ c.slotIdx >= 0 ? '이탈' : '동행' }}
                  </button>
                </div>
                <!-- 순서(슬롯) 지정 — 동행 중일 때만 -->
                <div v-if="c.slotIdx >= 0" class="cm-companion__assign">
                  <span class="cm-companion__assign-lbl">자리:</span>
                  <button
                    v-for="n in [0, 1, 2]"
                    :key="n"
                    class="cm-companion__assign-btn"
                    :class="{ 'cm-companion__assign-btn--cur': c.slotIdx === n }"
                    @click="assignToSlot(n, c.id)"
                  >{{ n + 1 }}</button>
                </div>
                <ul v-if="c.bonuses.length" class="cm-companion__bonuses">
                  <li v-for="(b, j) in c.bonuses" :key="j">{{ b }}</li>
                </ul>
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
.cm-stat--vit { border-color: #f6e8b8; }
.cm-stat__lbl { font-size: 0.7rem; color: #c0b693; }
.cm-stat__val { font-size: 1.2rem; font-weight: 700; color: #f6e8b8; font-variant-numeric: tabular-nums; }
.cm-stat__bonus { font-size: 0.7rem; color: #c08eff; margin-top: 0.1rem; }

/* 성장 (XP·각성) */
.cm-growth {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
}
.cm-growth__info { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; }
.cm-growth__lv { font-size: 1rem; color: #f6e8b8; font-weight: 700; }
.cm-growth__xp { font-size: 0.74rem; color: #c0b693; font-variant-numeric: tabular-nums; }
.cm-growth__picks { font-size: 0.74rem; color: #ffe88e; font-weight: 600; }

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
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.45rem 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}
.cm-companion__row { display: flex; align-items: center; gap: 0.5rem; }
.cm-companion__icon { font-size: 0.95rem; }
.cm-companion__name { color: #f6e8b8; font-size: 0.9rem; font-weight: 600; }
.cm-companion__bonuses {
  list-style: none; margin: 0; padding: 0 0 0 1.4rem;
  display: flex; flex-direction: column; gap: 0.15rem;
}
.cm-companion__bonuses li { color: #bff0c8; font-size: 0.78rem; }
.cm-companion__none { margin: 0 0 0 1.4rem; color: #6c6c7c; font-size: 0.76rem; font-style: italic; }

/* 동료 — 활성 3칸 */
.cm-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; margin-bottom: 0.35rem; }
.cm-slot {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  padding: 0.4rem 0.5rem;
  display: flex; flex-direction: column; gap: 0.25rem; min-height: 64px;
}
.cm-slot--filled { border-color: rgba(192,142,255,0.45); }
.cm-slot--lead { border-left: 3px solid #f6e8b8; }
.cm-slot__hdr { display: flex; align-items: center; justify-content: space-between; gap: 0.3rem; }
.cm-slot__num { font-size: 0.68rem; color: #c0b693; font-weight: 700; }
.cm-slot__lead-tag { font-size: 0.6rem; color: #f6e8b8; background: rgba(246,232,184,0.15); border-radius: 3px; padding: 0.04rem 0.3rem; }
.cm-slot__body { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
.cm-slot__name { color: #f6e8b8; font-weight: 600; font-size: 0.84rem; }
.cm-slot__off {
  background: none; border: 1px solid rgba(255,255,255,0.18); color: #888;
  border-radius: 4px; padding: 0.08rem 0.4rem; font: inherit; font-size: 0.66rem; cursor: pointer;
}
.cm-slot__off:hover { color: #ff8e8e; border-color: rgba(255,100,100,0.4); }
.cm-slot__empty { color: #6c6c7c; font-size: 0.74rem; font-style: italic; }
.cm-slot__hint { font-size: 0.7rem; color: #8a8a98; margin: 0 0 0.5rem; }

.cm-companion--active { border-left: 2px solid #8effb8; }
.cm-companion__type { font-size: 0.66rem; color: #c08eff; background: rgba(192,142,255,0.12); border-radius: 3px; padding: 0.04rem 0.34rem; }
.cm-companion__slot { font-size: 0.66rem; color: #8effb8; }
.cm-companion__toggle {
  margin-left: auto; background: rgba(192,142,255,0.16); border: 1px solid rgba(192,142,255,0.45);
  color: #f6e8b8; border-radius: 4px; padding: 0.18rem 0.55rem; font: inherit; font-size: 0.72rem; cursor: pointer;
}
.cm-companion__toggle:hover { background: rgba(192,142,255,0.3); }
.cm-companion__assign { display: flex; align-items: center; gap: 0.3rem; padding-left: 1.4rem; }
.cm-companion__assign-lbl { font-size: 0.7rem; color: #8a8a98; }
.cm-companion__assign-btn {
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.18); color: #d6d6e0;
  border-radius: 4px; padding: 0.05rem 0.45rem; font: inherit; font-size: 0.72rem; cursor: pointer;
}
.cm-companion__assign-btn--cur { background: rgba(142,255,184,0.2); border-color: rgba(142,255,184,0.5); color: #f6e8b8; }

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
