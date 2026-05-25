<script setup lang="ts">
/**
 * 보스전 화면 — intro → combat → victory/defeat (결과 화면 강제).
 *
 * 보스는 Monster와 *다른 데이터 단위*지만, combat 시스템은 Monster 형태로
 * 통일되어 있으므로 어댑터로 변환하여 startCombat에 넘긴다.
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import {
  startCombat,
  playCard as playCardSys,
  clearCombat,
  struggle,
  statusBonusForCardEffectKind,
  resolveIntent,
} from '@/systems/combat';
import { applyBossRewards, applyArcRewards } from '@/systems/boss-rewards';
import { effectiveContent } from '@/systems/map';
import { colorBonusForCardEffectKind } from '@/systems/stats';
import { bonusesFromEffective } from '@/systems/equipment';
import { cardEffectKindLabel, cardEffectDescription, cardDetailText, statusDescription, intentLabel, intentDescription, unlockKeyLabel, lockBadgeText, lockTooltip } from '@/systems/labels';
import { useItem } from '@/systems/item';
import { activeSkillSlots, useSkill } from '@/systems/skills';
import { useCombatFx, CARD_PLAY_DELAY } from '@/composables/useCombatFx';
import { useEnemyTurn } from '@/composables/useEnemyTurn';
import { useCombatKeys } from '@/composables/useCombatKeys';
import StruggleMinigame from '@/components/StruggleMinigame.vue';
import CombatHand from '@/components/CombatHand.vue';
import type { Boss, BossPhase, BossSignatureVariant, Card, CardEffect, Combatant, Item, Monster } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

type Phase = 'intro' | 'combat' | 'victory' | 'defeat';
const phase = ref<Phase>('intro');

const timeline = computed(() => data.timelines.get(run.data.timelineId));

/** 현재 노드 — arc 보스 노드 식별 + 클리어 마킹 대상. */
const currentNode = computed(() => {
  const map = data.nodeMaps.get(timeline.value?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === run.data.currentNodeId);
});

const boss = computed<Boss | undefined>(() => {
  // 디버그 전투 오버라이드 — 설정 시 연표 보스 대신 지정 보스.
  const dbgId = ui.debugBattle.bossId;
  if (dbgId) {
    const dbgBoss = data.bosses.get(dbgId);
    if (dbgBoss) return dbgBoss;
  }
  // 작업 29: arc 노드는 노드 contentRef.boss로 *어느 보스인지* 전달한다.
  // 권역 풀 재추첨(effectiveContent)도 반영하되, 보스 노드는 kind/content가 고정이라 원본 그대로.
  const node = currentNode.value;
  const nodeBossId = node ? effectiveContent(node, run.data)?.bossId ?? node.contentRef?.bossId : undefined;
  if (nodeBossId) {
    const nb = data.bosses.get(nodeBossId);
    if (nb) return nb;
  }
  // 폴백 — 연표 종말 보스(boss_gate 경로).
  const id = timeline.value?.bossId;
  return id ? data.bosses.get(id) : undefined;
});

/** arc 보스인가 — 승패 분기·대화 회피 UI 토글. */
const isArc = computed<boolean>(() => boss.value?.kind === 'arc');

const combat = computed(() => run.data.combat);

// 방금 전 플레이 내용 — 턴 카운터 아래 중앙에 로그처럼 표시(최근 4줄).
// 한 줄만(최신) — 드로우가 많아도 가리지 않게.
const recentLog = computed<string[]>(() => (combat.value?.log ?? []).slice(-1));

// === 전투 FX (플로팅 숫자 / 흔들림 / 플래시) — CombatView와 동일 규칙 ===
const fx = useCombatFx();
// 카드 사용 애니메이션 상태 — 번쩍→사라짐 동안 해당 손패 인덱스를 잠근다.
const playingIndex = ref<number | null>(null);

watch(
  () => combat.value?.enemy.hp,
  (hp, prev) => {
    if (hp === undefined || prev === undefined) return;
    if (hp < prev) fx.showDamage('enemy', prev - hp);
    else if (hp > prev) fx.showHeal('enemy', hp - prev);
  },
);
watch(
  () => combat.value?.player.hp,
  (hp, prev) => {
    if (hp === undefined || prev === undefined) return;
    if (hp < prev) fx.showDamage('player', prev - hp);
    else if (hp > prev) fx.showHeal('player', hp - prev);
  },
);
watch(
  () => combat.value?.player.block,
  (b, prev) => {
    if (b === undefined || prev === undefined) return;
    if (b > prev) fx.showBlock('player', b - prev);
  },
);
watch(
  () => combat.value?.enemy.block,
  (b, prev) => {
    if (b === undefined || prev === undefined) return;
    if (b > prev) fx.showBlock('enemy', b - prev);
  },
);

/**
 * 현재 활성 phase — 보스 HP 비율로 결정.
 * phases는 startsAtHpRatio 내림차순 (1.0 → 0.66 → 0.33 등)으로 가정.
 * 현재 비율 ≤ startsAtHpRatio인 *가장 늦은* phase 활성.
 */
const activePhase = computed<BossPhase | undefined>(() => {
  const b = boss.value;
  if (!b?.phases.length) return undefined;
  const c = combat.value;
  const currentHp = c?.enemy.hp ?? b.hp;
  const ratio = currentHp / Math.max(1, b.hp);
  let active: BossPhase | undefined = b.phases[0];
  for (const p of b.phases) {
    if (ratio <= p.startsAtHpRatio) active = p;
  }
  return active;
});

/** 현재 종족 ID로 시그니처 변이가 매칭되면 그 variant. (히페리온 5단계 시그니처는 deprecated — 매칭 안 되면 undefined.) */
const activeVariant = computed<BossSignatureVariant | undefined>(() => {
  const b = boss.value;
  if (!b?.signatureVariants) return undefined;
  return b.signatureVariants.find((v) => v.signatureId === run.data.raceId);
});

