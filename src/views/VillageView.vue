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
import { useMetaStore } from '@/stores/meta';
import { rng } from '@/systems/rng';
import { collectMail, turnsUntilMail } from '@/systems/mail';
import { applyAffinityDelta } from '@/systems/affinity';
import { cardEffectKindLabel, cardEffectDescription, colorLabel } from '@/systems/labels';
import { availableCards } from '@/systems/unlocks';
import {
  canFulfill,
  fulfillContract,
  heldTradeCount,
  tradeItemName,
  type TradeRequirement,
} from '@/systems/delivery';
import {
  canCraftPotion,
  craftPotion,
  listCraftablePotions,
  potionCostFor,
} from '@/systems/workshop';
import SceneCharacter from '@/components/SceneCharacter.vue';
import Collapsible from '@/components/Collapsible.vue';
import type { Card, Companion, Item, Npc, Rank } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();
const meta = useMetaStore();

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

/**
 * 마을에서 권유 가능한 동료 정의 — companion 우선, 없으면 legacy recruit를 passive로 폴백.
 *
 * Item 37-② Stage C Step2: `village_recruit = false` NPC는 마을 권유 UI에서 가린다
 * (companion 정의 자체는 유지 — 영입 경로만 권역 사건으로 이전). 마을 영입은 시작 권역의
 * 약체 1명(하코)과 정령 예외(발렌시아)만 남고, 나머지는 권역 사건에서만 영입한다.
 */
function companionOf(npc: Npc): Companion | undefined {
  if (npc.villageRecruit === false) return undefined;
  if (npc.companion) return npc.companion;
  if (npc.recruit) return { kind: 'passive', passive: npc.recruit };
  return undefined;
}

function canRecruit(npc: Npc): boolean {
  if (!companionOf(npc)) return false;
  // Item 37-② Stage A: 로스터는 *런 한정 무제한*(3칸 제한은 활성 슬롯에만). 중복만 막는다.
  if (run.inRoster(npc.id)) return false;
  // 최초 만남이거나, 이전에 만났던 장소에 다시 왔을 때만.
  const first = run.data.recruitedAt[npc.id];
  return first === undefined || first === run.data.currentNodeId;
}

function recruitWhyDisabled(npc: Npc): string {
  if (!companionOf(npc)) return '';
  if (run.inRoster(npc.id)) return '이미 동료';
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
  const comp = companionOf(npc);
  if (!comp) return '';
  if (comp.kind === 'skill' && comp.skill) {
    return `스킬 「${comp.skill.name}」 (쿨다운 ${comp.skill.cooldown})`;
  }
  if (comp.kind === 'card') {
    return comp.cardIds?.length ? `전용 카드 ${comp.cardIds.length}장` : '동료';
  }
  // passive
  const p = comp.passive;
  if (!p) return '패시브 동료';
  const parts: string[] = [];
  if (p.combatStart) {
    const s: string[] = [];
    if (p.combatStart.block) s.push(`방어 +${p.combatStart.block}`);
    if (p.combatStart.strength) s.push(`힘 +${p.combatStart.strength}`);
    if (p.combatStart.draw) s.push(`드로우 +${p.combatStart.draw}`);
    if (s.length) parts.push(`전투 시작 ${s.join(', ')}`);
  }
  if (p.perTurn) {
    const s: string[] = [];
    if (p.perTurn.heal) s.push(`회복 +${p.perTurn.heal}`);
    if (p.perTurn.block) s.push(`방어 +${p.perTurn.block}`);
    if (s.length) parts.push(`매 턴 ${s.join(', ')}`);
  }
  if (p.statusResist) parts.push('상태이상 저항');
  if (p.rewardMul) parts.push('보상 증폭');
  return parts.length ? parts.join(' · ') : '패시브 동료';
}

// === NPC 대화 ===
// 대화 = NPC.background 단락(친밀도 깊이만큼 공개) 또는 tagline 표시.
// Item 37-② Stage C(1B): 친밀도 상승은 *하루 1회*(같은 날 재대화는 대사만). affinity는 *영속 메타*.
const activeDialogue = ref<{ name: string; line: string; rewards: string[] } | null>(null);

