<script setup lang="ts">
/**
 * 디버그 전투 설정 화면 — 메인에서 진입.
 *
 * 목적: 임의의 몬스터/보스와, *전체 카드 풀에서 골라 만든 덱*으로 즉시 전투.
 *  - 종족: 플레이어 스탯(HP/MP) + 시드 컬러 기준.
 *  - 카드: 182장 전체에서 수량 지정해 덱 구성 (별도 피커).
 *  - 대상: 몬스터 또는 보스 1개.
 *  - 무한 마나 토글.
 *
 * 구현: RaceSelectView의 런 시작 시퀀스를 축약 재현 + ui.debugBattle 오버라이드.
 * 오버라이드는 clearCombat(전투 종료) 시 해제된다.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { instantiateCard } from '@/systems/deck';
import { applySeedColors } from '@/systems/colors';
import { cardEffectKindLabel } from '@/systems/labels';
import type { Card } from '@/data/schemas';

const router = useRouter();
const data = useDataStore();
const run = useRunStore();
const ui = useUiStore();

const selectedRaceId = ref<string>('');
const targetKind = ref<'monster' | 'boss'>('monster');
const selectedTargetId = ref<string>('');
const infiniteMana = ref<boolean>(true);
const cardSearch = ref<string>('');
/** cardId → 수량. */
const picks = ref<Record<string, number>>({});

onMounted(async () => {
  await data.ensureLoaded();
  // 기본 종족 = 첫 번째.
  const firstRace = [...data.races.values()][0];
  if (firstRace) selectedRaceId.value = firstRace.id;
});

const races = computed(() => [...data.races.values()]);
const monsters = computed(() => [...data.monsters.values()].sort((a, b) => a.name.localeCompare(b.name)));
const bosses = computed(() => [...data.bosses.values()].sort((a, b) => a.name.localeCompare(b.name)));

const rankOrder: Record<string, number> = { basic: 0, common: 1, rare: 2, legendary: 3 };
const rankColors: Record<string, string> = {
  basic: '#a4a4b0', common: '#8effb8', rare: '#8eedff', legendary: '#ffe88e',
};

const allCards = computed(() =>
  [...data.cards.values()].sort((a, b) => {
    const r = (rankOrder[a.rank] ?? 0) - (rankOrder[b.rank] ?? 0);
    if (r !== 0) return r;
    return a.name.localeCompare(b.name);
  }),
);

const filteredCards = computed(() => {
  const q = cardSearch.value.trim().toLowerCase();
  if (!q) return allCards.value;
  return allCards.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
  );
});

const deckTotal = computed(() =>
  Object.values(picks.value).reduce((sum, n) => sum + n, 0),
);

function qty(cardId: string): number {
  return picks.value[cardId] ?? 0;
}
function addCard(cardId: string) {
  picks.value = { ...picks.value, [cardId]: qty(cardId) + 1 };
}
function removeCard(cardId: string) {
  const next = Math.max(0, qty(cardId) - 1);
  const copy = { ...picks.value };
  if (next === 0) delete copy[cardId];
  else copy[cardId] = next;
  picks.value = copy;
}
function clearPicks() {
  picks.value = {};
}
/** 같은 종류 3장씩 빠른 채움 — 토글 테스트 편의. */
function addThree(cardId: string) {
  picks.value = { ...picks.value, [cardId]: 3 };
}

function effectSummary(c: Card): string {
  return c.effects
    .map((e) => `${cardEffectKindLabel(e)}${e.value !== undefined ? ' ' + e.value : ''}`)
    .join(', ');
}

const canStart = computed(
  () => !!selectedRaceId.value && !!selectedTargetId.value && deckTotal.value > 0,
);