/** Boss → Monster 어댑터 — phase + signature intent 적용 (동적). */
const bossAsMonster = computed<Monster>(() => {
  const b = boss.value;
  if (!b) {
    return {
      id: 'unknown-boss',
      name: '???',
      hp: 50,
      attack: 8,
      defense: 0,
      intents: [{ encoded: 'attack:8' }],
      drop: { gold: 0, timeShards: 0 },
    };
  }
  // signature.intentOverrides 우선, 없으면 활성 phase intents.
  const sourceIntents =
    activeVariant.value?.intentOverrides ??
    activePhase.value?.intents ??
    [];
  // encoded(원본 raw 토큰)가 진실원 — 다중 토큰 인텐트(bind:4:1, debuff:2:weakness 등)를 손실 없이 전달.
  // 구 보스 데이터(encoded 없음)는 kind:value로 fallback → "attack:8" 식으로 그대로 작동.
  const intents = sourceIntents.length > 0
    ? sourceIntents.map((i) => ({ encoded: i.encoded ?? `${i.kind}:${i.value ?? 0}` }))
    : [{ encoded: 'attack:8' }];
  return {
    id: b.id,
    name: b.name,
    hp: b.hp,
    attack: b.attack,
    defense: b.defense,
    intents,
    drop: { gold: 0, timeShards: 0 },
  };
});

/** 활성 phase index — phase 전환 토스트 트리거용. */
const activePhaseIndex = computed<number>(() => {
  const b = boss.value;
  const active = activePhase.value;
  if (!b || !active) return 0;
  return b.phases.indexOf(active);
});

watch(activePhaseIndex, (newIdx, oldIdx) => {
  if (newIdx === oldIdx) return;
  if (oldIdx === undefined) return;
  // 전투 중에만 전환 토스트.
  if (phase.value !== 'combat') return;
  ui.toast('warning', `보스가 ${newIdx + 1}단계로 자세를 바꾼다`);
});

/**
 * 현재 활성 페이즈의 기믹을 전투 상태에 반영.
 * 페이즈 전환 시 mechanic만 갱신하고 stillness/bossTurnCount 등 카운터는 유지.
 */
function syncBossMechanic() {
  const c = run.data.combat;
  if (!c) return;
  c.bossMechanic = activePhase.value?.mechanic;
}

// 페이즈가 바뀔 때마다(=HP 비율로 mechanic 변경) 전투 상태에 기믹 반영.
watch(activePhaseIndex, () => {
  if (phase.value !== 'combat') return;
  syncBossMechanic();
});

/** 현재 기믹 라벨 (헤더 힌트용). */
const mechanicLabel = computed<string>(() => {
  switch (combat.value?.bossMechanic) {
    case 'anchor': return '시간의 닻';
    case 'stillness': return '정지';
    case 'rewind': return '되감기';
    default: return '';
  }
});

/** 카드가 잠겼는지 — 보스 닻(anchor)과 grapple bind 둘 다 lockedCardIds를 쓰므로 mechanic 조건 없이 검사. */
function isLocked(c: Card): boolean {
  const cmb = combat.value;
  return !!c.instanceId && (cmb?.lockedCardIds?.includes(c.instanceId) ?? false);
}

function startBattle() {
  // 시그니처 매칭 캐릭터면 *맞춤 대화* 노출 (몰입).
  const variant = activeVariant.value;
  if (variant?.dialogue?.length) {
    for (const line of variant.dialogue) {
      ui.toast('info', line, 4000);
    }
  }
  startCombat(bossAsMonster.value);
  // 전투 시작 직후 현재 페이즈의 기믹을 전투 상태에 set (combat은 startCombat에서 생성됨).
  syncBossMechanic();
  phase.value = 'combat';
}

/**
 * 대화 회피(JRPG식 "다음에") — 전투 없이 맵 복귀, *보상 0*, arc 노드는 *클리어 안 됨*.
 * 고정 재진입 노드라 하루에 몇 번이든 다시 들어올 수 있다(싸워 이겨야 클리어).
 */
function decline() {
  router.push('/game/map');
}

// === 적 턴 순차 진행(작업 34) — 보스도 페이즈 기믹·멀티 인텐트를 한 액션씩 보여준다 ===
const { enemyActing, runTurn } = useEnemyTurn();

function play(index: number) {
  // 애니메이션 중·적 행동 중 중복 입력 차단.
  if (playingIndex.value !== null || enemyActing.value) return;
  const card = combat.value?.hand[index];
  if (!card || !canPlay(card)) return; // 키보드 위치 입력 등에서 사용 불가 카드 가드.
  const finish = () => {
    playingIndex.value = null;
    const result = playCardSys(index, bossAsMonster.value);
    if (result.enemyDefeated) onVictory();
  };
  if (CARD_PLAY_DELAY <= 0) {
    finish();
    return;
  }
  // 선택 카드에 .card--playing 부여(번쩍→위로 날아가며 페이드) 후 실제 play.
  playingIndex.value = index;
  window.setTimeout(finish, CARD_PLAY_DELAY);
}

function endTurn() {
  // 적 행동 진행 중·카드 애니메이션 중엔 무시(소프트락/중복 방지).
  if (enemyActing.value || playingIndex.value !== null) return;
  void runTurn(bossAsMonster.value, (result) => {
    if (result.playerDefeated) {
      onDefeat();
    } else if (result.enemyDefeated) {
      // 보스가 poison/행동 중 사망 — 승리 처리.
      onVictory();
    }
  });
}

function onVictory() {
  const b = boss.value;
  if (!b) return;
  if (isArc.value) {
    // === arc 승리 — 맵 복귀 + 전용 특전 자동 드롭 + 클리어 마킹. 런은 지속(종료 X). ===
    // applyArcRewards는 *arcsCleared 미포함 시*에만 드롭하므로 push 이전에 호출.
    applyArcRewards(b);
    if (!run.data.arcsCleared) run.data.arcsCleared = [];
    if (!run.data.arcsCleared.includes(b.id)) run.data.arcsCleared.push(b.id);
    // 노드 클리어 마킹 — 재진입 시 전투 없이 통과(combatCleared 재사용).
    run.markCombatCleared(run.data.currentNodeId);
    clearCombat();
    phase.value = 'victory';
    return;
  }
  // === 일반 보스 승리 — 현행(메타 보상). ===
  // applyBossRewards가 *bossesCleared 미포함 시*에만 희소 재료 + 권역 컬러 부스트를 발사하므로,
  // bossesCleared.push *이전*에 호출해야 한다.
  applyBossRewards(b);
  run.data.bossesCleared.push(b.id);
  clearCombat();
  phase.value = 'victory';
}

