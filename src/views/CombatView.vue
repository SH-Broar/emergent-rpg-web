<script setup lang="ts">
/**
 * 전투 화면 — 카드 핸드 + 적 + 턴 진행 + *결과 화면*.
 *
 * 사용자 피드백: 결과를 한 번의 텍스트 타이밍 후 명시적으로 보여줄 것.
 * - 승리 시: 드롭 정보 (골드 / 시간의 조각 / 카드) + '계속' 버튼
 * - 패배 시: 메시지 + '돌아간다' 버튼 → 메타 갱신 후 메인
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import {
  startCombat,
  playCard as playCardSys,
  applyMonsterDrop,
  clearCombat,
  struggle,
  resolveIntent,
  previewCardEffectValue,
  previewIntentLabel,
  type CombatVictoryDrop,
} from '@/systems/combat';
import { effectiveContent } from '@/systems/map';
import { applyCombatVictoryReward } from '@/systems/combat-rewards';
import { isHiddenIntent } from '@/systems/chaos';
import { cardEffectKindLabel, cardEffectDescription, statusDescription, statusLabel, intentDescription, cardDetailText, lockBadgeText, lockTooltip, josa } from '@/systems/labels';
import { useItem } from '@/systems/item';
import { activeSkillSlots, useSkill } from '@/systems/skills';
import { useCombatFx, CARD_PLAY_DELAY } from '@/composables/useCombatFx';
import { useEnemyTurn } from '@/composables/useEnemyTurn';
import { useCombatKeys } from '@/composables/useCombatKeys';
import StruggleMinigame from '@/components/StruggleMinigame.vue';
import CombatHand from '@/components/CombatHand.vue';
import SceneCharacter from '@/components/SceneCharacter.vue';
import type { Card, CardEffect, Combatant, Item, Monster } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

type Phase = 'combat' | 'victory' | 'defeat';
const phase = ref<Phase>('combat');
const drop = ref<CombatVictoryDrop | null>(null);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string; kind: string }) => n.id === run.data.currentNodeId);
});

const monster = computed<Monster>(() => {
  // 디버그 전투 오버라이드 — 설정 시 노드 대신 지정 몬스터.
  const dbgId = ui.debugBattle.monsterId;
  if (dbgId) {
    const dbgMonster = data.monsters.get(dbgId);
    if (dbgMonster) return dbgMonster;
  }
  // 권역 풀에서 재추첨된 enemy도 반영.
  const node = currentNode.value;
  const content = node ? effectiveContent(node, run.data) : undefined;
  const enemyId = content?.enemyGroupId ?? 'shadow-pup';
  const m = data.monsters.get(enemyId);
  if (m) return m;
  // 데이터에 없으면 fallback (기본 그림자 강아지 형태)
  return {
    id: 'fallback',
    name: '알 수 없는 그림자',
    hp: 14,
    attack: 5,
    defense: 0,
    intents: [{ encoded: 'attack:5' }, { encoded: 'defend:4' }],
    drop: { gold: 3, timeShards: 1 },
  };
});

const combat = computed(() => run.data.combat);

// 방금 전 플레이 내용 — 턴 카운터 아래 중앙에 한 줄만(최신). 드로우가 많아도 안 가리게.
const recentLog = computed<string[]>(() => (combat.value?.log ?? []).slice(-1));

// === 전투 FX (플로팅 숫자 / 흔들림 / 플래시) — HP·방어 변화를 watch 해 트리거 ===
const fx = useCombatFx();
// 카드 사용 애니메이션 상태 — 번쩍→사라짐 동안 해당 손패 인덱스를 잠근다.
const playingIndex = ref<number | null>(null);

// 적/플레이어 HP·방어 변화를 감시해 플로팅 숫자를 스폰.
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
// 방어 흡수 큐 — applyDamage가 push한 항목을 파란 데미지 팝업으로 변환. 처리 후 비운다.
watch(
  () => combat.value?.fxAbsorbed?.length,
  (len) => {
    if (!len) return;
    const q = combat.value!.fxAbsorbed!;
    for (const it of q) fx.showBlockedDamage(it.target, it.amount);
    q.length = 0;
  },
);

// === 적 턴 순차 진행(작업 34) — 적 행동 중에는 enemyActing이 true → 입력 잠금 ===
const { enemyActing, runTurn } = useEnemyTurn();

function play(index: number) {
  // 애니메이션 중·적 행동 중 중복 입력 차단.
  if (playingIndex.value !== null || enemyActing.value) return;
  const card = combat.value?.hand[index];
  if (!card || !canPlay(card)) return; // 키보드 위치 입력 등에서 사용 불가 카드 가드.
  const finish = () => {
    playingIndex.value = null;
    const result = playCardSys(index, monster.value);
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
  void runTurn(monster.value, (result) => {
    if (result.playerDefeated) {
      onDefeat();
    } else if (result.enemyDefeated) {
      // 적이 poison/행동 중 사망 — 승리 처리.
      onVictory();
    }
  });
}

function onVictory() {
  // 드롭 적용 + 권역 보상 (컬러+특산물+엘리트 유물/전설/희소재료) + 클리어 마킹.
  // applyCombatVictoryReward는 *cleared 마킹 전*에 *동기* 호출해야 첫 클리어로 인정된다.
  // (옛 코드: dynamic import().then() → markCombatCleared가 먼저 동기 실행돼 보상이 스킵되던 버그.)
  drop.value = applyMonsterDrop(monster.value.drop, data.cards);
  applyCombatVictoryReward(run.data.currentNodeId);
  // Item 37-② Stage B — 자동 동료 영입. 처치한 몬스터가 recruitable + companion 정의면 roster 추가.
  tryRecruitDefeated();
  run.markCombatCleared(run.data.currentNodeId);
  clearCombat();
  phase.value = 'victory';
}

/**
 * 처치한 몬스터 자동 영입 (Item 37-② Stage B).
 * recruitable + companion 정의가 있을 때만. 중복(이미 roster)이면 토스트 없이 스킵.
 * 디버그 전투(ui.debugBattle)에서도 monster.value 가 권위 소스라 동일하게 동작.
 */