function startDebugBattle() {
  if (!canStart.value) {
    ui.toast('warning', '종족·대상·카드(1장 이상)를 모두 선택하세요.');
    return;
  }
  const tl = [...data.timelines.values()][0];
  if (!tl) { ui.toast('error', '연표 데이터 없음.'); return; }
  const map = data.nodeMaps.get(tl.nodeMapId);
  if (!map) { ui.toast('error', '노드 맵 데이터 없음.'); return; }
  const race = data.races.get(selectedRaceId.value);
  if (!race) { ui.toast('error', '종족 데이터 없음.'); return; }

  // 덱 구성 — 선택 수량만큼 인스턴스화.
  const deck: Card[] = [];
  for (const [cardId, n] of Object.entries(picks.value)) {
    const def = data.cards.get(cardId);
    if (!def) continue;
    for (let i = 0; i < n; i++) deck.push(instantiateCard(def));
  }
  if (deck.length === 0) { ui.toast('warning', '카드를 1장 이상 선택하세요.'); return; }

  const maxHp = race.baseStats.hp + (race.startHpBonus ?? 0);
  const maxMp = race.baseStats.mp + (race.startMpBonus ?? 0);

  run.startRun({
    timelineId: tl.id,
    raceId: race.id,
    season: 'spring',
    maxHp,
    maxMp,
    startNodeId: map.startNodeId,
    timeLimit: tl.timeLimit,
  });

  run.data.deckSize = deck.length;
  run.data.collection = deck;
  run.data.deck = [...deck];

  // 컬러: 베이스 0 + 종족 시드 컬러 (색 기반 카드 보너스 동작용).
  run.data.colors = {
    fire: 0, water: 0, electric: 0, iron: 0, earth: 0, wind: 0, light: 0, dark: 0,
  };
  applySeedColors(race.seedColors);

  ui.setDebugFlag('infiniteMana', infiniteMana.value);

  if (targetKind.value === 'boss') {
    ui.setDebugBattle({ bossId: selectedTargetId.value });
    router.push('/game/boss');
  } else {
    ui.setDebugBattle({ monsterId: selectedTargetId.value });
    router.push('/game/combat');
  }
}

