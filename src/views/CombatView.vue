<script setup lang="ts">
/**
 * 전투 화면 — 카드 핸드 + 적 + 턴 진행.
 *
 * MVR: 단일 적, 5장 핸드, 턴제. 카드 클릭으로 사용.
 */

import { computed, onMounted } from 'vue';
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

// MVR: 노드의 enemyGroupId를 기반으로 적 생성. 단순화: 그림자 강아지 1마리.
const enemy = computed(() => {
  const node = data.nodeMaps
    .get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '')
    ?.nodes.find((n: { id: string; kind: string }) => n.id === run.data.currentNodeId);
  const isElite = node?.kind === 'elite';
  return {
    name: isElite ? '큰 그림자 늑대' : '그림자 강아지',
    hp: isElite ? 30 : 14,
    intents: ['attack:5', 'attack:5', 'defend:4'],
  };
});

const combat = computed(() => run.data.combat);

function play(index: number) {
  playCardSys(index, enemy.value);
  // 적 사망 시 combat이 undefined → 클리어 마킹 + 맵 복귀
  if (!run.data.combat) {
    run.markCombatCleared(run.data.currentNodeId);
    setTimeout(() => router.push('/game/map'), 500);
  }
}

function endTurn() {
  endPlayerTurn(enemy.value);
  if (!run.active) {
    // 패배 — 메타 갱신 후 메인으로
    import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
      absorbRunIntoMeta(run.data);
      run.reset();
      router.push('/main');
    });
  }
}

onMounted(() => {
  if (!run.active) {
    router.push('/main');
    return;
  }
  if (!run.data.combat) {
    startCombat(enemy.value);
  }
});

const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};

function cardBorder(c: Card): string {
  return rankColors[c.rank] ?? '#a4a4b0';
}

function canPlay(c: Card): boolean {
  if (!combat.value) return false;
  return ui.debug.infiniteMana || combat.value.mana >= c.cost;
}
</script>

<template>
  <main v-if="combat" class="combat-view">
    <header class="hdr">
      <div class="player">
        <h3>전생자</h3>
        <div class="bar bar--hp">
          HP {{ combat.player.hp }} / {{ combat.player.maxHp }}
          <span v-if="combat.player.block > 0" class="block">🛡 {{ combat.player.block }}</span>
        </div>
        <div class="mana">마나: {{ combat.mana }} / {{ combat.maxMana }}</div>
      </div>

      <div class="vs">⚔ 턴 {{ combat.turn }}</div>

      <div class="enemy">
        <h3>{{ enemy.name }}</h3>
        <div class="bar bar--enemy-hp">
          HP {{ combat.enemy.hp }} / {{ combat.enemy.maxHp }}
          <span v-if="combat.enemy.block > 0" class="block">🛡 {{ combat.enemy.block }}</span>
        </div>
        <div class="intent">다음 행동: {{ combat.enemyIntent }}</div>
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
          <span class="card__rank" :style="{ color: cardBorder(card) }">{{ card.rank }}</span>
        </div>
        <div class="card__effects">
          <span v-for="(e, ei) in card.effects" :key="ei" class="effect">
            {{ e.kind }} {{ e.value ?? '' }} {{ e.target ?? '' }}
          </span>
        </div>
        <p class="card__flavor">{{ card.flavor }}</p>
      </div>
    </section>

    <footer class="pile-info">
      <div>드로우 {{ combat.drawPile.length }}</div>
      <div>버림 {{ combat.discardPile.length }}</div>
      <button class="end-turn" @click="endTurn">턴 종료 →</button>
    </footer>
  </main>
  <main v-else class="combat-view"><p>전투를 시작합니다…</p></main>
</template>

<style scoped>
.combat-view {
  display: grid;
  grid-template-rows: auto 1fr auto;
  height: 100vh;
  padding: 1rem;
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
.intent { color: #ffb88e; font-size: 0.9rem; }
.vs { font-size: 1.4rem; color: #f6e8b8; text-align: center; }

.hand {
  display: flex;
  gap: 0.8rem;
  padding: 1rem;
  overflow-x: auto;
  align-items: stretch;
}
.card {
  flex-shrink: 0;
  width: 180px;
  padding: 0.8rem;
  background: rgba(255,255,255,0.04);
  border: 2px solid;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.card:hover:not(.card--disabled) { transform: translateY(-6px); background: rgba(255,255,255,0.08); }
.card--disabled { opacity: 0.4; cursor: not-allowed; }
.card__head { display: flex; align-items: center; gap: 0.4rem; }
.card__cost { background: #c08eff; color: #0d0e14; padding: 0.2rem 0.5rem; border-radius: 50%; font-weight: 700; font-size: 0.85rem; }
.card__name { flex: 1; color: #f6e8b8; font-weight: 600; }
.card__rank { font-size: 0.7rem; text-transform: uppercase; }
.card__effects { display: flex; flex-wrap: wrap; gap: 0.3rem; font-size: 0.8rem; }
.effect { background: rgba(0,0,0,0.4); padding: 0.2rem 0.5rem; border-radius: 4px; color: #b6b6c4; }
.card__flavor { font-size: 0.75rem; color: #6c6c7c; font-style: italic; margin: 0; }

.pile-info { display: flex; gap: 1.5rem; padding: 0.8rem 1rem; background: rgba(0,0,0,0.4); border-radius: 8px; color: #b6b6c4; align-items: center; }
.end-turn { margin-left: auto; padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: #f6e8b8; border-radius: 6px; cursor: pointer; font-weight: 600; }
.end-turn:hover { background: rgba(192,142,255,0.3); }
</style>