function tryRecruitDefeated() {
  const m = monster.value;
  if (!m.recruitable || !m.companion) return;
  if (run.recruitMonster(m.id)) {
    ui.toast('success', `${josa(m.name, '이', '가')} 동료가 되었다`);
  }
}

function onDefeat() {
  // Item 28 — 목숨 분기. 전투 코어는 playerDefeated 신호만 내고, 목숨 소모/도망은 UI에서.
  const nodeId = run.data.currentNodeId;
  clearCombat();
  if (run.loseLife()) {
    // 목숨 남음 → 도망: 노드 미클리어 유지 + HP 30% 회복 + 맵 복귀. 변신·스택은 그대로.
    run.flee(nodeId);
    ui.toast('warning', '쓰러질 뻔했지만, 목숨 하나로 가까스로 몸을 뺐다.');
    router.push('/game/map');
    return;
  }
  // 목숨 0 → 패배 결과 화면(돌아간다 버튼이 endRun).
  phase.value = 'defeat';
}

function backToMap() {
  router.push('/game/map');
}

function returnToMain() {
  // 흡수·리셋은 RunEndView(/game/end)가 일괄 처리 — 모든 종료 경로를 요약 화면으로 합류.
  run.endRun('hp-zero');
  router.push('/game/end');
}

onMounted(() => {
  if (!run.active) {
    router.push('/main');
    return;
  }
  if (!run.data.combat) {
    startCombat(monster.value);
  }
});

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
function cardBorder(c: Card): string { return rankColors[c.rank] ?? '#a4a4b0'; }
/** 표시·판정용 실효 비용 — 몬스터 비용 교란(cost-up) + 나방 가속(hand-cost-down) 반영. */
function displayCost(c: Card): number {
  const up = combat.value?.costUp?.amount ?? 0;
  const down = combat.value?.handCostDown ?? 0;
  return Math.max(0, c.cost + up - down);
}
function isLocked(c: Card): boolean {
  return !!(c.instanceId && combat.value?.lockedCardIds?.includes(c.instanceId));
}
function canPlay(c: Card): boolean {
  if (!combat.value) return false;
  if (c.unplayable) return false;          // 일반적 사용불가 플래그(현재 잡카드는 모두 exhaust-self로 *사용 가능*).
  if (isLocked(c)) return false;           // 구속/닻으로 잠김.
  if (combat.value.frozenTurn) return false; // 마비/정지 턴.
  return combat.value.mana >= displayCost(c);
}