function onDefeat() {
  // Item 28 — 목숨 분기. 보스·아크도 목숨이 있으면 도망 후 재도전(노드 미클리어 유지).
  const nodeId = run.data.currentNodeId;
  clearCombat();
  if (run.loseLife()) {
    run.flee(nodeId);
    ui.toast('warning', '쓰러질 뻔했지만, 목숨 하나로 가까스로 몸을 뺐다.');
    router.push('/game/map');
    return;
  }
  phase.value = 'defeat';
}

/**
 * arc 승리 후 맵 복귀 — 런 지속(종료 경로를 타지 않는다).
 */
function backToMap() {
  router.push('/game/map');
}

/**
 * === 패배 경로 중앙화 (작업 29) ===
 * arc·boss 공통 패배 = 현행(런 종료). 한 곳으로 모아 *향후 목숨/도망 기능(작업 28)이 여기 후킹*한다.
 * (지금은 무조건 런 종료. 목숨 도입 시 이 함수에서 부활/재시도 분기를 추가.)
 */
function handleDefeatExit() {
  // 흡수·리셋은 RunEndView(/game/end)가 일괄 처리 — 모든 종료 경로를 요약 화면으로 합류.
  run.endRun('boss-defeated');
  router.push('/game/end');
}

function finishRun(reason: 'boss-cleared' | 'boss-defeated') {
  // 흡수·리셋은 RunEndView(/game/end)가 일괄 처리 — 모든 종료 경로를 요약 화면으로 합류.
  run.endRun(reason);
  router.push('/game/end');
}

onMounted(() => {
  if (!run.active || !boss.value) {
    ui.toast('warning', '보스 데이터 누락');
    router.push('/main');
  }
});

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
function cardBorder(c: Card): string { return rankColors[c.rank] ?? '#a4a4b0'; }
/** 표시·판정용 실효 비용 — 몬스터/보스 비용 교란(cost-up) 반영. */
function displayCost(c: Card): number {
  const up = combat.value?.costUp?.amount ?? 0;
  return Math.max(0, c.cost + up);
}
function canPlay(c: Card): boolean {
  if (!combat.value) return false;
  if (c.unplayable) return false;            // 잡카드(상처/저주) — 사용 불가.
  if (isLocked(c)) return false;             // 닻/구속으로 잠김.
  if (combat.value.frozenTurn) return false; // 마비/정지 턴.
  return combat.value.mana >= displayCost(c);
}

// 카드 effect 표시 — 컬러 보너스 반영된 정적 최종값 + 전투 buff/debuff (+N) 부가.
// B1 fix: effective(베이스+장비) 사용.
const currentBonuses = computed(() => bonusesFromEffective(run.data, data.equipments));
function effectiveValue(eff: CardEffect): number {
  return (eff.value ?? 0) + colorBonusForCardEffectKind(eff.kind, currentBonuses.value);
}
function statusDelta(eff: CardEffect): number {
  if (!combat.value) return 0;
  return statusBonusForCardEffectKind(eff.kind, combat.value.player.statuses);
}

// === 버프/디버프 표시 (CombatView와 동일 규칙) ===
const statusLabels: Record<string, string> = {
  strength: '힘',
  weakness: '약화',
  dexterity: '민첩',
  frail: '취약',
  vulnerable: '취약',
  poison: '중독',
  burn: '화상',
  feral: '수화',
  regress: '퇴행',
  paralyze: '마비',
  spasm: '경련',
  sap: '잠식',
  ghost: '유령화',
  brainwash: '세뇌',
  possession: '혼란',
  sleep: '수면',
  slime: '점액',
  imprint: '각인',
  'feral-heavy': '심수화',
  // 이로운(버프) 상태 (Colorz 18-c).
  regen: '재생',
  haste: '가속',
  ward: '보호막',
  thorns: '반격',
  focus: '집중',
  resolve: '정신력',
};
function statusEntries(c: Combatant | undefined) {
  if (!c) return [] as { key: string; count: number; label: string }[];
  return Object.entries(c.statuses ?? {})
    .filter(([, v]) => v > 0)
    .map(([key, count]) => ({ key, count, label: statusLabels[key] ?? key }));
}

// === 구속/삼킴(grapple) + 발버둥 / 변신 / 손패 은폐(obscure) — CombatView와 동일 ===
const grapple = computed(() => combat.value?.grapple);
const obscured = computed(() => (combat.value?.obscuredTurns ?? 0) > 0);
/**
 * 이번 적 턴 의도 목록 — 멀티슬롯(+)이면 여러 개(CombatView 패리티, [[project_bossview_disruption_backlog]] 해소).
 * 동적 의도(resolveIntent)로 *현재 상태* 기준 실시간 해석 — 락인/동적 플래그가 텔레그래프에 즉시 반영.
 */
