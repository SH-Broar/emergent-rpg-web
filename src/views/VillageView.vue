<script setup lang="ts">
/**
 * 마을 화면 — NPC 대화 (NPC harness 단계에서 본격) + 간이 제작.
 *
 * 사용자 정의 (Step C):
 *   마을 제작 = *랜덤*으로 등장하는 카드를 *저렴*하게 (시간의 조각 5).
 *   공방 = 별도 (더 비싸고 더 좋은 카드 + 강화).
 */

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { rng } from '@/systems/rng';
import { applyAffinityDelta } from '@/systems/affinity';
import { cardEffectKindLabel, cardEffectDescription } from '@/systems/labels';
import { availableCards } from '@/systems/unlocks';
import {
  canCraftPotion,
  craftPotion,
  listCraftablePotions,
  potionCostFor,
} from '@/systems/workshop';
import type { Card, Item, Npc, Rank } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const VILLAGE_CRAFT_COST = 5;       // 시간의 조각 비용
const VILLAGE_CRAFT_CHOICES = 3;    // 한 번에 제시되는 후보 수
const VILLAGE_CARD_RANKS = new Set(['common']);  // 마을은 *일반 등급* 풀에서만

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

// 현재 노드에 등장하는 NPC들 (contentRef.npcIdPool + homeNodeId 매칭).
const nodeNpcs = computed<Npc[]>(() => {
  const node = currentNode.value;
  if (!node) return [];
  const ids = new Set<string>(node.contentRef?.npcIdPool ?? []);
  // homeNodeId가 이 노드인 NPC도 자동 포함.
  for (const npc of data.npcs.values()) {
    if (npc.homeNodeId === node.id) ids.add(npc.id);
  }
  return [...ids]
    .map((id) => data.npcs.get(id))
    .filter((n): n is Npc => n !== undefined);
});

const partyFull = computed(() => run.data.companions.length >= 3);

function canRecruit(npc: Npc): boolean {
  if (!npc.recruit) return false;
  if (run.data.companions.includes(npc.id)) return false;
  if (partyFull.value) return false;
  // 최초 만남이거나, 이전에 만났던 장소에 다시 왔을 때만.
  const first = run.data.recruitedAt[npc.id];
  return first === undefined || first === run.data.currentNodeId;
}

function recruitWhyDisabled(npc: Npc): string {
  if (!npc.recruit) return '';
  if (run.data.companions.includes(npc.id)) return '이미 동료';
  if (partyFull.value) return '동료 한도 (3/3)';
  const first = run.data.recruitedAt[npc.id];
  if (first && first !== run.data.currentNodeId) {
    const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
    const node = map?.nodes.find((n) => n.id === first);
    return `재영입은 '${node?.label ?? first}'에서`;
  }
  return '';
}

function tryRecruit(npc: Npc) {
  if (!canRecruit(npc)) {
    ui.toast('warning', recruitWhyDisabled(npc) || '영입 불가');
    return;
  }
  const ok = run.recruitCompanion(npc.id);
  ui.toast(ok ? 'success' : 'warning', ok ? `${npc.name} — 동료로 함께합니다.` : '영입 실패');
}

function tryDismiss(npc: Npc) {
  run.dismissCompanion(npc.id);
  ui.toast('info', `${npc.name} — 이별을 고했습니다. 다시 만나려면 '${recruitedAtLabel(npc)}'(으)로.`);
}

function recruitedAtLabel(npc: Npc): string {
  const first = run.data.recruitedAt[npc.id];
  if (!first) return '?';
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === first)?.label ?? first;
}