// === 구속/삼킴(grapple) + 발버둥 ===
const grapple = computed(() => combat.value?.grapple);
// 손패 절반(올림) 은폐 — obscuredTurns>0이면 *맨 앞* ceil(N/2)장을 뒷면 처리. 0이면 미은폐.
const obscuredCount = computed(() => {
  if ((combat.value?.obscuredTurns ?? 0) <= 0) return 0;
  return Math.ceil((combat.value?.hand.length ?? 0) / 2);
});
/**
 * 이번 적 턴 의도 목록 — 멀티액션이면 여러 개. 동적 의도(resolveIntent)로 *현재 상태* 기준 해석 +
 * preview 라벨러로 *최종 수치 (힘/약화/취약/유령화/받는피해 배수 전부 반영된 들어갈 데미지)* 표시.
 */
/** 카오스 hidden-intent — 적이 다음에 무엇을 할지 *전부 마스킹*(라벨/툴팁 모두 ?). */
const intentHidden = computed(() => isHiddenIntent());
const enemyIntentList = computed<{ raw: string; label: string }[]>(() => {
  const c = combat.value;
  if (!c) return [];
  const arr = (c.enemyIntentQueue && c.enemyIntentQueue.length > 0)
    ? c.enemyIntentQueue
    : (c.enemyIntent ? [c.enemyIntent] : []);
  if (intentHidden.value) {
    // 안개에 가려 행동 수·종류·수치 전부 비공개 — 슬롯 1개로 통일해 "?" 1개만 표시.
    return [{ raw: '?', label: '?' }];
  }
  return arr.map((it) => ({ raw: resolveIntent(it, c), label: previewIntentLabel(it, c) }));
});
/** 의도 툴팁 — hidden일 땐 안내 문구, 아니면 기존 intentDescription. */
function intentTooltip(raw: string): string {
  if (intentHidden.value) return '안개에 가려 적이 무엇을 할지 보이지 않는다.';
  return intentDescription(raw);
}
/**
 * 락(조준형) 배지 — 플레이어 측 다중 락. 과녁 비주얼 + 이름 + 조건 + 진행도.
 * 적이 lockin 행동으로 걸면 c.locks[]에 쌓이고, 조건을 채우면 사라진다.
 */
const locks = computed(() => combat.value?.locks ?? []);
/**
 * 레거시 락인(전역 단일 락) — lockin 행동을 *안 쓰는* 옛 몹(c.lockIn>0 + 새 락 0개) 전용 표시.
 * 그 턴 방어 ≥ lockIn이면 적 특수가 약공격으로 교체된다.
 */
const legacyLockIn = computed<{ value: number; unlocked: boolean } | null>(() => {
  const c = combat.value;
  if (!c || (c.lockIn ?? 0) <= 0) return null;
  if ((c.locks?.length ?? 0) > 0) return null; // 신규 락이 있으면 레거시 배지 숨김.
  const raw = (c.enemyIntentQueue && c.enemyIntentQueue.length > 0)
    ? c.enemyIntentQueue
    : (c.enemyIntent ? [c.enemyIntent] : []);
  if (!raw.some((it) => it.includes('~unlocked='))) return null;
  return { value: c.lockIn ?? 0, unlocked: (c.player.block ?? 0) >= (c.lockIn ?? 0) };
});
// 강 구속/삼킴(grapple.hard)은 색상 미니게임으로만 발버둥. 일반 구속은 기존 버튼 발버둥.
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

