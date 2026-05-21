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
  endPlayerTurn,
  clearCombat,
  struggle,
  statusBonusForCardEffectKind,
} from '@/systems/combat';
import { applyBossRewards } from '@/systems/boss-rewards';
import { colorBonusForCardEffectKind } from '@/systems/stats';
import { bonusesFromEffective } from '@/systems/equipment';
import { cardEffectKindLabel, cardEffectDescription, effectTargetLabel, statusDescription, intentLabel, intentDescription, unlockKeyLabel } from '@/systems/labels';
import { useItem } from '@/systems/item';
import { useCombatFx, CARD_PLAY_DELAY } from '@/composables/useCombatFx';
import type { Boss, BossPhase, BossSignatureVariant, Card, CardEffect, Combatant, Item, Monster } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

type Phase = 'intro' | 'combat' | 'victory' | 'defeat';
const phase = ref<Phase>('intro');

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const boss = computed<Boss | undefined>(() => {
  // 디버그 전투 오버라이드 — 설정 시 연표 보스 대신 지정 보스.
  const dbgId = ui.debugBattle.bossId;
  if (dbgId) {
    const dbgBoss = data.bosses.get(dbgId);
    if (dbgBoss) return dbgBoss;
  }
  const id = timeline.value?.bossId;
  return id ? data.bosses.get(id) : undefined;
});

const combat = computed(() => run.data.combat);

// 방금 전 플레이 내용 — 턴 카운터 아래 중앙에 로그처럼 표시(최근 4줄).
const recentLog = computed<string[]>(() => (combat.value?.log ?? []).slice(-4));

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
  ui.toast('warning', `보스가 *${newIdx + 1}단계*로 자세를 바꾼다`);
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

function play(index: number) {
  // 애니메이션 중 중복 입력 차단.
  if (playingIndex.value !== null) return;
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
  const result = endPlayerTurn(bossAsMonster.value);
  if (result.playerDefeated) {
    onDefeat();
  } else if (result.enemyDefeated) {
    // 보스가 poison 등으로 턴 종료 중 사망 — 승리 처리.
    onVictory();
  }
}

function onVictory() {
  if (!boss.value) return;
  // r4 + 컬러/재료 phase: applyBossRewards가 *bossesCleared 미포함 시*에만 희소 재료 + 권역 컬러 부스트를 발사하므로,
  // bossesCleared.push *이전*에 호출해야 한다.
  applyBossRewards(boss.value);
  run.data.bossesCleared.push(boss.value.id);
  clearCombat();
  phase.value = 'victory';
}

function onDefeat() {
  clearCombat();
  phase.value = 'defeat';
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
function doStruggle() {
  struggle();
}
const transform = computed(() => run.data.transform);
const formName = computed(() => data.races.get(run.data.transform?.formRaceId ?? '')?.name ?? '변신');

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
    default: return e.kind;
  }
}
function potionSummary(itm: Item): string {
  return itm.effects.map(potionEffShort).join(' · ');
}
function usePotion(itm: Item) {
  if (potionUsed.value) return;
  useItem(itm);
}
</script>