function recruitSummary(npc: Npc): string {
  const b = npc.recruit;
  if (!b) return '';
  const parts: string[] = [];
  if (b.deckSizeBonus) parts.push(`덱 +${b.deckSizeBonus}`);
  if (b.grantedCardIds && b.grantedCardIds.length > 0) parts.push(`전용 카드 ${b.grantedCardIds.length}장`);
  if (b.grantedRelicIds && b.grantedRelicIds.length > 0) parts.push(`전용 유물 ${b.grantedRelicIds.length}점`);
  const colorParts = Object.entries(b.colorBoosts ?? {})
    .filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${k} +${v}`);
  if (colorParts.length > 0) parts.push(colorParts.join(', '));
  return parts.join(' · ');
}

// === NPC 대화 ===
// 대화 = NPC.background 단락(친밀도 깊이만큼 공개) 또는 tagline 표시.
// 방문(이 컴포넌트 마운트)당 NPC 1회 친밀도 +1 → affinity.ts가 단계 보상 자동 발사.
const talkedThisVisit = ref<Set<string>>(new Set());
const activeDialogue = ref<{ name: string; line: string; rewards: string[] } | null>(null);

function affinityOf(npc: Npc): number {
  return run.data.npcAffinity[npc.id] ?? 0;
}

/**
 * 대화 대사 — *현재 연표*의 배경 변주를 우선 사용(없으면 기본 background, 그것도 없으면 tagline).
 * background를 `|`로 나눠 친밀도가 깊을수록 더 뒤 단락을 보여준다.
 */
function dialogueLine(npc: Npc): string {
  const tlId = run.data.timelineId;
  const raw = npc.backgroundByTimeline?.[tlId] ?? npc.background ?? '';
  const paras = raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (paras.length === 0) return npc.tagline ?? '…';
  const idx = Math.min(paras.length - 1, affinityOf(npc));
  return paras[idx];
}

function talk(npc: Npc) {
  const rewards: string[] = [];
  const firstThisVisit = !talkedThisVisit.value.has(npc.id);
  if (firstThisVisit) {
    applyAffinityDelta(npc.id, 1, rewards);
    talkedThisVisit.value = new Set(talkedThisVisit.value).add(npc.id);
    rewards.unshift(`(가까워졌다 — 친밀도 ${affinityOf(npc)})`);
  }
  // 친밀도 반영 후의 대사(가까워질수록 더 깊은 이야기).
  activeDialogue.value = { name: npc.name, line: dialogueLine(npc), rewards };
}

function closeDialogue() {
  activeDialogue.value = null;
}

const craftPool = computed<Card[]>(() => {
  // 일반 등급 카드들. 잠긴(미해금) 카드는 제외.
  return availableCards().filter((c: Card) => VILLAGE_CARD_RANKS.has(c.rank));
});

const rolledOptions = ref<Card[]>([]);
const phase = ref<'menu' | 'craft-roll' | 'craft-result'>('menu');
const craftedCard = ref<Card | null>(null);

function rollCraft() {
  if (run.data.timeShards < VILLAGE_CRAFT_COST) {
    ui.toast('warning', `시간의 조각이 부족합니다. (필요 ${VILLAGE_CRAFT_COST})`);
    return;
  }
  // 랜덤 N장 추첨 (중복 없이) — rng() 기반, 시드 고정.
  const pool = [...craftPool.value];
  const picked: Card[] = [];
  while (picked.length < VILLAGE_CRAFT_CHOICES && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  rolledOptions.value = picked;
  phase.value = 'craft-roll';
}

function selectCrafted(card: Card) {
  run.data.timeShards -= VILLAGE_CRAFT_COST;
  // 카드 컬렉션에 추가 (덱 슬롯 등록은 사용자가 덱 편집에서)
  run.addCardToCollection(card);
  craftedCard.value = card;
  phase.value = 'craft-result';
}

function cancelRoll() {
  // 추첨만 한 상태 — 자원 차감 X, 그냥 메뉴로
  rolledOptions.value = [];
  phase.value = 'menu';
}

// === 일반 포션 제작 (마을) — 시간조각 + 일반재료. ===
const potionPanelOpen = ref(false);
const craftablePotions = computed<Item[]>(() => listCraftablePotions(['basic', 'common']));
function itemName(id: string): string {
  return data.items.get(id)?.name ?? id;
}
function potionCostLabel(rank: Rank): string {
  const cost = potionCostFor(rank);
  return `시간조각 ${cost.timeShards} + ${itemName(cost.materialId)}`;
}
function potionEffectShort(e: Item['effects'][number]): string {
  switch (e.kind) {
    case 'heal': return `HP +${e.value ?? 0}`;
    case 'combat-mana': return `마나 +${e.value ?? 0}`;
    case 'combat-draw': return `드로우 ${e.value ?? 0}`;
    case 'combat-block': return `방어 +${e.value ?? 0}`;
    case 'combat-enemy-status': return `적 ${e.param} +${e.value ?? 0}`;
    case 'combat-self-status': return `${e.param} +${e.value ?? 0}`;
    case 'combat-free-grapple': return '구속 해제';
    case 'color-all': return `8컬러 +${e.value ?? 0}`;
    case 'color-boost': return `${e.param} +${e.value ?? 0}`;
    case 'gold': return `골드 +${e.value ?? 0}`;
    case 'time-shards': return `시간조각 +${e.value ?? 0}`;
    default: return e.kind;
  }
}
function potionSummary(itm: Item): string {
  return itm.effects.map(potionEffectShort).join(' · ');
}
function doCraftPotion(itm: Item) {
  craftPotion(itm);
}

function leave() {
  router.push('/game/map');
}

/** 빙의 정화 — 마을에서 잔존 빙의를 씻어낸다. */
function cleansePossession() {
  run.data.possessed = 0;
  ui.toast('success', '혼란을 씻어냈다. 몸이 다시 내 것이 되었다.');
}

/** 수화 중 진정 — 선택형. 가라앉히면 공격 2배·탐색 보상↑이 사라지고 회복/방어가 돌아온다. */
function calmFeral() {
  run.data.feralHeavy = 0;
  ui.toast('success', '숨을 고르니 수화가 가라앉았다.');
}

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
</script>

<template>
  <main class="village-view">
    <header class="hdr">
      <button class="back" @click="leave">← 맵으로</button>
      <h1>{{ currentNode?.label ?? '마을' }}</h1>
    </header>

    <p v-if="currentNode?.description" class="desc">{{ currentNode.description }}</p>

    <!-- 메뉴 -->
    <section v-if="phase === 'menu'" class="menu">
      <div class="resources">
        <span>HP {{ run.data.hp }}/{{ run.data.maxHp }}</span>
        <span>골드 {{ run.data.gold }}</span>
        <span>시간의 조각 {{ run.data.timeShards }}</span>
      </div>

      <!-- 빙의 정화 — 마을에서 풀 수 있는 경로(잔존 빙의가 있을 때만). -->
      <div v-if="(run.data.possessed ?? 0) > 0" class="cleanse">
        <p class="cleanse__msg">몸에 혼란이 남아 있다. 활동에 들 수 없고 길도 일부 막혔다.</p>
        <button class="cleanse__btn" @click="cleansePossession">마을에서 혼란을 씻어낸다</button>
      </div>

      <!-- 수화 중 진정 — 선택형(공격 2배·탐색 보상↑ 유지 vs 회복/방어 회복). -->
      <div v-if="(run.data.feralHeavy ?? 0) > 0" class="cleanse cleanse--feral">
        <p class="cleanse__msg">아직 심수화 상태다. 공격이 2배지만 회복도 방어도 못 하고, 탐색 보상이 늘어난다. 가라앉힐까?</p>
        <button class="cleanse__btn" @click="calmFeral">수화를 가라앉힌다</button>
      </div>

      <!-- NPC 목록 — 대화·영입은 *대화 시스템 도입 후* 활성. 지금은 *마주침*만 표시. -->
      <div v-if="nodeNpcs.length > 0" class="npc-list">
        <h3 class="npc-list__title">이 곳의 사람들</h3>
        <div
          v-for="npc in nodeNpcs"
          :key="npc.id"
          class="npc-card"
        >
          <div class="npc-card__hd">
            <span class="npc-card__name">{{ npc.name }}</span>
            <span class="npc-card__meta">{{ npc.raceId }} · {{ npc.role }}</span>
            <span class="npc-card__aff">친밀도 {{ affinityOf(npc) }}</span>
          </div>
          <p v-if="npc.tagline" class="npc-card__tagline">{{ npc.tagline }}</p>
          <div class="npc-card__actions">
            <button class="npc-card__btn npc-card__btn--talk" @click="talk(npc)">대화한다</button>
          </div>
          <!-- r4: 동료 권유 UI 활성화. recruit_enabled=true + recruit 보너스가 있는 NPC만 표시. -->
          <div v-if="npc.recruit" class="npc-card__recruit">
            <span class="npc-card__summary">{{ recruitSummary(npc) }}</span>
            <button
              v-if="!run.data.companions.includes(npc.id)"
              class="npc-card__btn"
              :disabled="!canRecruit(npc)"
              :title="recruitWhyDisabled(npc)"
              @click="tryRecruit(npc)"
            >동행을 권한다</button>
            <button
              v-else
              class="npc-card__btn npc-card__btn--dismiss"
              @click="tryDismiss(npc)"
            >이별을 고한다</button>
          </div>
        </div>
      </div>

      <button class="opt" @click="rollCraft">
        <span class="opt__title">간이 카드 제작</span>
        <span class="opt__hint">시간의 조각 {{ VILLAGE_CRAFT_COST }} — 무작위 일반 카드 {{ VILLAGE_CRAFT_CHOICES }}장 중 1장 선택</span>
      </button>

      <button class="opt" @click="potionPanelOpen = !potionPanelOpen">
        <span class="opt__title">포션 제작</span>
        <span class="opt__hint">시간의 조각 + 일반 재료 — 일반 포션 제작</span>
      </button>

      <!-- 일반 포션 제작 패널 -->
      <div v-if="potionPanelOpen" class="potion-panel">
        <ul class="potion-list">
          <li v-for="itm in craftablePotions" :key="itm.id" class="potion-item">
            <div class="potion-main">
              <div class="potion-name">
                {{ itm.name }}
                <span class="potion-tag">{{ itm.combat ? '전투' : '맵' }}</span>
              </div>
              <div class="potion-eff">{{ potionSummary(itm) }}</div>
              <div class="potion-req">필요: {{ potionCostLabel(itm.rank) }}</div>
            </div>
            <button
              class="potion-btn"
              :disabled="!canCraftPotion(itm)"
              @click="doCraftPotion(itm)"
            >제작</button>
          </li>
          <li v-if="craftablePotions.length === 0" class="potion-empty">제작 가능한 포션이 없습니다.</li>
        </ul>
      </div>

      <button class="opt opt--leave" @click="leave">떠나기</button>
    </section>

    <!-- 제작 추첨 -->
    <section v-else-if="phase === 'craft-roll'" class="craft-roll">
      <h2>제작 후보</h2>
      <p class="craft-roll__hint">1장 선택 시 시간의 조각 {{ VILLAGE_CRAFT_COST }} 소모</p>
      <div class="craft-grid">
        <button
          v-for="(c, i) in rolledOptions"
          :key="`${c.id}-${i}`"
          class="craft-card"
          :style="{ borderColor: rankColors[c.rank] }"
          @click="selectCrafted(c)"
        >
          <div class="craft-card__head">
            <span class="craft-card__cost">{{ c.cost }}</span>
            <span class="craft-card__name">{{ c.name }}</span>
          </div>
          <div class="craft-card__rank" :style="{ color: rankColors[c.rank] }">{{ c.rank }}</div>
          <div class="craft-card__effects">
            <span v-for="(e, ei) in c.effects" :key="ei" class="effect" v-tooltip="cardEffectDescription(e)">
              {{ cardEffectKindLabel(e) }} {{ e.value ?? '' }}
            </span>
          </div>
          <p v-if="c.flavor" class="craft-card__flavor">{{ c.flavor }}</p>
        </button>
      </div>
      <button class="cancel" @click="cancelRoll">물러난다</button>
    </section>

    <!-- 제작 결과 -->
    <section v-else-if="phase === 'craft-result' && craftedCard" class="result">
      <h2>제작 완료</h2>
      <div class="result-card" :style="{ borderColor: rankColors[craftedCard.rank] }">
        <div class="result-card__name">{{ craftedCard.name }}</div>
        <div class="result-card__rank" :style="{ color: rankColors[craftedCard.rank] }">{{ craftedCard.rank }}</div>
        <p v-if="craftedCard.flavor" class="result-card__flavor">{{ craftedCard.flavor }}</p>
      </div>
      <p class="result__line">{{ craftedCard.name }}을(를) 덱에 추가했습니다.</p>
      <p class="result__cost">- 시간의 조각 {{ VILLAGE_CRAFT_COST }}</p>
      <button class="continue" @click="leave">계속 →</button>
    </section>

    <!-- NPC 대화 모달 -->
    <div v-if="activeDialogue" class="dlg-backdrop" @click.self="closeDialogue">
      <div class="dlg" role="dialog">
        <h3 class="dlg__name">{{ activeDialogue.name }}</h3>
        <p class="dlg__line">{{ activeDialogue.line }}</p>
        <ul v-if="activeDialogue.rewards.length > 0" class="dlg__rewards">
          <li v-for="(r, i) in activeDialogue.rewards" :key="i">{{ r }}</li>
        </ul>
        <button class="dlg__close" @click="closeDialogue">닫는다</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.village-view { max-width: 720px; margin: 0 auto; padding: 2rem; min-height: 100vh; min-height: 100dvh; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #8effb8; margin: 0; }
.desc { color: #b6b6c4; font-style: italic; margin: 0.6rem 0 1.5rem; }

.menu { display: flex; flex-direction: column; gap: 0.8rem; }
.resources { display: flex; gap: 1rem; padding: 0.6rem 1rem; background: rgba(0,0,0,0.4); border-radius: 6px; color: #b6b6c4; font-size: 0.9rem; }
.cleanse { margin-top: 0.8rem; padding: 0.7rem 1rem; background: rgba(192,142,255,0.12); border: 1px solid rgba(192,142,255,0.45); border-radius: 8px; display: grid; gap: 0.5rem; }
.cleanse__msg { margin: 0; color: #d6c8f0; font-size: 0.88rem; }
.cleanse__btn { padding: 0.55rem 0.9rem; background: rgba(192,142,255,0.25); border: 1px solid rgba(192,142,255,0.6); color: #f0e8ff; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; }
.cleanse__btn:hover { background: rgba(192,142,255,0.4); }
.opt { padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 0.2rem; }
.opt:hover:not(:disabled) { background: rgba(142, 255, 184, 0.1); border-color: rgba(142, 255, 184, 0.4); }
.opt:disabled { opacity: 0.4; cursor: not-allowed; }
.opt__title { font-weight: 600; color: #f6e8b8; }
.opt__hint { font-size: 0.85rem; color: #888; }
.opt--leave { background: rgba(255,255,255,0.02); }

/* NPC 목록 */
.npc-list { display: grid; gap: 0.6rem; margin-bottom: 0.6rem; }
.npc-list__title { color: #c0b693; font-size: 0.85rem; letter-spacing: 0.08em; margin: 0.4rem 0 0.2rem; }
.npc-card { padding: 0.7rem 0.9rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; display: grid; gap: 0.3rem; }
.npc-card__hd { display: flex; gap: 0.6rem; align-items: baseline; }
.npc-card__name { color: #f6e8b8; font-weight: 600; }
.npc-card__meta { font-size: 0.78rem; color: #888; }
.npc-card__tagline { color: #a4a4b0; font-size: 0.85rem; margin: 0; font-style: italic; }
.npc-card__aff { font-size: 0.75rem; color: #c08eff; margin-left: auto; }
.npc-card__actions { display: flex; gap: 0.5rem; margin-top: 0.2rem; }
.npc-card__btn--talk { background: rgba(142, 200, 255, 0.16); border-color: rgba(142, 200, 255, 0.45); }
.npc-card__btn--talk:hover { background: rgba(142, 200, 255, 0.28); }

/* NPC 대화 모달 */
.dlg-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal-nested, 60);
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.dlg {
  max-width: 480px; width: 100%;
  background: #16171f;
  border: 1px solid rgba(142, 200, 255, 0.4);
  border-radius: 12px;
  padding: 1.4rem 1.5rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  display: grid; gap: 0.8rem;
}
.dlg__name { color: #8ec8ff; margin: 0; font-size: 1.15rem; }
.dlg__line { color: #e0e0ea; margin: 0; line-height: 1.6; }
.dlg__rewards { list-style: none; padding: 0.6rem 0.8rem; margin: 0; background: rgba(192, 142, 255, 0.1); border-radius: 6px; display: grid; gap: 0.25rem; }
.dlg__rewards li { color: #ffe88e; font-size: 0.85rem; }
.dlg__close {
  justify-self: end;
  padding: 0.5rem 1.1rem;
  background: rgba(142, 200, 255, 0.2);
  border: 1px solid rgba(142, 200, 255, 0.5);
  color: #f6e8b8; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600;
}
.dlg__close:hover { background: rgba(142, 200, 255, 0.32); }
.npc-card__recruit { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-top: 0.3rem; }
.npc-card__summary { font-size: 0.8rem; color: #c08eff; flex: 1; min-width: 60%; }
.npc-card__btn {
  padding: 0.4rem 0.8rem;
  background: rgba(192, 142, 255, 0.18);
  border: 1px solid rgba(192, 142, 255, 0.45);
  color: #f6e8b8;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
}
.npc-card__btn:hover:not(:disabled) { background: rgba(192, 142, 255, 0.3); }
.npc-card__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.npc-card__btn--dismiss {
  background: rgba(255, 142, 142, 0.15);
  border-color: rgba(255, 142, 142, 0.4);
}
.npc-card__btn--dismiss:hover { background: rgba(255, 142, 142, 0.25); }

.craft-roll h2 { color: #8effb8; }
.craft-roll__hint { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
.craft-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.craft-card { padding: 0.8rem; background: rgba(255,255,255,0.04); border: 2px solid; border-radius: 8px; cursor: pointer; color: inherit; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 0.3rem; }
.craft-card:hover { transform: translateY(-4px); background: rgba(255,255,255,0.08); }
.craft-card__head { display: flex; align-items: center; gap: 0.4rem; }
.craft-card__cost { background: #c08eff; color: #0d0e14; padding: 0.2rem 0.5rem; border-radius: 50%; font-weight: 700; font-size: 0.85rem; }
.craft-card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.craft-card__rank { font-size: 0.75rem; text-transform: uppercase; }
.craft-card__effects { display: flex; flex-wrap: wrap; gap: 0.2rem; font-size: 0.8rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 4px; color: #b6b6c4; }
.craft-card__flavor { font-size: 0.75rem; color: #6c6c7c; font-style: italic; margin: 0; }
.cancel { padding: 0.6rem 1.2rem; background: none; border: 1px solid rgba(255,255,255,0.2); color: #888; border-radius: 6px; cursor: pointer; }

.result { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 2rem 0; }
.result h2 { color: #8effb8; }
.result-card { padding: 1.2rem 1.5rem; background: rgba(255,255,255,0.06); border: 2px solid; border-radius: 8px; min-width: 260px; }
.result-card__name { font-size: 1.2rem; font-weight: 600; color: #f6e8b8; }
.result-card__rank { font-size: 0.85rem; text-transform: uppercase; margin: 0.3rem 0; }
.result-card__flavor { font-size: 0.85rem; color: #888; font-style: italic; margin: 0.5rem 0 0; }
.result__line { color: #d6d6e0; margin: 0; }
.result__cost { color: #ffe88e; margin: 0; }
.continue { padding: 0.6rem 1.4rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; }

/* 일반 포션 제작 패널 */
.potion-panel { padding: 0.6rem 0.8rem; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; }
.potion-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; max-height: 320px; overflow-y: auto; }
.potion-item { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0.5rem; border-bottom: 1px dashed rgba(255,255,255,0.08); }
.potion-main { flex: 1; min-width: 0; }
.potion-name { color: #f6e8b8; font-weight: 600; font-size: 0.9rem; }
.potion-tag { font-size: 0.7rem; color: #8eedff; margin-left: 0.4rem; }
.potion-eff { color: #c8e6d0; font-size: 0.8rem; }
.potion-req { color: #b6b6c4; font-size: 0.76rem; }
.potion-btn { padding: 0.4rem 0.8rem; background: rgba(142, 237, 255, 0.18); border: 1px solid rgba(142, 237, 255, 0.45); color: #d0f0ff; border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.85rem; font-weight: 600; }
.potion-btn:hover:not(:disabled) { background: rgba(142, 237, 255, 0.32); }
.potion-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.potion-empty { color: #888; font-style: italic; font-size: 0.85rem; padding: 0.4rem; }
</style>