const enemyIntentList = computed<string[]>(() => {
  const c = combat.value;
  if (!c) return [];
  const raw = (c.enemyIntentQueue && c.enemyIntentQueue.length > 0)
    ? c.enemyIntentQueue
    : (c.enemyIntent ? [c.enemyIntent] : []);
  return raw.map((it) => resolveIntent(it, c));
});
/** 락(조준형) 배지 — 보스 패리티. 다중 락(과녁 + 이름·조건·진행도). */
const locks = computed(() => combat.value?.locks ?? []);
/** 레거시 락인(전역 단일 락) — lockin 행동을 안 쓰는 옛 몹/보스 전용. 보스 패리티(큐 전체 검사). */
const legacyLockIn = computed<{ value: number; unlocked: boolean } | null>(() => {
  const c = combat.value;
  if (!c || (c.lockIn ?? 0) <= 0) return null;
  if ((c.locks?.length ?? 0) > 0) return null;
  const raw = (c.enemyIntentQueue && c.enemyIntentQueue.length > 0)
    ? c.enemyIntentQueue
    : (c.enemyIntent ? [c.enemyIntent] : []);
  if (!raw.some((it) => it.includes('~unlocked='))) return null;
  return { value: c.lockIn ?? 0, unlocked: (c.player.block ?? 0) >= (c.lockIn ?? 0) };
});
// 강 구속/삼킴(grapple.hard)은 색상 미니게임으로만 발버둥(보스 패리티 — CombatView와 동일).
const showStruggleMinigame = ref(false);
function doStruggle() {
  if (enemyActing.value || playingIndex.value !== null) return; // 적 행동/카드 애니메이션 중 차단.
  if (!grapple.value) return; // 구속/삼킴 중이 아니면 무시(키보드 S 가드).
  if (grapple.value.hard) {
    showStruggleMinigame.value = true;
  } else {
    struggle();
  }
}

// === PC 키보드 전용 입력(작업 31) — CombatView와 동일(보스 패리티) ===
function keysBlocked(): boolean {
  return (
    phase.value !== 'combat' ||
    enemyActing.value ||
    playingIndex.value !== null ||
    showStruggleMinigame.value
  );
}
useCombatKeys({
  playIndex: play,
  endTurn,
  struggle: doStruggle,
  isBlocked: keysBlocked,
});
const transform = computed(() => run.data.transform);
const formName = computed(() => data.races.get(run.data.transform?.formRaceId ?? '')?.name ?? '변신');
/** 변신 해제 스택 (Item 28) — '본모습' 카드 -2, 0 이하에서 원복. 구세이브 폴백 5. */
const releaseStack = computed(() => run.data.transform?.releaseStack ?? 5);

// === 목숨 (Item 28) ===
const lives = computed(() => run.data.lives ?? 2);
const maxLives = computed(() => run.data.maxLives ?? 2);
const lifeHearts = computed(() =>
  '❤'.repeat(Math.max(0, lives.value)) + '🤍'.repeat(Math.max(0, maxLives.value - lives.value)),
);

// === 전투 포션 (combat=true) — 턴당 1회, 마나 무관 ===
const combatPotions = computed<Item[]>(() => run.data.items.filter((i) => i.combat));
const potionUsed = computed(() => combat.value?.potionUsedThisTurn ?? false);
function potionEffShort(e: Item['effects'][number]): string {
  switch (e.kind) {
    case 'heal': return `HP +${e.value ?? 0}`;
    case 'combat-mana': return `마나 +${e.value ?? 0}`;
    case 'combat-draw': return `드로우 ${e.value ?? 0}`;
    case 'combat-block': return `방어 +${e.value ?? 0}`;
    case 'combat-enemy-status': return `적 ${statusLabels[String(e.param ?? '')] ?? e.param} +${e.value ?? 0}`;
    case 'combat-self-status': return `${statusLabels[String(e.param ?? '')] ?? e.param} +${e.value ?? 0}`;
    case 'combat-free-grapple': return '구속 해제';
    case 'cleanse-group': return cleanseGroupLabel(String(e.param ?? 'all'));
    default: return e.kind;
  }
}
const CLEANSE_GROUP_LABELS: Record<string, string> = {
  low: '하급 디버프 정화', mid: '중급 디버프 정화', high: '상급 디버프 정화', all: '디버프 전체 정화',
};
function cleanseGroupLabel(group: string): string {
  return CLEANSE_GROUP_LABELS[group] ?? '디버프 정화';
}
function potionSummary(itm: Item): string {
  return itm.effects.map(potionEffShort).join(' · ');
}
function usePotion(itm: Item) {
  if (potionUsed.value) return;
  useItem(itm);
}

// === 동료 액티브 스킬 (Item 37-② Stage A) — CombatView 패리티 ===
const skillSlots = computed(() => activeSkillSlots());
function useSkillSlot(slot: number) {
  if (enemyActing.value || playingIndex.value !== null) return;
  const result = useSkill(slot);
  if (result.enemyDefeated) onVictory();
}
</script>

