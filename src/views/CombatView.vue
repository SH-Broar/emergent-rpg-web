<script setup lang="ts">
/**
 * 전투 화면 — 카드 핸드 + 적 + 턴 진행 + *결과 화면*.
 *
 * 사용자 피드백: 결과를 한 번의 텍스트 타이밍 후 명시적으로 보여줄 것.
 * - 승리 시: 드롭 정보 (골드 / 시간의 조각 / 카드) + '계속' 버튼
 * - 패배 시: 메시지 + '돌아간다' 버튼 → 메타 갱신 후 메인
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import {
  startCombat,
  playCard as playCardSys,
  endPlayerTurn,
  applyMonsterDrop,
  clearCombat,
  type CombatVictoryDrop,
} from '@/systems/combat';
import { effectiveContent } from '@/systems/map';
import type { Card, Monster } from '@/data/schemas';

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

function play(index: number) {
  const result = playCardSys(index, monster.value);
  if (result.enemyDefeated) {
    onVictory();
  }
}

function endTurn() {
  const result = endPlayerTurn(monster.value);
  if (result.playerDefeated) {
    onDefeat();
  }
}

function onVictory() {
  // 드롭 적용 + 클리어 마킹
  drop.value = applyMonsterDrop(monster.value.drop, data.cards);
  run.markCombatCleared(run.data.currentNodeId);
  clearCombat();
  // 히페리온 자동 평가 (combat_clears 등)
  void import('@/systems/hyperion').then(({ evaluateHyperion }) => evaluateHyperion());
  phase.value = 'victory';
}

function onDefeat() {
  clearCombat();
  phase.value = 'defeat';
}

function backToMap() {
  router.push('/game/map');
}

function returnToMain() {
  run.endRun('hp-zero');
  import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
    absorbRunIntoMeta(run.data);
    run.reset();
    router.push('/main');
  });
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
function canPlay(c: Card): boolean {
  if (!combat.value) return false;
  return combat.value.mana >= c.cost;
}

// 디버그 토글 — 카오스 시스템 도입 후 제거 가능
const __forceInfMana = false;
void __forceInfMana;
void ui;
</script>

<template>
  <!-- 전투 진행 -->
  <main v-if="phase === 'combat' && combat" class="combat-view">
    <header class="hdr">
      <div class="player">
        <h3>전생자</h3>
        <div class="bar bar--hp">
          HP {{ combat.player.hp }} / {{ combat.player.maxHp }}
          <span v-if="combat.player.block > 0" class="block">🛡 {{ combat.player.block }}</span>
        </div>
        <div class="mana">마나 {{ combat.mana }} / {{ combat.maxMana }}</div>
      </div>

      <div class="vs">⚔ 턴 {{ combat.turn }}</div>

      <div class="enemy">
        <h3>{{ monster.name }}</h3>
        <div class="bar bar--enemy-hp">
          HP {{ combat.enemy.hp }} / {{ combat.enemy.maxHp }}
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
          <span class="card__rank" :style="{ color: cardBorder(card) }">{{ card.rank }}</span>
        </div>
        <div class="card__effects">
          <span v-for="(e, ei) in card.effects" :key="ei" class="effect">
            {{ e.kind }} {{ e.value ?? '' }} {{ e.target ?? '' }}
          </span>
        </div>
        <p v-if="card.flavor" class="card__flavor">{{ card.flavor }}</p>
      </div>
    </section>

    <footer class="pile-info">
      <div>드로우 {{ combat.drawPile.length }}</div>
      <div>버림 {{ combat.discardPile.length }}</div>
      <button class="end-turn" @click="endTurn">턴 종료 →</button>
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

.hand { display: flex; gap: 0.8rem; padding: 1rem; overflow-x: auto; align-items: stretch; }
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

/* === 결과 화면 === */
.result-view {
  max-width: 600px;
  margin: 0 auto;
  padding: 4rem 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.2rem;
  min-height: 100vh;
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