function switchKind(kind: 'monster' | 'boss') {
  targetKind.value = kind;
  selectedTargetId.value = '';
}

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="debug-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인</button>
      <h1>디버그 전투</h1>
      <p class="sub">임의의 적과 직접 만든 덱으로 즉시 전투. 카드·강화·상태이상·보스 페이즈 테스트용.</p>
    </header>

    <div class="cols">
      <!-- 좌: 설정 -->
      <section class="panel setup">
        <h2>① 종족 (스탯)</h2>
        <div class="race-row">
          <button
            v-for="r in races"
            :key="r.id"
            class="chip"
            :class="{ 'chip--on': selectedRaceId === r.id }"
            @click="selectedRaceId = r.id"
          >
            {{ r.name }}
            <span class="chip__stat">HP {{ r.baseStats.hp + (r.startHpBonus ?? 0) }}</span>
          </button>
        </div>

        <h2>② 대상</h2>
        <div class="tabs">
          <button class="tab" :class="{ 'tab--on': targetKind === 'monster' }" @click="switchKind('monster')">몬스터 ({{ monsters.length }})</button>
          <button class="tab" :class="{ 'tab--on': targetKind === 'boss' }" @click="switchKind('boss')">보스 ({{ bosses.length }})</button>
        </div>
        <ul class="target-list">
          <li
            v-for="m in (targetKind === 'monster' ? monsters : bosses)"
            :key="m.id"
            class="target"
            :class="{ 'target--on': selectedTargetId === m.id }"
            @click="selectedTargetId = m.id"
          >
            <span class="target__name">{{ m.name }}</span>
            <span class="target__hp">HP {{ m.hp }}</span>
          </li>
        </ul>

        <h2>③ 옵션</h2>
        <label class="opt">
          <input type="checkbox" v-model="infiniteMana" />
          무한 마나
        </label>

        <div class="start-bar">
          <div class="deck-count">덱 {{ deckTotal }}장</div>
          <button class="start" :disabled="!canStart" @click="startDebugBattle">전투 시작 →</button>
        </div>
      </section>

      <!-- 우: 카드 피커 -->
      <section class="panel picker">
        <div class="picker-hdr">
          <h2>④ 덱 카드 ({{ deckTotal }})</h2>
          <button class="clear" @click="clearPicks" :disabled="deckTotal === 0">전체 해제</button>
        </div>
        <input class="search" v-model="cardSearch" placeholder="카드 이름/ID 검색…" />
        <ul class="cards">
          <li
            v-for="c in filteredCards"
            :key="c.id"
            class="cardrow"
            :class="{ 'cardrow--on': qty(c.id) > 0 }"
            :style="{ borderLeftColor: rankColors[c.rank] }"
          >
            <div class="cardrow__main">
              <span class="cardrow__cost">{{ c.cost }}</span>
              <span class="cardrow__name">{{ c.name }}</span>
              <span class="cardrow__rank" :style="{ color: rankColors[c.rank] }">{{ c.rank }}</span>
            </div>
            <div class="cardrow__eff">{{ effectSummary(c) }}</div>
            <div class="cardrow__qty">
              <button class="qbtn" @click="removeCard(c.id)" :disabled="qty(c.id) === 0">−</button>
              <span class="qnum">{{ qty(c.id) }}</span>
              <button class="qbtn" @click="addCard(c.id)">+</button>
              <button class="qbtn qbtn--three" @click="addThree(c.id)" title="3장으로">×3</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.debug-view { max-width: 1200px; margin: 0 auto; padding: 1.5rem 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr { margin-bottom: 1rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 0.8rem; }
.hdr h1 { color: #8ec8ff; margin: 0; }
.sub { color: #888; margin: 0.3rem 0 0; font-size: 0.9rem; }

.cols { display: grid; grid-template-columns: 360px 1fr; gap: 1.2rem; align-items: start; }
@media (max-width: 800px) { .cols { grid-template-columns: 1fr; } }

.panel { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 1rem 1.1rem; }
.panel h2 { font-size: 0.95rem; color: #f6e8b8; margin: 0.2rem 0 0.6rem; }
.setup h2:not(:first-child) { margin-top: 1.2rem; }

.race-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem; border-radius: 20px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); color: #d6d6e0; cursor: pointer; font: inherit; font-size: 0.85rem; }
.chip--on { background: rgba(120,200,255,0.18); border-color: rgba(120,200,255,0.6); color: #fff; }
.chip__stat { font-size: 0.72rem; color: #888; }

.tabs { display: flex; gap: 0.4rem; margin-bottom: 0.5rem; }
.tab { flex: 1; padding: 0.4rem; border-radius: 6px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); color: #b6b6c4; cursor: pointer; font: inherit; font-size: 0.85rem; }
.tab--on { background: rgba(120,200,255,0.18); border-color: rgba(120,200,255,0.6); color: #fff; }

.target-list { list-style: none; padding: 0; margin: 0; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
.target { display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; border-radius: 5px; background: rgba(255,255,255,0.03); border: 1px solid transparent; cursor: pointer; }
.target:hover { background: rgba(255,255,255,0.07); }
.target--on { background: rgba(120,200,255,0.16); border-color: rgba(120,200,255,0.5); }
.target__name { color: #f6e8b8; font-size: 0.9rem; }
.target__hp { color: #ff8e8e; font-size: 0.78rem; }

.opt { display: flex; align-items: center; gap: 0.5rem; color: #d6d6e0; font-size: 0.9rem; cursor: pointer; }

.start-bar { margin-top: 1.4rem; display: flex; align-items: center; gap: 0.8rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.08); }
.deck-count { color: #b6b6c4; font-size: 0.9rem; font-variant-numeric: tabular-nums; }
.start { flex: 1; padding: 0.7rem 1rem; background: rgba(120,200,255,0.22); border: 1px solid rgba(120,200,255,0.6); color: #fff; border-radius: 6px; cursor: pointer; font: inherit; font-weight: 600; }
.start:hover:not(:disabled) { background: rgba(120,200,255,0.35); }
.start:disabled { opacity: 0.35; cursor: not-allowed; }

.picker-hdr { display: flex; align-items: center; justify-content: space-between; }
.clear { background: none; border: 1px solid rgba(255,255,255,0.18); color: #b6b6c4; padding: 0.3rem 0.6rem; border-radius: 5px; cursor: pointer; font: inherit; font-size: 0.8rem; }
.clear:disabled { opacity: 0.35; cursor: not-allowed; }
.search { width: 100%; box-sizing: border-box; padding: 0.5rem 0.7rem; margin: 0.5rem 0; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #f6e8b8; font: inherit; }

.cards { list-style: none; padding: 0; margin: 0; max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: 0.3rem; }
.cardrow { padding: 0.45rem 0.6rem; background: rgba(255,255,255,0.03); border-left: 3px solid; border-radius: 4px; display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; gap: 0.15rem 0.6rem; align-items: center; }
.cardrow--on { background: rgba(120,200,255,0.12); }
.cardrow__main { display: flex; align-items: center; gap: 0.45rem; }
.cardrow__cost { background: #c08eff; color: #0d0e14; padding: 0.05rem 0.4rem; border-radius: 50%; font-weight: 700; font-size: 0.72rem; }
.cardrow__name { color: #f6e8b8; font-weight: 600; font-size: 0.88rem; }
.cardrow__rank { font-size: 0.62rem; text-transform: uppercase; }
.cardrow__eff { grid-column: 1; color: #9a9aa8; font-size: 0.72rem; }
.cardrow__qty { grid-column: 2; grid-row: 1 / 3; display: flex; align-items: center; gap: 0.25rem; }
.qbtn { width: 26px; height: 26px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: #f6e8b8; cursor: pointer; font: inherit; line-height: 1; }
.qbtn:hover:not(:disabled) { background: rgba(255,255,255,0.12); }
.qbtn:disabled { opacity: 0.3; cursor: not-allowed; }
.qbtn--three { width: auto; padding: 0 0.4rem; font-size: 0.72rem; color: #8ec8ff; }
.qnum { min-width: 18px; text-align: center; color: #fff; font-variant-numeric: tabular-nums; }
</style>