<template>
  <main v-if="boss" class="boss-view">
    <!-- Intro -->
    <section v-if="phase === 'intro'" class="intro">
      <h1>{{ boss.name }}</h1>
      <p class="lore">{{ boss.description }}</p>
      <div v-if="boss.introText" class="intro__text">{{ boss.introText }}</div>
      <button class="begin" @click="startBattle">싸움을 시작한다 →</button>
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
          <ul class="statuses">
            <li v-for="s in statusEntries(combat.player)" :key="s.key" class="status" :data-key="s.key" v-tooltip="statusDescription(s.key)">
              {{ s.label }} ×{{ s.count }}
            </li>
          </ul>
        </div>
        <div class="vs">⚔ 턴 {{ combat.turn }}</div>
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
          <div class="intent" v-tooltip="intentDescription(combat.enemyIntent)">다음: {{ intentLabel(combat.enemyIntent) }} <span class="intent__info">ⓘ</span></div>
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

      <!-- 변신(체인지) — 본모습 카드로 해제. 해제 안 하고 이기면 런에 지속 -->
      <div v-if="transform" class="transform-banner">
        🦊 변신 중 — <strong>{{ formName }}</strong> · '본모습' 카드로 해제 (안 풀고 이기면 계속 이 모습)
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
          :disabled="combat.frozenTurn || combat.struggledThisTurn || combat.mana < 1"
          @click="doStruggle"
        >
          발버둥 (마나 1)
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
          v-tooltip="potionSummary(it)"
          @click="usePotion(it)"
        >
          <span class="potion__name">{{ it.name }}</span>
          <span class="potion__eff">{{ potionSummary(it) }}</span>
        </button>
      </div>

      <section class="hand">
        <!-- 은폐(obscure) 시 카드 뒷면 — 무엇인지 모른 채 위치로만 사용 가능 -->
        <template v-if="obscured">
          <div
            v-for="(card, i) in combat.hand"
            :key="`fd-${card.instanceId ?? card.id}-${i}`"
            class="card card--facedown"
            :class="{ 'card--disabled': !canPlay(card), 'card--playing': playingIndex === i }"
            @click="playingIndex === null && canPlay(card) && play(i)"
          >
            <div class="facedown__mark">?</div>
            <div class="facedown__note">가려진 카드</div>
          </div>
        </template>

        <template v-else>
        <div
          v-for="(card, i) in combat.hand"
          :key="`${card.instanceId ?? card.id}-${i}`"
          class="card"
          :class="{ 'card--disabled': !canPlay(card), 'card--locked': isLocked(card), 'card--junk': card.unplayable, 'card--playing': playingIndex === i }"
          :style="{ borderColor: cardBorder(card) }"
          @click="playingIndex === null && canPlay(card) && play(i)"
        >
          <div class="card__head">
            <span class="card__cost" :class="{ 'card__cost--up': displayCost(card) > card.cost }">{{ displayCost(card) }}</span>
            <span class="card__name">{{ card.name }}</span>
            <span v-if="isLocked(card)" class="card__lock" title="묶여서 쓸 수 없다">🔒</span>
            <span v-else class="card__rank" :style="{ color: cardBorder(card) }">{{ card.rank }}</span>
          </div>
          <div class="card__effects">
            <span v-for="(e, ei) in card.effects" :key="ei" class="effect" v-tooltip="cardEffectDescription(e)">
              <span class="effect__label">{{ cardEffectKindLabel(e) }}</span>
              <strong class="eff-val">{{ effectiveValue(e) || (e.value ?? '') }}</strong>
              <span
                v-if="statusDelta(e) !== 0"
                class="eff-delta"
                :class="statusDelta(e) > 0 ? 'eff-delta--up' : 'eff-delta--down'"
              >
                ({{ statusDelta(e) > 0 ? '+' : '' }}{{ statusDelta(e) }})
              </span>
              <span v-if="e.target" class="eff-target">{{ effectTargetLabel(e.target) }}</span>
            </span>
          </div>
        </div>
        </template>
      </section>

      <footer class="pile-info">
        <div>드로우 {{ combat.drawPile.length }}</div>
        <div>버림 {{ combat.discardPile.length }}</div>
        <button class="end-turn" @click="endTurn">턴 종료 →</button>
      </footer>
    </section>

    <!-- Victory -->
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

    <!-- Defeat -->
    <section v-else class="result result--lose">
      <h1>패배</h1>
      <p class="result__subject">{{ boss.name }}에게 무너졌다.</p>
      <p class="result__note">이 런은 끝났지만, 메타 진행은 기록된다.</p>
      <button class="finish" @click="finishRun('boss-defeated')">귀환 →</button>
    </section>
  </main>
</template>