// === PC 키보드 전용 입력(작업 31) ===
// 막아야 하는 상황: 전투 페이즈가 아님 · 적 행동 중 · 카드 애니메이션 중 · 미니게임 모달 오픈.
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

// === 전투 포션 (combat=true) — 턴당 1회, 마나 무관 ===
const combatPotions = computed<Item[]>(() => run.data.items.filter((i) => i.combat));
const potionUsed = computed(() => combat.value?.potionUsedThisTurn ?? false);
function potionEffShort(e: Item['effects'][number]): string {
  switch (e.kind) {
    case 'heal': return `HP +${e.value ?? 0}`;
    case 'combat-mana': return `마나 +${e.value ?? 0}`;
    case 'combat-draw': return `드로우 ${e.value ?? 0}`;
    case 'combat-block': return `방어 +${e.value ?? 0}`;
    case 'combat-enemy-status': return `적 ${statusLabel(String(e.param ?? ''))} +${e.value ?? 0}`;
    case 'combat-self-status': return `${statusLabel(String(e.param ?? ''))} +${e.value ?? 0}`;
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

// === 동료 액티브 스킬 (Item 37-② Stage A) — 발버둥·포션 옆 ≤3 버튼 ===
const skillSlots = computed(() => activeSkillSlots());
function useSkillSlot(slot: number) {
  // 적 행동/카드 애니메이션 중 차단(카드 사용과 동일 가드).
  if (enemyActing.value || playingIndex.value !== null) return;
  const result = useSkill(slot);
  if (result.enemyDefeated) onVictory();
}

// 목숨 표기(=하트)는 화면 상단 HUD에서만 노출 — 전투 내부에서는 제거(사용자 요구).
// loseLife/flee 패배 분기는 store API로 직접 호출되므로 여기 ref가 필요 없다.

// === 변신(체인지/TSF) ===
const transform = computed(() => run.data.transform);
const formName = computed(() => data.races.get(run.data.transform?.formRaceId ?? '')?.name ?? '변신');
/** 변신 해제 스택 (Item 28) — '본모습' 카드 -2, 0 이하에서 원복. 구세이브 폴백 5. */
const releaseStack = computed(() => run.data.transform?.releaseStack ?? 5);

/**
 * 카드 effect *최종 표시 수치* — 컬러 보너스·상태 보너스(strength/dex/frail/sap/focus)·유물 modifier +
 * (damage면) weakness/brainwash/imprint/possession/ghost(자기) ×배수와 vulnerable/ghost(적) ×배수까지
 * 다 적용된 *integer*. "카드에 적힌 수치 = 실제 들어가는 수치" 원칙(사용자 사양 #6).
 */
function finalValue(card: Card, eff: CardEffect): number {
  return previewCardEffectValue(card, eff, combat.value);
}

// === 버프/디버프 표시 ===
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

// 디버그 토글 — 카오스 시스템 도입 후 제거 가능
const __forceInfMana = false;
void __forceInfMana;
void ui;

/**
 * 모바일 도구함 접이 상태 (#4) — 동료 스킬·전투 포션이 *기본 보임*이지만, 모바일에선 카드 영역을 가려
 * 카드 선택이 불가능해진다(transform-banner/grapple/3중 의도 등이 동시에 떠 있을 때 특히).
 * 모바일에서만 (.tools-fold) 접고, 도구함 버튼으로 펼친다. 데스크톱은 항상 보임.
 */
const toolsOpen = ref(false);
function toggleTools() { toolsOpen.value = !toolsOpen.value; }
</script>

<template>
  <!-- 그림 프로토타입 placeholder — phase에 따라 표정 전환. fixed 위치라 레이아웃 무영향. -->
  <SceneCharacter
    v-if="ui.debug.showPortraits"
    :mood="phase === 'victory' ? 'happy' : phase === 'defeat' ? 'sad' : 'tense'"
  />
  <!-- 전투 진행 -->
  <main v-if="phase === 'combat' && combat" class="combat-view">
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
        <div class="bar bar--hp">
          HP {{ combat.player.hp }} / {{ combat.player.maxHp }}
          <span v-if="combat.player.block > 0" class="block" :class="{ 'block--pulse': fx.playerShield.value }">🛡 {{ combat.player.block }}</span>
        </div>
        <div class="mana">마나 {{ combat.mana }} / {{ combat.maxMana }}</div>
        <!-- 목숨 표기는 화면 상단 HUD에서 *유일하게* 노출 — 전투 내부 중복 표기 제거(사용자 요구). -->
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
        <h3>{{ monster.name }}</h3>
        <div class="bar bar--enemy-hp">
          HP {{ combat.enemy.hp }} / {{ combat.enemy.maxHp }}
          <span v-if="combat.enemy.block > 0" class="block" :class="{ 'block--pulse': fx.enemyShield.value }">🛡 {{ combat.enemy.block }}</span>
        </div>
        <div class="intent">
          <span class="intent__lead">다음: <span class="intent__info">ⓘ</span></span>
          <span v-for="(it, i) in enemyIntentList" :key="i" class="intent__act" v-tooltip="intentTooltip(it.raw)">{{ it.label }}</span>
        </div>
        <!-- 락(조준형) 배지 — 다중 락 각각 과녁 + 이름·조건·진행도 -->
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
        <!-- 레거시 락인(전역 단일 락) — 옛 몹 전용 -->
        <div
          v-else-if="legacyLockIn"
          class="lockin"
          :class="{ 'lockin--open': legacyLockIn.unlocked }"
          v-tooltip="legacyLockIn.unlocked ? '방어를 충분히 쌓아 적의 특수 행동을 막았다. 이번 턴은 약하게 공격한다.' : `이번 턴 방어를 ${legacyLockIn.value} 이상 쌓으면 적의 특수 행동을 약한 공격으로 바꾼다.`"
        >
          {{ legacyLockIn.unlocked ? '🔓 락인 해제' : `🔒 락인 · 방어 ${legacyLockIn.value}` }}
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

    <!--
      모바일 도구함 토글 (#4) — 데스크톱은 .tools-fold 가 항상 펼침. 모바일은 toolsOpen 가 true 일 때만.
      토글 버튼은 모바일에서만 보이며(.tools-toggle), 도구가 있을 때만 노출.
    -->
    <button
      v-if="(skillSlots.length > 0 || combatPotions.length > 0)"
      class="tools-toggle"
      :class="{ 'tools-toggle--open': toolsOpen }"
      :aria-expanded="toolsOpen"
      @click="toggleTools"
    >🛠 도구 ({{ skillSlots.length + combatPotions.length }})</button>

    <div class="tools-fold" :class="{ 'tools-fold--open': toolsOpen }">
      <!-- 동료 스킬 — 발버둥·포션 옆. 쿨다운 0일 때만 발동, 슬롯1은 쿨다운 -1 표식. -->
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
    </div>

    <CombatHand
      :hand="combat.hand"
      :enemy-acting="enemyActing"
      :playing-index="playingIndex"
      :obscured-count="obscuredCount"
      :can-play="canPlay"
      :display-cost="displayCost"
      :card-border="cardBorder"
      :is-locked="isLocked"
      :final-value="finalValue"
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
  </main>

  <!-- 승리 결과 화면 -->
  <main v-else-if="phase === 'victory'" class="result-view result-view--win">
    <h1>승리</h1>
    <p class="result__subject">{{ monster.name }}을(를) 쓰러뜨렸다.</p>

    <section class="rewards">
      <div v-if="drop" class="reward-list">
        <div v-if="drop.gold > 0" class="reward">
          <span class="reward__name">골드</span>
          <span class="reward__value">+{{ drop.gold }}</span>
        </div>
        <div v-if="drop.timeShards > 0" class="reward">
          <span class="reward__name">시간의 조각</span>
          <span class="reward__value">+{{ drop.timeShards }}</span>
        </div>
        <div v-for="c in drop.cards" :key="c.id" class="reward reward--card">
          <span class="reward__name">카드 발견 — {{ c.name }}</span>
          <span class="reward__rank" :style="{ color: cardBorder(c) }">{{ c.rank }}</span>
        </div>
        <p v-if="drop.gold === 0 && drop.timeShards === 0 && drop.cards.length === 0" class="empty">
          남긴 것은 없었다.
        </p>
      </div>
    </section>

    <footer class="result__footer">
      <button class="continue" @click="backToMap">계속 →</button>
    </footer>
  </main>

  <!-- 패배 결과 화면 -->
  <main v-else class="result-view result-view--lose">
    <h1>패배</h1>
    <p class="result__subject">{{ monster.name }}에게 무너졌다.</p>
    <p class="result__note">이 런은 여기서 끝난다. 메타 진행은 기록된다.</p>
    <footer class="result__footer">
      <button class="continue" @click="returnToMain">돌아간다 →</button>
    </footer>
  </main>
</template>

<style scoped>
.combat-view {
  /* flex 컬럼 — hand(.flex:1; overflow-y:auto)가 가변 영역을 차지해 스크롤.
     (과거 grid auto/1fr/auto는 자식이 8개라 1fr이 hand가 아닌 로그에 배정돼 카드 많을 때 겹침.) */
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
}
.hdr {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  background: rgba(0,0,0,0.4);
  border-radius: 8px;
}
.player, .enemy { display: flex; flex-direction: column; gap: 0.3rem; }
.player h3, .enemy h3 { margin: 0; color: #f6e8b8; }
.enemy { text-align: right; }
.enemy h3 { color: #ff8e8e; }
.bar { padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.05); border-radius: 4px; color: #b6b6c4; }
.bar--hp { color: #8effb8; }
.bar--enemy-hp { color: #ff8e8e; }
.block { margin-left: 0.5rem; color: #8eedff; }
.mana { color: #c08eff; font-weight: 600; }
.lives { color: #ffb8c4; font-size: 0.9rem; letter-spacing: -1px; }
.lives__num { letter-spacing: 0; font-weight: 600; }
.intent { color: #ffb88e; font-size: 0.9rem; }
.intent__lead { display: block; }
.intent__act { display: block; padding-left: 0.7rem; }
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
/* 락(조준형) 배지 묶음 — 다중 락 세로 나열, 과녁 비주얼. */
.locks { margin-top: 3px; display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.lockin--target {
  color: #ffd0d0;
  background: rgba(180, 60, 60, 0.3);
  border-color: rgba(255, 130, 130, 0.55);
}
.vs { font-size: 1.4rem; color: #f6e8b8; text-align: center; }
/* 적 행동 중 인디케이터 — 순차 행동 동안 입력이 잠겼음을 알린다. */
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

/* 방금 전 플레이 로그 — 턴 카운터 아래 중앙 정렬. 최신 줄을 밝게. */
.combat-log {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  padding: 0.3rem 0.5rem 0;
  text-align: center;
  min-height: 1.1rem;
}
.combat-log__line {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.3;
  color: #6f6f80;
}
.combat-log__line--latest { color: #e2dcc4; font-weight: 600; }

/* 동료 스킬 벨트 */
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

/* 전투 포션 벨트 */
.potions { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 1rem; flex-wrap: wrap; }
.potions__label { color: #c0b693; font-size: 0.8rem; }
.potion {
  display: flex; flex-direction: column; gap: 0.1rem;
  padding: 0.4rem 0.7rem;
  background: rgba(142, 237, 255, 0.12);
  border: 1px solid rgba(142, 237, 255, 0.4);
  color: #d0f0ff;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}
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

/* 플로팅 숫자 오버레이 — 전투원 영역 위로 절대 위치, 떠오르며 페이드. */
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
.float-num--blocked { color: #8eedff; }
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

/* 버프/디버프 리스트 */
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
/* feral(수화): 공격 ↑ / 방어 불가 — 양날. 주황 강조. */
.status[data-key="feral"] { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
/* ghost(유령화): 받는·주는 피해 절반 — 양날. 연보라(흐려짐). */
.status[data-key="ghost"] { color: #c9b8ff; border-color: rgba(192,142,255,0.45); }
/* 이로운(버프) 상태 (Colorz 18-c): 청록 계열로 "좋은 것"임을 구분. */
.status[data-key="regen"], .status[data-key="haste"], .status[data-key="ward"],
.status[data-key="thorns"], .status[data-key="focus"], .status[data-key="resolve"] {
  color: #8ee9ff; border-color: rgba(142,233,255,0.4);
}

/* === 구속/삼킴 (grapple) + 발버둥 === */
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
  padding: 0.5rem 1.1rem; border-radius: 6px; cursor: pointer; font-weight: 700;
  background: rgba(255,184,108,0.22); border: 1px solid rgba(255,184,108,0.6); color: #ffe2c0;
}
.struggle:hover:not(:disabled) { background: rgba(255,184,108,0.34); }
.struggle:disabled { opacity: 0.4; cursor: not-allowed; }

/* 변신(체인지) 배너 */
.transform-banner {
  margin: 0.4rem 0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem;
  color: #ffd8a8; border: 1px solid rgba(255,184,108,0.55);
  background: linear-gradient(90deg, rgba(255,140,90,0.14), rgba(192,142,255,0.14));
}
.transform-banner strong { color: #ffe8b8; }

.pile-info {
  display: flex; gap: 1.5rem; padding: 0.8rem 1rem;
  background: rgba(0,0,0,0.4); border-radius: 8px; color: #b6b6c4; align-items: center;
  /* footer 압축 금지 — 모바일에서 viewport 부족해도 턴 종료 버튼 가시화(#2 패리티). */
  flex-shrink: 0;
}
.key-hint { margin-left: auto; font-size: 0.74rem; color: #8a8a99; cursor: help; user-select: none; }
.end-turn { margin-left: auto; padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8; border-radius: 6px; cursor: pointer; font-weight: 600; }
/* 힌트가 보이면 그것이 auto 여백을 차지 → 버튼은 작은 간격만. */
.key-hint + .end-turn { margin-left: 0.8rem; }
.end-turn:hover:not(:disabled) { background: rgba(192,142,255,0.3); }
.end-turn:disabled { opacity: 0.4; cursor: not-allowed; }
/* 데스크톱에서만 단축키 힌트 노출 — 모바일/터치는 키보드가 없으니 숨긴다(버튼은 auto로 우측 정렬 유지). */
@media (max-width: 640px) { .key-hint { display: none; } }

/*
  === 모바일 도구함 토글 (#4) ===
  데스크톱은 .tools-fold 가 그냥 평범한 컨테이너(항상 보임), .tools-toggle 은 숨김.
  모바일은 .tools-fold 가 기본 max-height:0 + overflow:hidden 으로 접혀 있고,
  .tools-fold--open 일 때만 펼친다. .tools-toggle 은 모바일에서만 노출.
*/
.tools-toggle { display: none; }
.tools-fold { display: contents; }

@media (max-width: 640px) {
  .tools-toggle {
    display: inline-flex; align-items: center; gap: 0.35rem;
    align-self: flex-end;
    margin: 0.2rem 1rem 0;
    padding: 0.25rem 0.65rem;
    font: inherit; font-size: 0.78rem; font-weight: 600;
    color: #c9c3da;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }
  .tools-toggle--open {
    color: #f6e8b8;
    background: rgba(192, 142, 255, 0.2);
    border-color: rgba(192, 142, 255, 0.5);
  }
  .tools-fold {
    display: flex; flex-direction: column;
    overflow: hidden;
    max-height: 0;
    transition: max-height 180ms ease;
    flex-shrink: 0;
  }
  .tools-fold--open { max-height: 50vh; overflow-y: auto; }
  /* 모바일 압축 — 도구함 내부 패딩/폰트 축소(스킬/포션 한 줄에 더 많이). */
  .tools-fold .skills, .tools-fold .potions { padding: 0.3rem 0.7rem; gap: 0.35rem; }
  .tools-fold .skill, .tools-fold .potion { padding: 0.3rem 0.55rem; }

  /* 상태이상 배지 — 모바일에선 가로폭을 잡아 먹지 않게 더 작게(#4 사용자 보고). */
  .statuses { gap: 0.18rem; margin-top: 0.18rem; }
  .status { font-size: 0.66rem; padding: 0.04rem 0.32rem; border-radius: 8px; }

  /* 의도 — 행동 1줄당 1라인이 아닌 *인라인 wrap* 으로(3중 의도가 3줄을 차지하지 않게). */
  .intent { font-size: 0.78rem; line-height: 1.25; }
  .intent__act { display: inline; padding-left: 0; }
  .intent__act::before { content: ' · '; opacity: 0.5; }
  .intent__act:first-of-type::before { content: ''; }

  /* 변신 배너 / 구속 — 모바일에선 한 줄로 압축. */
  .transform-banner { font-size: 0.78rem; padding: 0.35rem 0.7rem; margin: 0.25rem 0; }
  .grapple { padding: 0.35rem 0.7rem; margin: 0.25rem 0; gap: 0.5rem; }
  .grapple__label { font-size: 0.78rem; gap: 0.35rem; }
  .grapple__gauge, .grapple__ramp { font-size: 0.72rem; }
  .struggle { padding: 0.35rem 0.7rem; font-size: 0.78rem; }

  /* 전투 로그 1줄도 더 작게. */
  .combat-log__line { font-size: 0.72rem; }

  /* HUD/헤더 패딩 압축 — 카드 영역 확보. */
  .hdr { padding: 0.5rem 0.6rem; gap: 0.5rem; }
  .combat-shell { gap: 0.4rem; }
  .pile-info { padding: 0.5rem 0.7rem; gap: 0.8rem; }
  /* combat-view 자체 padding 축소 — 가용 면적 확보. */
  .combat-view { padding: 0.6rem 0.6rem calc(0.6rem + env(safe-area-inset-bottom, 0px)); }
}

/* === 결과 화면 === */
.result-view {
  max-width: 600px;
  margin: 0 auto;
  padding: 4rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  min-height: 100vh; min-height: 100dvh;
}
.result-view h1 {
  font-size: 3rem;
  margin: 0;
}
.result-view--win h1 { color: #8effb8; }
.result-view--lose h1 { color: #ff8e8e; }

.result__subject {
  color: #d6d6e0;
  font-size: 1.1rem;
  margin: 0;
}
.result__note {
  color: #888;
  font-style: italic;
}

.rewards {
  width: 100%;
  max-width: 460px;
  margin-top: 1rem;
}
.reward-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.reward {
  display: flex;
  justify-content: space-between;
  padding: 0.8rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}
.reward__name { color: #d6d6e0; }
.reward__value { color: #ffe88e; font-weight: 600; }
.reward__rank { font-size: 0.8rem; text-transform: uppercase; }
.reward--card { border-color: rgba(142, 237, 255, 0.3); }
.empty { color: #6c6c7c; font-style: italic; margin: 0; }

.result__footer {
  margin-top: auto;
  padding-top: 1rem;
}
.continue {
  padding: 0.8rem 1.6rem;
  background: rgba(192, 142, 255, 0.2);
  border: 1px solid rgba(192, 142, 255, 0.5);
  color: #f6e8b8;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}
.continue:hover { background: rgba(192, 142, 255, 0.3); }
</style>
