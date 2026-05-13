<script setup lang="ts">
/**
 * 캐릭터 선택 — 플레이버 제거, 정보 위주.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { canSelectCharacter } from '@/frame/Mono';
import type { Character, Season } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();

const timeline = computed(() => {
  const id = ui.pendingRunSetup.timelineId;
  return id ? data.timelines.get(id) : undefined;
});

const characters = computed<Character[]>(() => {
  const tl = timeline.value;
  if (!tl) return [];
  return tl.availableCharacterIds
    .map((cid: string) => data.characters.get(cid))
    .filter((c: Character | undefined): c is Character => c !== undefined);
});

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter', 'monsoon', 'twilight'];
function randomSeason(): Season {
  return SEASONS[Math.floor(Math.random() * SEASONS.length)];
}

function selectCharacter(c: Character) {
  if (!canSelectCharacter(c.id)) {
    ui.toast('warning', '잠긴 캐릭터입니다.');
    return;
  }
  const tl = timeline.value;
  if (!tl) {
    ui.toast('error', '시간대가 선택되지 않았습니다.');
    return;
  }

  const map = data.nodeMaps.get(tl.nodeMapId);
  if (!map) {
    ui.toast('error', `노드 맵 누락: ${tl.nodeMapId}`);
    return;
  }

  const race = data.races.get(c.raceId);
  const maxHp = c.baseStats.hp + (race?.startHpBonus ?? 0);
  const maxMp = c.baseStats.mp + (race?.startMpBonus ?? 0);

  const deck = c.startingDeck
    .map((cardId: string) => data.cards.get(cardId))
    .filter((card): card is NonNullable<typeof card> => card !== undefined);

  run.startRun({
    timelineId: tl.id,
    characterId: c.id,
    season: randomSeason(),
    maxHp,
    maxMp,
    startNodeId: map.startNodeId,
    timeLimit: tl.timeLimit,
  });
  run.data.deck = deck;

  router.push('/game/map');
}

function back() {
  router.push('/game/timeline-select');
}

onMounted(() => {
  if (!ui.pendingRunSetup.timelineId) {
    router.push('/game/timeline-select');
  }
});
</script>

<template>
  <main class="char-view">
    <header class="hdr">
      <button class="back" @click="back">← 시간대 선택</button>
      <h1>캐릭터 선택</h1>
    </header>

    <section v-if="characters.length > 0" class="grid">
      <button
        v-for="c in characters"
        :key="c.id"
        class="card"
        @click="selectCharacter(c)"
      >
        <div class="card__name">{{ c.name }}</div>
        <div class="card__race">{{ data.races.get(c.raceId)?.name ?? c.raceId }}</div>
        <div class="card__stats">
          <span>HP {{ c.baseStats.hp }}</span>
          <span>공격 {{ c.baseStats.attack }}</span>
          <span>방어 {{ c.baseStats.defense }}</span>
          <span>덱 {{ c.startingDeck.length }}</span>
        </div>
      </button>
    </section>
    <section v-else class="empty"><p>—</p></section>
  </main>
</template>

<style scoped>
.char-view { max-width: 1000px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.2rem; margin-top: 1.5rem; }
.card { display: flex; flex-direction: column; gap: 0.3rem; padding: 1.4rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: inherit; cursor: pointer; text-align: left; }
.card:hover { background: rgba(255,255,255,0.08); }
.card__name { font-size: 1.3rem; font-weight: 600; color: #f6e8b8; }
.card__race { font-size: 0.9rem; color: #c08eff; margin-bottom: 0.3rem; }
.card__stats { display: flex; gap: 0.8rem; font-size: 0.8rem; color: #888; margin-top: 0.4rem; }
.empty { text-align: center; padding: 4rem 2rem; color: #6c6c7c; }
</style>