<style scoped>
.boss-view { min-height: 100vh; padding: 2rem; display: flex; flex-direction: column; }
.intro { max-width: 700px; margin: 4rem auto; text-align: center; }
.intro h1 { font-size: 3rem; color: #ffe88e; }
.lore { color: #b6b6c4; margin: 1rem 0; }
.intro__text { padding: 1.2rem; background: rgba(0,0,0,0.5); border-left: 3px solid #ffe88e; border-radius: 4px; color: #d6d6e0; margin: 2rem 0; font-style: italic; }
.begin { padding: 0.8rem 1.5rem; background: rgba(255,232,142,0.2); border: 1px solid rgba(255,232,142,0.5); color: #ffe88e; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }

.combat-shell { display: grid; grid-template-rows: auto 1fr auto; gap: 1rem; flex: 1; }
.hdr { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center; padding: 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; }
.player, .enemy { display: flex; flex-direction: column; gap: 0.3rem; }
.enemy { text-align: right; }
.enemy h3 { color: #ffe88e; margin: 0; }
.player h3 { color: #f6e8b8; margin: 0; }
.bar { padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.05); border-radius: 4px; }
.bar--boss { background: rgba(255,232,142,0.15); }
.block { margin-left: 0.5rem; color: #8eedff; }
.mana { color: #c08eff; font-weight: 600; }
.intent { color: #ffb88e; font-size: 0.9rem; }
.vs { font-size: 1.4rem; color: #f6e8b8; }

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
/* 전투 포션 벨트 */
.potions { display: flex; gap: 0.5rem; align-items: center; padding: 0.4rem 1rem; flex-wrap: wrap; }
.potions__label { color: #c0b693; font-size: 0.8rem; }
.potion { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.4rem 0.7rem; background: rgba(142, 237, 255, 0.12); border: 1px solid rgba(142, 237, 255, 0.4); color: #d0f0ff; border-radius: 6px; cursor: pointer; font: inherit; text-align: left; }
.potion:hover:not(.potion--disabled) { background: rgba(142, 237, 255, 0.24); }
.potion--disabled { opacity: 0.35; cursor: not-allowed; }
.potion__name { font-weight: 600; font-size: 0.85rem; color: #f6e8b8; }
.potion__eff { font-size: 0.72rem; color: #b6d8e0; }

/* === 손패 — 트럼프 카드 비율(5:7). 가로·세로 2배, 여러 줄 (CombatView와 동일) === */
.hand {
  --card-w: clamp(92px, 24vw, 200px); /* 이전 대비 약 2배 */
  --card-h: calc(var(--card-w) * 1.4); /* 5:7 ≈ ×1.4 */
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  padding: 0.8rem 1rem 1.4rem;
  align-items: flex-start;
  align-content: flex-start;
  justify-content: center;
  overflow-x: hidden;
  overflow-y: auto;
  flex: 1;
  min-height: calc(var(--card-h) + 1.2rem);
  scrollbar-width: thin;
}
.card {
  flex-shrink: 0;
  width: var(--card-w);
  height: var(--card-h);
  padding: 0.5rem;
  background: rgba(255,255,255,0.04);
  border: 2px solid;
  border-radius: 10px;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow: hidden;
}
.card:hover:not(.card--disabled) {
  transform: translateY(-10px) scale(1.06);
  background: rgba(255,255,255,0.08);
  box-shadow: 0 8px 22px rgba(0,0,0,0.5);
  z-index: 5;
}
.card--disabled { opacity: 0.4; cursor: not-allowed; }
.card__head { display: flex; align-items: center; gap: 0.3rem; min-height: 1.6rem; }
.card__cost {
  flex-shrink: 0;
  background: #c08eff; color: #0d0e14;
  width: 1.6rem; height: 1.6rem;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%; font-weight: 700; font-size: 0.95rem;
}
.card__name {
  flex: 1; color: #f6e8b8; font-weight: 600; font-size: 0.9rem; line-height: 1.18;
  overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical;
}
.card__rank { display: none; } /* 테두리 색으로 등급 표현 */
.card__effects { display: flex; flex-wrap: wrap; gap: 0.25rem; font-size: 0.82rem; align-content: flex-start; flex: 1; overflow: hidden; }
.effect { background: rgba(0,0,0,0.4); padding: 0.15rem 0.42rem; border-radius: 5px; color: #b6b6c4; display: inline-flex; gap: 0.18rem; align-items: baseline; max-width: 100%; }
.effect__label { white-space: normal; }
.eff-val { color: #f6e8b8; font-weight: 700; }
.eff-delta { font-size: 0.85em; font-weight: 700; }
.eff-delta--up { color: #8effb8; }
.eff-delta--down { color: #ff8e8e; }
.eff-target { color: #888; }

/* === 카드 사용 애니메이션: 번쩍(글로우/스케일업) → 위로 날아가며 페이드 === */
.card--playing {
  pointer-events: none;
  animation: card-play 260ms ease-in forwards;
  z-index: 20;
}
@keyframes card-play {
  0%   { transform: translateY(0) scale(1); filter: brightness(1); box-shadow: 0 0 0 rgba(246,232,184,0); }
  35%  { transform: translateY(-18px) scale(1.18); filter: brightness(2.2); box-shadow: 0 0 26px rgba(246,232,184,0.9); }
  100% { transform: translateY(-90px) scale(0.7); filter: brightness(1.4); opacity: 0; }
}

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

/* 모션 감소 선호 — 흔들림/이동 최소화, 정보는 유지. */
@media (prefers-reduced-motion: reduce) {
  .card--playing { animation: none; opacity: 0; }
  .is-hit { animation: none; }
  .enemy.is-hit::after, .player.is-hit::after { animation: none; opacity: 0; }
  .block--pulse { animation: none; }
  .float-num { animation: float-up-reduced 700ms ease-out forwards; }
  .card:hover:not(.card--disabled) { transform: translateY(-4px); }
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

/* 잠긴 카드 / 잡카드 / 비용 상승 / 뒷면 (CombatView와 동일) */
.card--locked { border-style: dashed !important; }
.card__lock { font-size: 0.7rem; }
.card--junk { background: rgba(120,90,90,0.18); }
.card__cost--up { background: #ff8e8e; color: #160d0d; }
.card--facedown {
  align-items: center; justify-content: center; text-align: center;
  border-color: #555 !important; background: repeating-linear-gradient(45deg, rgba(255,255,255,0.03), rgba(255,255,255,0.03) 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 16px);
}
.facedown__mark { font-size: 1.6rem; color: #8a8a99; font-weight: 800; }
.facedown__note { font-size: 0.6rem; color: #6c6c7c; }

/* 변신(체인지) 배너 (CombatView와 동일) */
.transform-banner {
  margin: 0.4rem 0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem;
  color: #ffd8a8; border: 1px solid rgba(255,184,108,0.55);
  background: linear-gradient(90deg, rgba(255,140,90,0.14), rgba(192,142,255,0.14));
}
.transform-banner strong { color: #ffe8b8; }

.pile-info { display: flex; gap: 1.5rem; padding: 0.8rem 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; color: #b6b6c4; align-items: center; }
.end-turn { margin-left: auto; padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }

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