<template>
  <main v-if="boss" class="boss-view">
    <!-- Intro -->
    <section v-if="phase === 'intro'" class="intro">
      <h1>{{ boss.name }}</h1>
      <p class="lore">{{ boss.description }}</p>
      <div v-if="boss.introText" class="intro__text">{{ boss.introText }}</div>
      <!-- arc 보스: 성격별 분위기 대사 몇 줄 (대화 회피 JRPG식). -->
      <div v-if="isArc && boss.dialogue && boss.dialogue.length" class="dialogue">
        <p v-for="(line, i) in boss.dialogue" :key="i" class="dialogue__line">{{ line }}</p>
      </div>

      <!-- arc: "실력을 시험한다"(전투) / "다음에"(회피·재진입). 일반 보스: 단일 시작 버튼. -->
      <div v-if="isArc" class="intro__choices">
        <button class="begin" @click="startBattle">{{ boss.challengeLabel || '실력을 시험한다' }} →</button>
        <button class="decline" @click="decline">{{ boss.declineLabel || '다음에' }}</button>
      </div>
      <button v-else class="begin" @click="startBattle">싸움을 시작한다 →</button>
    </section>

    <!-- Combat -->
    <section v-else-if="phase === 'combat' && combat" class="combat-shell">
      <header class="hdr">
        <div class="combatant player" :class="{ 'is-hit': fx.playerHit.value }">
          <!-- 플로팅 숫자 오버레이 (피해/회복/방어) -->
          <div class="fx-layer">
            <span
              v-for="f in fx.floats.value.filter((x) => x.target === 'player')"
              :key="f.id"
              class="float-num"
              :class="`float-num--${f.kind}`"
              :style="{ '--drift': f.drift }"
            >{{ f.text }}</span>
          </div>
          <h3>전생자</h3>
          <div class="bar">HP {{ combat.player.hp }} / {{ combat.player.maxHp }}
            <span v-if="combat.player.block > 0" class="block" :class="{ 'block--pulse': fx.playerShield.value }">🛡 {{ combat.player.block }}</span>
          </div>
          <div class="mana">마나 {{ combat.mana }} / {{ combat.maxMana }}</div>
          <div class="lives" v-tooltip="`목숨 ${lives}/${maxLives}: 쓰러져도 목숨이 남으면 도망쳐 살아남는다.`">
            {{ lifeHearts }} <span class="lives__num">{{ lives }}/{{ maxLives }}</span>
          </div>
          <ul class="statuses">
            <li v-for="s in statusEntries(combat.player)" :key="s.key" class="status" :data-key="s.key" v-tooltip="statusDescription(s.key)">
              {{ s.label }} ×{{ s.count }}
            </li>
          </ul>
        </div>
        <div class="vs">
          ⚔ 턴 {{ combat.turn }}
          <span v-if="enemyActing" class="enemy-acting">적 행동 중…</span>
        </div>
        <div class="combatant enemy" :class="{ 'is-hit': fx.enemyHit.value }">
          <div class="fx-layer">
            <span
              v-for="f in fx.floats.value.filter((x) => x.target === 'enemy')"
              :key="f.id"
              class="float-num"
              :class="`float-num--${f.kind}`"
              :style="{ '--drift': f.drift }"
            >{{ f.text }}</span>
          </div>
          <h3>{{ boss.name }}</h3>
          <div class="bar bar--boss">HP {{ combat.enemy.hp }} / {{ combat.enemy.maxHp }}
            <span v-if="combat.enemy.block > 0" class="block" :class="{ 'block--pulse': fx.enemyShield.value }">🛡 {{ combat.enemy.block }}</span>
          </div>
          <!-- 다중 의도 텔레그래프 — 멀티슬롯(+) 보스도 CombatView처럼 한 행동씩 표시(보스 패리티). -->
          <div class="intent">
            <span class="intent__lead">다음: <span class="intent__info">ⓘ</span></span>
            <span v-for="(it, i) in enemyIntentList" :key="i" class="intent__act" v-tooltip="intentDescription(it)">{{ intentLabel(it) }}</span>
          </div>
          <!-- 락(조준형) 배지 — 다중 락 각각 과녁 + 이름·조건·진행도 (보스 패리티) -->
          <div v-if="locks.length" class="locks">
            <div
              v-for="(lk, i) in locks"
              :key="`${lk.label}-${i}`"
              class="lockin lockin--target"
              v-tooltip="lockTooltip(lk)"
            >
              🎯 {{ lockBadgeText(lk) }}
            </div>
          </div>
          <div
            v-else-if="legacyLockIn"
            class="lockin"
            :class="{ 'lockin--open': legacyLockIn.unlocked }"
            v-tooltip="legacyLockIn.unlocked ? '방어를 충분히 쌓아 적의 특수 행동을 막았다. 이번 턴은 약하게 공격한다.' : `이번 턴 방어를 ${legacyLockIn.value} 이상 쌓으면 적의 특수 행동을 약한 공격으로 바꾼다.`"
          >
            {{ legacyLockIn.unlocked ? '🔓 락인 해제' : `🔒 락인 · 방어 ${legacyLockIn.value}` }}
          </div>
          <div v-if="mechanicLabel" class="mechanic">
            <span class="mechanic__name">{{ mechanicLabel }}</span>
            <span
              v-if="combat.bossMechanic === 'stillness' && (combat.stillness ?? 0) > 0"
              class="mechanic__stack"
            >×{{ combat.stillness }}</span>
            <span v-if="combat.frozenTurn" class="mechanic__frozen">시간이 멈췄다</span>
          </div>
          <ul class="statuses statuses--enemy">
            <li v-for="s in statusEntries(combat.enemy)" :key="s.key" class="status" :data-key="s.key" v-tooltip="statusDescription(s.key)">
              {{ s.label }} ×{{ s.count }}
            </li>
          </ul>
        </div>
      </header>

      <!-- 방금 전 플레이 로그 — 턴 카운터 아래 중앙 정렬 -->
      <div v-if="recentLog.length" class="combat-log">
        <p
          v-for="(line, i) in recentLog"
          :key="`${combat.turn}-${i}-${line}`"
          class="combat-log__line"
          :class="{ 'combat-log__line--latest': i === recentLog.length - 1 }"
        >{{ line }}</p>
      </div>

      <!-- 변신(체인지) — 본모습 카드로 스택을 줄여 해제. 해제 안 하고 이기면 런에 지속 -->
      <div v-if="transform" class="transform-banner">
        🦊 변신 중 · <strong>{{ formName }}</strong> · 변신 스택 <strong>{{ releaseStack }}</strong> · '본모습' 카드로 스택 -2 (0이면 원래 모습으로)
      </div>

      <!-- 구속/삼킴 — 발버둥으로 탈출 -->
      <div v-if="grapple" class="grapple" :class="`grapple--${grapple.kind}`">
        <span class="grapple__label">
          {{ grapple.label ?? (grapple.kind === 'bind' ? '구속' : '삼켜짐') }}
          <span class="grapple__gauge">탈출까지 {{ grapple.gauge }}</span>
          <span v-if="grapple.ramp > 0" class="grapple__ramp">방치 +{{ grapple.ramp }}</span>
        </span>
        <button
          class="struggle"
          :disabled="combat.frozenTurn || combat.mana < 1 || enemyActing"
          @click="doStruggle"
        >
          {{ grapple.hard ? '발버둥 (색 순서)' : '발버둥 (마나 1)' }}
        </button>
      </div>
      <StruggleMinigame v-if="showStruggleMinigame" @close="showStruggleMinigame = false" />

      <!-- 동료 스킬 — 발버둥·포션 옆 (CombatView 패리티) -->
      <div v-if="skillSlots.length > 0" class="skills">
        <span class="skills__label">동료 스킬</span>
        <button
          v-for="sk in skillSlots"
          :key="sk.slot"
          class="skill"
          :class="{ 'skill--disabled': !sk.ready, 'skill--lead': sk.slot === 0 }"
          :disabled="!sk.ready || enemyActing"
          v-tooltip.hold="`${sk.companionName} · ${sk.skill.description ?? sk.skill.name} (쿨다운 ${sk.skill.cooldown}${sk.slot === 0 ? ', 슬롯1 -1' : ''})`"
          @click="useSkillSlot(sk.slot)"
        >
          <span class="skill__name">
            <span v-if="sk.slot === 0" class="skill__lead">①</span>{{ sk.skill.name }}
          </span>
          <span class="skill__cd">{{ sk.cooldown > 0 ? `쿨 ${sk.cooldown}` : '준비됨' }}</span>
        </button>
      </div>

      <!-- 전투 포션 벨트 — 턴당 1회, 마나 무관 -->
      <div v-if="combatPotions.length > 0" class="potions">
        <span class="potions__label">포션{{ potionUsed ? ' (이번 턴 사용함)' : '' }}</span>
        <button
          v-for="it in combatPotions"
          :key="it.instanceId ?? it.id"
          class="potion"
          :class="{ 'potion--disabled': potionUsed }"
          :disabled="potionUsed"
          v-tooltip.hold="potionSummary(it)"
          @click="usePotion(it)"
        >
          <span class="potion__name">{{ it.name }}</span>
          <span class="potion__eff">{{ potionSummary(it) }}</span>
        </button>
      </div>

      <CombatHand
        :hand="combat.hand"
        :enemy-acting="enemyActing"
        :playing-index="playingIndex"
        :obscured="obscured"
        :can-play="canPlay"
        :display-cost="displayCost"
        :card-border="cardBorder"
        :is-locked="isLocked"
        :effective-value="effectiveValue"
        :status-delta="statusDelta"
        :effect-kind-label="cardEffectKindLabel"
        :effect-description="cardEffectDescription"
        :card-detail-text="cardDetailText"
        @play="play"
      />

      <footer class="pile-info">
        <div>드로우 {{ combat.drawPile.length }}</div>
        <div>버림 {{ combat.discardPile.length }}</div>
        <span class="key-hint" v-tooltip="'1~9·0: 카드 사용 · Space/Enter/E: 턴 종료 · S: 발버둥'">⌨ 단축키</span>
        <button class="end-turn" :disabled="enemyActing" @click="endTurn">턴 종료 →</button>
      </footer>
    </section>

    <!-- Victory (arc) — 맵 복귀, 런 지속. 특전은 토스트로 이미 흘렀다. -->
    <section v-else-if="phase === 'victory' && isArc" class="result result--win">
      <h1>승리</h1>
      <p class="result__subject">{{ boss.name }}이(가) 자세를 풀고 한 걸음 물러난다.</p>
      <div v-if="boss.defeatText" class="result__quote">{{ boss.defeatText }}</div>
      <p class="result__note">특전을 받아 들고 길을 잇는다.</p>
      <button class="finish" @click="backToMap">길을 잇는다 →</button>
    </section>

    <!-- Victory (일반 보스) — 런 종료 + 메타 보상. -->
    <section v-else-if="phase === 'victory'" class="result result--win">
      <h1>승리</h1>
      <p class="result__subject">{{ boss.name }}을(를) 마주하고 살아 돌아왔다.</p>
      <div v-if="boss.defeatText" class="result__quote">{{ boss.defeatText }}</div>

      <section class="rewards">
        <div class="reward-list">
          <div class="reward">
            <span>골드</span><span>+30</span>
          </div>
          <div v-if="boss.rewards.soulGain" class="reward">
            <span>영혼 자원</span><span>+{{ boss.rewards.soulGain }}</span>
          </div>
          <div v-for="k in boss.rewards.unlockKeys ?? []" :key="k" class="reward reward--unlock">
            <span>해금</span><span>{{ unlockKeyLabel(k) }}</span>
          </div>
        </div>
      </section>

      <button class="finish" @click="finishRun('boss-cleared')">귀환 →</button>
    </section>

    <!-- Defeat (arc·boss 공통 — 패배 경로 중앙화). -->
    <section v-else class="result result--lose">
      <h1>패배</h1>
      <p class="result__subject">{{ boss.name }}에게 무너졌다.</p>
      <p class="result__note">이 런은 끝났지만, 메타 진행은 기록된다.</p>
      <button class="finish" @click="handleDefeatExit">귀환 →</button>
    </section>
  </main>