// NPC 개별 접이식 행 — 펼쳐진 NPC id 집합(로컬 UI 상태, 세이브 무관). 기본 전부 접힘.
const openNpcIds = ref<Set<string>>(new Set());
function toggleNpc(id: string) {
  const next = new Set(openNpcIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openNpcIds.value = next;
}

/** 친밀도 — 영속 메타값(cross-run). run working mirror도 동기지만 meta가 권위. */
function affinityOf(npc: Npc): number {
  return meta.npcAffinityOf(npc.id);
}

/** 오늘(현재 런 일차) 이 NPC와 대화로 친밀도를 이미 올렸는가. */
function talkedToday(npc: Npc): boolean {
  return (run.data.affinityTalkDay?.[npc.id] ?? -1) === (run.data.currentDay ?? 1);
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
  // 친밀도 상승은 *하루 1회*(같은 날 재대화는 대사만). 1B: 영속 메타에 누적.
  if (!talkedToday(npc)) {
    applyAffinityDelta(npc.id, 1, rewards);
    if (!run.data.affinityTalkDay) run.data.affinityTalkDay = {};
    run.data.affinityTalkDay[npc.id] = run.data.currentDay ?? 1;
    rewards.unshift(`(가까워졌다 — 친밀도 ${affinityOf(npc)})`);
  } else {
    rewards.push('(오늘은 이미 충분히 이야기를 나눴다.)');
  }
  // 친밀도 반영 후의 대사(가까워질수록 더 깊은 이야기).
  activeDialogue.value = { name: npc.name, line: dialogueLine(npc), rewards };
}

function closeDialogue() {
  activeDialogue.value = null;
}

const craftPool = computed<Card[]>(() => {
  // 일반 등급 카드들. 잠긴(미해금) 카드는 제외.
  // 종족 카드(source=race/character)는 그 종족 전용이므로 마을 공방 제작 풀에서 제외(shop/workshop과 동일 격리).
  return availableCards().filter(
    (c: Card) => VILLAGE_CARD_RANKS.has(c.rank) && c.source !== 'race' && c.source !== 'character',
  );
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

// === 길드 우편(타이머 드립) — 수령 대기 우편 수 + 다음 배달까지 남은 턴. ===
const mailPending = computed(() => run.data.mail?.pending ?? 0);
const mailTurns = computed(() => turnsUntilMail(run.data));

/** 길드 우편 수령 — 대기 우편을 타이머로 전환(상한 초과분은 버려진다). 로직은 systems/mail.ts. */
function receiveMail() {
  const before = run.data.timers.cur;
  const got = collectMail();
  if (got <= 0) return;
  const gained = run.data.timers.cur - before;
  // 토스트 대신 보상 패널(길드 우편)로 — 전환 없이 명시적으로 확인하고 닫는다. (2026-07-02)
  const lines = [`타이머 +${gained}`];
  if (gained < got) lines.push(`상한에 닿아 ${got - gained}통은 흘려보냈다`);
  ui.pushRewardPanel({ title: '길드 우편', lines });
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

// === 거래(인정 게이트) 계약 — 마을에서 완료할 수 있는 활성 거래 목록. ===
/** 한 계약 행의 표시·완료에 필요한 정보. */
interface TradeRow {
  nodeId: string;
  nodeLabel: string;
  req: TradeRequirement;
  reqName: string;
  upperName: string;
  held: number;
  ready: boolean;
}

/** 노드 id → 라벨(맵에서 조회). */
function nodeLabelOf(id: string): string {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === id)?.label ?? id;
}

const tradeRows = computed<TradeRow[]>(() => {
  const contracts = run.data.tradeContracts ?? {};
  return Object.entries(contracts).map(([nodeId, c]) => {
    const req: TradeRequirement = {
      itemId: c.itemId,
      upperItemId: c.upperItemId,
      count: c.count,
      element: c.element as TradeRequirement['element'],
      tier: c.tier,
    };
    return {
      nodeId,
      nodeLabel: nodeLabelOf(nodeId),
      req,
      reqName: tradeItemName(c.itemId),
      upperName: c.upperItemId ? tradeItemName(c.upperItemId) : '',
      held: heldTradeCount(req),
      ready: canFulfill(req),
    };
  });
});

/** 마을에서 거래 완료 — 소비 + 그 노드 해결 + 보상. */
function completeTradeAt(row: TradeRow) {
  if (!row.ready) {
    ui.toast('warning', '아직 건넬 만큼 모이지 않았다.');
    return;
  }
  const result = fulfillContract(row.nodeId);
  if (!result) {
    ui.toast('warning', '거래를 마칠 수 없다.');
    return;
  }
  ui.toast(
    'success',
    `거래를 마쳤다 — ${row.reqName} ${result.consumed.length}개. 생활 경험 +${result.lifeXp}, ${colorLabel(result.color)} +${result.colorGain}.`,
  );
}

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
</script>

<template>
  <SceneCharacter
    v-if="ui.debug.showPortraits"
    mood="idle"
  />
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

      <!-- 길드 우편 — 타이머(개입권)는 이곳에서 조금씩 받는다(선지급 폐지). 대기 우편이 있으면 자동으로 펼친다. -->
      <Collapsible
        title="길드"
        subtitle="우편 수령"
        :badge="mailPending > 0 ? `우편 ${mailPending}통` : ''"
        :default-open="mailPending > 0"
      >
        <div class="guild-mail">
          <template v-if="mailPending > 0">
            <p class="guild-mail__msg">길드 직원이 창구 너머로 손짓한다. 앞으로 온 우편이 쌓여 있다.</p>
            <button class="guild-mail__btn" @click="receiveMail">
              우편 수령
              <span class="guild-mail__gain">타이머 +{{ mailPending }}</span>
            </button>
          </template>
          <p v-else class="guild-mail__msg guild-mail__wait">다음 우편까지 {{ mailTurns }}턴.</p>
        </div>
      </Collapsible>

      <!-- 거래 계약 — 게이트에서 수주한 거래를 여기서 완료(요구 품목 충분할 때). -->
      <Collapsible
        v-if="tradeRows.length > 0"
        title="맡은 거래"
        :badge="`${tradeRows.length}건`"
      >
        <div class="trade-list">
        <div v-for="row in tradeRows" :key="row.nodeId" class="trade-row">
          <div class="trade-row__main">
            <div class="trade-row__where">{{ row.nodeLabel }}</div>
            <div class="trade-row__req">
              {{ row.reqName }} {{ row.req.count }}개
              <span v-if="row.upperName" class="trade-row__sub">({{ row.upperName }}도 1개로 셈)</span>
            </div>
            <div class="trade-row__meter" :class="{ 'trade-row__meter--ok': row.ready }">
              보유 {{ row.held }} / {{ row.req.count }}
            </div>
          </div>
          <button
            class="trade-row__btn"
            :disabled="!row.ready"
            @click="completeTradeAt(row)"
          >{{ row.ready ? '완료' : '모자람' }}</button>
        </div>
        </div>
      </Collapsible>

      <!-- NPC 목록 — 섹션 접이식 + 각 NPC도 개별 접이식 행(헤더=이름·종족·친밀도, 본문=대사+버튼). -->
      <Collapsible
        v-if="nodeNpcs.length > 0"
        title="이 곳의 사람들"
        :badge="`${nodeNpcs.length}명`"
      >
        <div class="npc-list">
        <div
          v-for="npc in nodeNpcs"
          :key="npc.id"
          class="npc-card"
          :class="{ 'npc-card--open': openNpcIds.has(npc.id) }"
        >
          <button class="npc-card__hd" @click="toggleNpc(npc.id)">
            <span class="npc-card__arrow">{{ openNpcIds.has(npc.id) ? '▾' : '▸' }}</span>
            <span class="npc-card__name">{{ npc.name }}</span>
            <span class="npc-card__meta">{{ npc.raceId }} · {{ npc.role }}</span>
            <span class="npc-card__aff">친밀도 {{ affinityOf(npc) }}</span>
          </button>
          <div v-if="openNpcIds.has(npc.id)" class="npc-card__body">
            <p v-if="npc.tagline" class="npc-card__tagline">{{ npc.tagline }}</p>
            <div class="npc-card__actions">
              <button class="npc-card__btn npc-card__btn--talk" @click="talk(npc)">대화한다</button>
            </div>
            <!-- 동료 권유 UI — companion(또는 legacy recruit) 정의가 있는 NPC만 표시. -->
            <div v-if="companionOf(npc)" class="npc-card__recruit">
              <span class="npc-card__summary">{{ recruitSummary(npc) }}</span>
              <button
                v-if="!run.inRoster(npc.id)"
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
        </div>
      </Collapsible>

      <!-- 제작 — 간이 카드 제작 + 포션 제작을 한 섹션으로 묶어 접이식. -->
      <Collapsible title="제작" subtitle="카드 · 포션">
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
      </Collapsible>

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

/* 길드 우편 */
.guild-mail { display: grid; gap: 0.6rem; }
.guild-mail__msg { margin: 0; color: #d6d6e0; font-size: 0.88rem; }
.guild-mail__wait { color: #b6b6c4; }
.guild-mail__btn { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.7rem 1rem; background: rgba(246, 232, 184, 0.14); border: 1px solid rgba(246, 232, 184, 0.45); color: #f6e8b8; border-radius: 8px; cursor: pointer; font: inherit; font-weight: 600; }
.guild-mail__btn:hover { background: rgba(246, 232, 184, 0.26); }
.guild-mail__gain { color: #ffd98e; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.opt { padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; display: flex; flex-direction: column; gap: 0.2rem; }
.opt:hover:not(:disabled) { background: rgba(142, 255, 184, 0.1); border-color: rgba(142, 255, 184, 0.4); }
.opt:disabled { opacity: 0.4; cursor: not-allowed; }
.opt__title { font-weight: 600; color: #f6e8b8; }
.opt__hint { font-size: 0.85rem; color: #888; }
.opt--leave { background: rgba(255,255,255,0.02); }

/* 거래 계약 목록 */
.trade-list { display: grid; gap: 0.5rem; margin-bottom: 0.6rem; }
.trade-list__title { color: #c0b693; font-size: 0.85rem; letter-spacing: 0.08em; margin: 0.4rem 0 0.2rem; }
.trade-row { display: flex; align-items: center; gap: 0.8rem; padding: 0.7rem 0.9rem; background: rgba(216, 180, 106, 0.08); border: 1px solid rgba(216, 180, 106, 0.32); border-radius: 8px; }
.trade-row__main { flex: 1; min-width: 0; display: grid; gap: 0.15rem; }
.trade-row__where { color: #f6e8b8; font-weight: 600; font-size: 0.9rem; }
.trade-row__req { color: #d6d6e0; font-size: 0.85rem; }
.trade-row__sub { color: #9a9aa8; font-size: 0.78rem; }
.trade-row__meter { color: #d8b46a; font-size: 0.82rem; }
.trade-row__meter--ok { color: #a8e88e; }
.trade-row__btn { padding: 0.45rem 0.9rem; background: rgba(142, 232, 142, 0.16); border: 1px solid rgba(142, 232, 142, 0.45); color: #d6f0d6; border-radius: 6px; cursor: pointer; font: inherit; font-size: 0.85rem; font-weight: 600; white-space: nowrap; }
.trade-row__btn:hover:not(:disabled) { background: rgba(142, 232, 142, 0.3); }
.trade-row__btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* NPC 목록 */
.npc-list { display: grid; gap: 0.6rem; margin-bottom: 0.6rem; }
.npc-list__title { color: #c0b693; font-size: 0.85rem; letter-spacing: 0.08em; margin: 0.4rem 0 0.2rem; }
.npc-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }
.npc-card--open { border-color: rgba(192,142,255,0.35); background: rgba(192,142,255,0.05); }
.npc-card__hd { display: flex; gap: 0.6rem; align-items: baseline; width: 100%; padding: 0.6rem 0.9rem; background: none; border: none; color: inherit; cursor: pointer; text-align: left; font: inherit; }
.npc-card__hd:hover { background: rgba(255,255,255,0.04); }
.npc-card__arrow { color: #c0b693; font-size: 0.8rem; flex-shrink: 0; }
.npc-card__body { padding: 0.2rem 0.9rem 0.7rem; display: grid; gap: 0.3rem; border-top: 1px solid rgba(255,255,255,0.08); }
.npc-card__name { color: #f6e8b8; font-weight: 600; }
.npc-card__meta { font-size: 0.78rem; color: #888; }
.npc-card__tagline { color: #a4a4b0; font-size: 0.85rem; margin: 0.4rem 0 0; font-style: italic; }
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
