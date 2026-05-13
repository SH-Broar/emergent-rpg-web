<script setup lang="ts">
/**
 * 보스전 화면 — CombatView의 변형 (보스 데이터 + intro/defeat 텍스트).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { startCombat, playCard as playCardSys, endPlayerTurn } from '@/systems/combat';
import type { Card } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const phase = ref<'intro' | 'combat' | 'victory' | 'defeat'>('intro');

const timeline = computed(() => data.timelines.get(run.data.timelineId));
const boss = computed(() => {
  const id = timeline.value?.bossId;
  return id ? data.bosses.get(id) : undefined;
});

const enemySeed = computed(() => {
  const b = boss.value;
  if (!b) return { name: '???', hp: 50, intents: ['attack:5'] };
  const firstPhase = b.phases[0];
  const intents = firstPhase?.intents.map((i: { kind: string; value?: number }) => `${i.kind}:${i.value ?? 0}`) ?? ['attack:5'];
  return { name: b.name, hp: b.hp, intents };
});

const combat = computed(() => run.data.combat);

function startBattle() {
  startCombat(enemySeed.value);
  phase.value = 'combat';
}

function play(index: number) {
  playCardSys(index, enemySeed.value);
  if (!run.data.combat) {
    onVictory();
  }
}

function endTurn() {
  endPlayerTurn(enemySeed.value);
  if (!run.active) {
    onDefeat();
  }
}

function onVictory() {
  if (!boss.value) return;
  // 보스 클리어 기록
  run.data.bossesCleared.push(boss.value.id);
  // 보상
  run.data.gold += 20;
  if (boss.value.rewards.soulGain) {
    // soul은 메타에서 처리되므로 run에는 표시만
  }
  phase.value = 'victory';
}

function onDefeat() {
  phase.value = 'defeat';
}

function finishRun(reason: 'boss-cleared' | 'boss-defeated') {
  run.endRun(reason);
  import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
    absorbRunIntoMeta(run.data);
    run.reset();
    router.push('/main');
  });
}

onMounted(() => {
  if (!run.active || !boss.value) {
    ui.toast('warning', '보스 데이터를 찾을 수 없습니다.');
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
function canPlay(c: Card): boolean {
  if (!combat.value) return false;
  return ui.debug.infiniteMana || combat.value.mana >= c.cost;
}
</script>

<template>
  <main v-if="boss" class="boss-view">
    <!-- Intro -->
    <section v-if="phase === 'intro'" class="intro">
      <h1>{{ boss.name }}</h1>
      <p class="lore">{{ boss.description }}</p>
      <div class="intro__text">{{ boss.introText }}</div>
      <button class="begin" @click="startBattle">싸움을 시작한다 →</button>
    </section>

    <!-- Combat (CombatView와 거의 동일) -->
    <section v-else-if="phase === 'combat' && combat" class="combat-shell">
      <header class="hdr">
        <div class="player">
          <h3>전생자</h3>
          <div class="bar">HP {{ combat.player.hp }} / {{ combat.player.maxHp }}
            <span v-if="combat.player.block > 0" class="block">🛡 {{ combat.player.block }}</span>
          </div>
          <div class="mana">마나: {{ combat.mana }} / {{ combat.maxMana }}</div>
        </div>
        <div class="vs">⚔ 턴 {{ combat.turn }}</div>
        <div class="enemy">
          <h3>{{ boss.name }}</h3>
          <div class="bar bar--boss">HP {{ combat.enemy.hp }} / {{ combat.enemy.maxHp }}
            <span v-if="combat.enemy.block > 0" class="block">🛡 {{ combat.enemy.block }}</span>
          </div>
          <div class="intent">다음: {{ combat.enemyIntent }}</div>
        </div>
      </header>

      <section class="hand">
        <div
          v-for="(card, i) in combat.hand"
          :key="`${card.id}-${i}`"
          class="card"
          :class="{ 'card--disabled': !canPlay(card) }"
          :style="{ borderColor: cardBorder(card) }"
          @click="canPlay(card) && play(i)"
        >
          <div class="card__head">
            <span class="card__cost">{{ card.cost }}</span>
            <span class="card__name">{{ card.name }}</span>
          </div>
          <div class="card__effects">
            <span v-for="(e, ei) in card.effects" :key="ei" class="effect">
              {{ e.kind }} {{ e.value ?? '' }}
            </span>
          </div>
        </div>
      </section>

      <footer class="pile-info">
        <div>드로우 {{ combat.drawPile.length }}</div>
        <div>버림 {{ combat.discardPile.length }}</div>
        <button class="end-turn" @click="endTurn">턴 종료 →</button>
      </footer>
    </section>

    <!-- Victory -->
    <section v-else-if="phase === 'victory'" class="end-screen end-screen--win">
      <h1>승리</h1>
      <p>{{ boss.defeatText }}</p>
      <button class="finish" @click="finishRun('boss-cleared')">귀환 →</button>
    </section>

    <!-- Defeat -->
    <section v-else class="end-screen end-screen--lose">
      <h1>{{ boss.name }}에게 패배했다…</h1>
      <p>임페리시아: "괜찮습니다. 그분은 다시 부르실 겁니다."</p>
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
.begin { padding: 0.8rem 1.5rem; background: rgba(255,232,142,0.2); border: 1px solid rgba(255,232,142,0.5); color: #ffe88e; border-radius: 6px; cursor: pointer; font-weight: 600; }

.combat-shell { display: grid; grid-template-rows: auto 1fr auto; gap: 1rem; flex: 1; }
.hdr { display: grid; grid-template-columns: 1fr auto 1fr; gap: 1rem; align-items: center; padding: 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; }
.player, .enemy { display: flex; flex-direction: column; gap: 0.3rem; }
.enemy { text-align: right; }
.enemy h3 { color: #ffe88e; }
.player h3 { color: #f6e8b8; }
.bar { padding: 0.4rem 0.6rem; background: rgba(255,255,255,0.05); border-radius: 4px; }
.bar--boss { background: rgba(255,232,142,0.15); }
.block { margin-left: 0.5rem; color: #8eedff; }
.mana { color: #c08eff; font-weight: 600; }
.intent { color: #ffb88e; font-size: 0.9rem; }
.vs { font-size: 1.4rem; color: #f6e8b8; }
.hand { display: flex; gap: 0.8rem; padding: 1rem; overflow-x: auto; }
.card { flex-shrink: 0; width: 160px; padding: 0.8rem; background: rgba(255,255,255,0.04); border: 2px solid; border-radius: 8px; cursor: pointer; transition: transform 120ms ease; display: flex; flex-direction: column; gap: 0.3rem; }
.card:hover:not(.card--disabled) { transform: translateY(-6px); }
.card--disabled { opacity: 0.4; cursor: not-allowed; }
.card__head { display: flex; align-items: center; gap: 0.4rem; }
.card__cost { background: #c08eff; color: #0d0e14; padding: 0.2rem 0.5rem; border-radius: 50%; font-weight: 700; }
.card__name { flex: 1; color: #f6e8b8; font-weight: 600; font-size: 0.95rem; }
.card__effects { display: flex; flex-wrap: wrap; gap: 0.2rem; font-size: 0.75rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 4px; color: #b6b6c4; }
.pile-info { display: flex; gap: 1.5rem; padding: 0.8rem 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; color: #b6b6c4; align-items: center; }
.end-turn { margin-left: auto; padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8; border-radius: 6px; cursor: pointer; font-weight: 600; }

.end-screen { max-width: 700px; margin: 4rem auto; text-align: center; }
.end-screen--win h1 { color: #8effb8; font-size: 3rem; }
.end-screen--lose h1 { color: #ff8e8e; }
.end-screen p { color: #b6b6c4; margin: 1.5rem 0; font-style: italic; }
.finish { padding: 0.8rem 1.5rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; }
</style>