</template>

<style scoped>
.boss-view { min-height: 100vh; min-height: 100dvh; padding: 2rem; display: flex; flex-direction: column; }
.intro { max-width: 700px; margin: 4rem auto; text-align: center; }
.intro h1 { font-size: 3rem; color: #ffe88e; }
.lore { color: #b6b6c4; margin: 1rem 0; }
.intro__text { padding: 1.2rem; background: rgba(0,0,0,0.5); border-left: 3px solid #ffe88e; border-radius: 4px; color: #d6d6e0; margin: 2rem 0; font-style: italic; }
.begin { padding: 0.8rem 1.5rem; background: rgba(255,232,142,0.2); border: 1px solid rgba(255,232,142,0.5); color: #ffe88e; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
.begin:hover { background: rgba(255,232,142,0.32); }
/* arc 대화 회피 — 분위기 대사 + 두 선택지. */
.dialogue { margin: 2rem auto; max-width: 560px; display: flex; flex-direction: column; gap: 0.6rem; }
.dialogue__line { margin: 0; color: #e2dcc4; line-height: 1.5; font-style: italic; }
.intro__choices { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem; }
.decline { padding: 0.8rem 1.5rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.25); color: #b6b6c4; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
.decline:hover { background: rgba(255,255,255,0.12); color: #d6d6e0; }

/* flex 컬럼 — hand가 가변 영역을 차지해 스크롤. (grid 1fr이 로그에 잘못 배정되던 겹침 수정.) */
.combat-shell { display: flex; flex-direction: column; gap: 1rem; flex: 1; min-height: 0; }
.hdr { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center; padding: 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; }
.player, .enemy { display: flex; flex-direction: column; gap: 0.3rem; }
.enemy { text-align: right; }
.enemy h3 { color: #ffe88e; margin: 0; }
.player h3 { color: #f6e8b8; margin: 0; }
.bar { padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.05); border-radius: 4px; }
.bar--boss { background: rgba(255,232,142,0.15); }
.block { margin-left: 0.5rem; color: #8eedff; }
.mana { color: #c08eff; font-weight: 600; }
.lives { color: #ffb8c4; font-size: 0.9rem; letter-spacing: -1px; }
.lives__num { letter-spacing: 0; font-weight: 600; }
.intent { color: #ffb88e; font-size: 0.9rem; }
/* 다중 의도 — 한 행동씩 줄바꿈 (CombatView와 동일). 적 측이라 우측 정렬. */
.intent__lead { display: block; }
.intent__act { display: block; }
.intent__act::before { content: '· '; opacity: 0.6; }
.lockin {
  margin-top: 2px;
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 8px;
  color: #ffd9a8;
  background: rgba(150, 70, 40, 0.35);
  border: 1px solid rgba(255, 170, 110, 0.5);
}
.lockin--open {
  color: #bff0c8;
  background: rgba(60, 130, 80, 0.32);
  border-color: rgba(150, 230, 170, 0.55);
}
/* 락(조준형) 배지 묶음 — 다중 락 세로 나열, 과녁 비주얼 (CombatView와 동일). */
.locks { margin-top: 3px; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.lockin--target {
  color: #ffd0d0;
  background: rgba(180, 60, 60, 0.3);
  border-color: rgba(255, 130, 130, 0.55);
}
.vs { font-size: 1.4rem; color: #f6e8b8; }
/* 적 행동 중 인디케이터 (CombatView와 동일) — 순차 행동 동안 입력 잠금 안내. */
.enemy-acting {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.72rem;
  font-weight: 700;
  color: #ffb88e;
  letter-spacing: 0.04em;
  animation: enemy-acting-pulse 900ms ease-in-out infinite;
}
@keyframes enemy-acting-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

/* 방금 전 플레이 로그 — 턴 카운터 아래 중앙 정렬 (CombatView와 동일). */
.combat-log {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  padding: 0.3rem 0.5rem 0;
  text-align: center;
  min-height: 1.1rem;
}
.combat-log__line { margin: 0; font-size: 0.82rem; line-height: 1.3; color: #6f6f80; }
.combat-log__line--latest { color: #e2dcc4; font-weight: 600; }

/* 보스 기믹 힌트 */
.mechanic { margin-top: 0.3rem; display: flex; gap: 0.4rem; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
.mechanic__name { font-size: 0.78rem; padding: 0.1rem 0.5rem; border-radius: 10px; background: rgba(192,142,255,0.18); border: 1px solid rgba(192,142,255,0.45); color: #d9c4ff; }
.mechanic__stack { font-size: 0.78rem; color: #c08eff; font-weight: 700; }
.mechanic__frozen { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 10px; background: rgba(142,237,255,0.18); border: 1px solid rgba(142,237,255,0.5); color: #bdf0ff; }

/* 버프/디버프 리스트 (CombatView와 동일) */
.statuses { list-style: none; padding: 0; margin: 0.3rem 0 0; display: flex; flex-wrap: wrap; gap: 0.3rem; }
.statuses--enemy { justify-content: flex-end; }
.status {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #d6d6e0;
}
.status[data-key="strength"], .status[data-key="dexterity"] { color: #8effb8; border-color: rgba(142,255,184,0.35); }
.status[data-key="weakness"], .status[data-key="frail"], .status[data-key="vulnerable"], .status[data-key="poison"], .status[data-key="burn"], .status[data-key="regress"] { color: #ff8e8e; border-color: rgba(255,142,142,0.35); }
.status[data-key="feral"] { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
/* ghost(유령화): 받는·주는 피해 절반 — 양날. 연보라(흐려짐). */
.status[data-key="ghost"] { color: #c9b8ff; border-color: rgba(192,142,255,0.45); }
/* 이로운(버프) 상태 (Colorz 18-c): 청록 계열로 "좋은 것"임을 구분. */
.status[data-key="regen"], .status[data-key="haste"], .status[data-key="ward"],
.status[data-key="thorns"], .status[data-key="focus"], .status[data-key="resolve"] {
  color: #8ee9ff; border-color: rgba(142,233,255,0.4);
}
/* 전투 포션 벨트 */
/* 동료 스킬 벨트 (CombatView 패리티) */
.skills { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 1rem; flex-wrap: wrap; }
.skills__label { color: #c0b693; font-size: 0.8rem; }
.skill {
  display: flex; flex-direction: column; gap: 0.1rem; padding: 0.4rem 0.7rem;
  background: rgba(192, 142, 255, 0.16); border: 1px solid rgba(192, 142, 255, 0.5);
  color: #f0e0ff; border-radius: 6px; cursor: pointer; font: inherit; text-align: left;
}
.skill:hover:not(.skill--disabled) { background: rgba(192, 142, 255, 0.3); }
.skill--disabled { opacity: 0.38; cursor: not-allowed; }
.skill--lead { border-color: rgba(246, 232, 184, 0.7); }
.skill__name { font-weight: 600; font-size: 0.85rem; color: #f6e8b8; }
.skill__lead { color: #f6e8b8; margin-right: 0.15rem; }
.skill__cd { font-size: 0.72rem; color: #d0b6ff; }

.potions { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 1rem; flex-wrap: wrap; }
.potions__label { color: #c0b693; font-size: 0.8rem; }
.potion { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.4rem 0.7rem; background: rgba(142, 237, 255, 0.12); border: 1px solid rgba(142, 237, 255, 0.4); color: #d0f0ff; border-radius: 6px; cursor: pointer; font: inherit; text-align: left; }
.potion:hover:not(.potion--disabled) { background: rgba(142, 237, 255, 0.24); }
.potion--disabled { opacity: 0.35; cursor: not-allowed; }
.potion__name { font-weight: 600; font-size: 0.85rem; color: #f6e8b8; }
.potion__eff { font-size: 0.72rem; color: #b6d8e0; }

/* === 전투원 영역 + 피격/플래시 + 플로팅 숫자 === */
.combatant { position: relative; }
.is-hit { animation: hit-shake 360ms ease; }
.enemy.is-hit::after, .player.is-hit::after {
  content: '';
  position: absolute; inset: -6px;
  border-radius: 10px;
  background: rgba(255, 80, 80, 0.22);
  pointer-events: none;
  animation: hit-flash 360ms ease forwards;
}
@keyframes hit-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
@keyframes hit-flash {
  0% { opacity: 0.9; }
  100% { opacity: 0; }
}
.block--pulse { animation: shield-pulse 420ms ease; display: inline-block; }
@keyframes shield-pulse {
  0% { transform: scale(1); filter: brightness(1); }
  40% { transform: scale(1.4); filter: brightness(2.4) drop-shadow(0 0 6px #8eedff); }
  100% { transform: scale(1); filter: brightness(1); }
}

/* 플로팅 숫자 오버레이 */
.fx-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 30; }
.float-num {
  position: absolute;
  left: 50%; top: 30%;
  transform: translateX(-50%);
  font-weight: 800;
  font-size: 1.5rem;
  text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  white-space: nowrap;
  animation: float-up 1000ms ease-out forwards;
}
.float-num--damage { color: #ff6b6b; }
.float-num--heal { color: #8effb8; }
.float-num--block { color: #8eedff; font-size: 1.1rem; }
@keyframes float-up {
  0% { opacity: 0; transform: translate(calc(-50% + (var(--drift) * 22px)), 8px) scale(0.7); }
  20% { opacity: 1; transform: translate(calc(-50% + (var(--drift) * 22px)), -4px) scale(1.15); }
  100% { opacity: 0; transform: translate(calc(-50% + (var(--drift) * 40px)), -52px) scale(1); }
}

/* 모션 감소 선호 — 흔들림/이동 최소화, 정보는 유지. (손패 카드 모션은 CombatHand가 자체 처리.) */
@media (prefers-reduced-motion: reduce) {
  .is-hit { animation: none; }
  .enemy.is-hit::after, .player.is-hit::after { animation: none; opacity: 0; }
  .block--pulse { animation: none; }
  .float-num { animation: float-up-reduced 700ms ease-out forwards; }
}
@keyframes float-up-reduced {
  0% { opacity: 0; }
  15% { opacity: 1; transform: translateX(-50%) translateY(-6px); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-18px); }
}

/* === 구속/삼킴 (grapple) + 발버둥 (CombatView와 동일) === */
.grapple {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  margin: 0.4rem 0; padding: 0.5rem 1rem; border-radius: 8px;
  border: 1px solid rgba(255,142,142,0.5); background: rgba(255,142,142,0.08);
}
.grapple--devour { border-color: rgba(192,142,255,0.55); background: rgba(192,142,255,0.1); }
.grapple__label { color: #ffb88e; font-weight: 700; display: inline-flex; gap: 0.6rem; align-items: baseline; }
.grapple--devour .grapple__label { color: #d6b8ff; }
.grapple__gauge { font-size: 0.85rem; color: #f6e8b8; font-weight: 600; }
.grapple__ramp { font-size: 0.8rem; color: #ff8e8e; font-weight: 700; }
.struggle {
  padding: 0.5rem 1.1rem; border-radius: 6px; cursor: pointer; font-weight: 700; font: inherit;
  background: rgba(255,184,108,0.22); border: 1px solid rgba(255,184,108,0.6); color: #ffe2c0;
}
.struggle:hover:not(:disabled) { background: rgba(255,184,108,0.34); }
.struggle:disabled { opacity: 0.4; cursor: not-allowed; }

/* 변신(체인지) 배너 (CombatView와 동일) */
.transform-banner {
  margin: 0.4rem 0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem;
  color: #ffd8a8; border: 1px solid rgba(255,184,108,0.55);
  background: linear-gradient(90deg, rgba(255,140,90,0.14), rgba(192,142,255,0.14));
}
.transform-banner strong { color: #ffe8b8; }

.pile-info { display: flex; gap: 1.5rem; padding: 0.8rem 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; color: #b6b6c4; align-items: center; }
.key-hint { margin-left: auto; font-size: 0.74rem; color: #8a8a99; cursor: help; user-select: none; }
.end-turn { margin-left: auto; padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
/* 힌트가 보이면 그것이 auto 여백을 차지 → 버튼은 작은 간격만. */
.key-hint + .end-turn { margin-left: 0.8rem; }
.end-turn:hover:not(:disabled) { background: rgba(192,142,255,0.3); }
.end-turn:disabled { opacity: 0.4; cursor: not-allowed; }
/* 데스크톱에서만 단축키 힌트 노출 — 모바일/터치는 키보드가 없으니 숨긴다(버튼은 auto로 우측 정렬 유지). */
@media (max-width: 640px) { .key-hint { display: none; } }

.result { max-width: 640px; margin: 4rem auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 1rem; }
.result--win h1 { color: #8effb8; font-size: 3rem; margin: 0; }
.result--lose h1 { color: #ff8e8e; font-size: 2.4rem; margin: 0; }
.result__subject { color: #d6d6e0; }
.result__quote { padding: 1rem; background: rgba(0,0,0,0.4); border-left: 3px solid #ffe88e; border-radius: 4px; color: #d6d6e0; font-style: italic; max-width: 480px; }
.result__note { color: #888; font-style: italic; }
.rewards { width: 100%; max-width: 460px; }
.reward-list { display: flex; flex-direction: column; gap: 0.6rem; }
.reward { display: flex; justify-content: space-between; padding: 0.8rem 1rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #ffe88e; font-weight: 600; }
.reward--unlock { border-color: rgba(192, 142, 255, 0.4); color: #c08eff; }
.finish { margin-top: 1rem; padding: 0.8rem 1.6rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; }
</style>
