<script setup lang="ts">
/**
 * 종족 선택 — 시간대 선택 후 *마지막* 선택 단계 (M8 + 2026-05-17 단순화).
 *
 * 종족 = STS의 캐릭터 클래스. 종족을 고르면 그 종족의 캐릭터로 *곧장 게임 시작*.
 * 별도의 "캐릭터 선택" 단계는 없음 — 종족이 곧 클래스다.
 *
 * 흐름: TimelineSelect → RaceSelect → /game/map
 *
 * 데이터 매핑: 종족당 첫 번째 캐릭터(`tl.availableCharacterIds` 중 raceId 일치) 사용.
 * 종족당 캐릭터가 여러 명이어도 첫 번째만 사용 — 캐릭터 entity는 향후 종족에 흡수될 예정.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { canSelectCharacter } from '@/frame/Mono';
import { instantiateCard } from '@/systems/deck';
import { applySeedColors } from '@/systems/colors';
import { rng } from '@/systems/rng';
import type { Card, Character, Race, Season } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();

const timeline = computed(() => {
  const id = ui.pendingRunSetup.timelineId;
  return id ? data.timelines.get(id) : undefined;
});

/** 시간대에서 선택 가능한 종족 — 종족별로 *첫 캐릭터*를 매핑. */
interface RaceOption {
  race: Race;
  character: Character;
}
const raceOptions = computed<RaceOption[]>(() => {
  const tl = timeline.value;
  if (!tl) return [];
  const seen = new Set<string>();
  const out: RaceOption[] = [];
  for (const cid of tl.availableCharacterIds) {
    const ch = data.characters.get(cid);
    if (!ch) continue;
    if (seen.has(ch.raceId)) continue;
    seen.add(ch.raceId);
    const r = data.races.get(ch.raceId);
    if (r) out.push({ race: r, character: ch });
  }
  return out;
});

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter', 'monsoon', 'twilight'];
function randomSeason(): Season {
  return SEASONS[Math.floor(Math.random() * SEASONS.length)];
}

async function selectRace(opt: RaceOption) {
  const c = opt.character;
  const race = opt.race;

  if (!canSelectCharacter(c.id)) {
    ui.toast('warning', '잠긴 종족입니다.');
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

  ui.pendingRunSetup.raceId = race.id;

  const maxHp = c.baseStats.hp + (race.startHpBonus ?? 0);
  const maxMp = c.baseStats.mp + (race.startMpBonus ?? 0);

  // startRun을 *먼저* — 그 안에서 시드를 결정하고 rng를 바인딩. 이후 모든 pick은 결정론.
  run.startRun({
    timelineId: tl.id,
    characterId: c.id,
    season: randomSeason(),
    maxHp,
    maxMp,
    startNodeId: map.startNodeId,
    timeLimit: tl.timeLimit,
  });

  // 시작 덱 — 동명 카드도 별개 인스턴스.
  const startingInstances: Card[] = c.startingDeck
    .map((cardId: string) => data.cards.get(cardId))
    .filter((card): card is Card => card !== undefined)
    .map(instantiateCard);

  // 종족 고정 덱 크기 (예: 인간 15). 정의 없으면 starting_deck 길이.
  const deckSize = race.deckSize ?? startingInstances.length;

  // 부족분은 race.seedCardIds 가중 랜덤으로 채움.
  const fillCount = Math.max(0, deckSize - startingInstances.length);
  const seedPool: Card[] = (race.seedCardIds ?? [])
    .map((cardId) => data.cards.get(cardId))
    .filter((card): card is Card => card !== undefined);
  const filledInstances: Card[] = [];
  for (let i = 0; i < fillCount && seedPool.length > 0; i++) {
    const pick = seedPool[Math.floor(rng() * seedPool.length)];
    filledInstances.push(instantiateCard(pick));
  }
  const allInstances = [...startingInstances, ...filledInstances];

  run.data.deckSize = deckSize;
  run.data.collection = allInstances;
  run.data.deck = allInstances.slice(0, deckSize);

  // 시작 아이템 — 회복약 한 점.
  const starter = data.items.get('i-potion-small');
  if (starter) run.addItem(starter);

  // 종족 시드 컬러 — 한 컬러당 최대 5 (사용자 사양). 인간 = light:5, wind:3.
  applySeedColors(race.seedColors);

  // 컬러 베이스 = 0. (장비/이벤트/유물로만 변동.)
  run.data.colors = {
    fire: 0, water: 0, electric: 0, iron: 0,
    earth: 0, wind: 0, light: 0, dark: 0,
  };

  // 종족 시드 유물 부여
  if (race.seedRelicIds) {
    for (const relicId of race.seedRelicIds) {
      const relic = data.relics.get(relicId);
      if (relic) {
        run.data.relics.push(relic);
        if (!run.data.newRelicEncounters.includes(relic.id)) {
          run.data.newRelicEncounters.push(relic.id);
        }
      }
    }
  }

  // Passive 유물 효과 1회 적용 (bonus-hp 등)
  const { applyPassiveRelicsAtRunStart } = await import('@/systems/relic');
  applyPassiveRelicsAtRunStart();

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
  <main class="race-view">
    <header class="hdr">
      <button class="back" @click="back">← 시간대 선택</button>
      <h1>종족 선택</h1>
      <p class="sub">이 시대에 깃들 종족을 고른다. 종족이 곧 시작 덱·시드·시작 위치를 결정한다.</p>
    </header>

    <section v-if="raceOptions.length > 0" class="grid">
      <button
        v-for="opt in raceOptions"
        :key="opt.race.id"
        class="card"
        @click="selectRace(opt)"
      >
        <div class="card__head">
          <span class="card__name">{{ opt.race.name }}</span>
          <span class="card__cat">{{ opt.race.category }}</span>
        </div>
        <p v-if="opt.race.description" class="card__desc">{{ opt.race.description }}</p>
        <div class="card__stats">
          <span>HP {{ opt.character.baseStats.hp + (opt.race.startHpBonus ?? 0) }}</span>
          <span>MP {{ opt.character.baseStats.mp + (opt.race.startMpBonus ?? 0) }}</span>
          <span v-if="opt.race.deckSize">덱 {{ opt.race.deckSize }}</span>
          <span>시드 카드 {{ opt.race.seedCardIds.length }}</span>
        </div>
      </button>
    </section>
    <section v-else class="empty"><p>—</p></section>
  </main>
</template>

<style scoped>
.race-view { max-width: 1000px; margin: 0 auto; padding: 2rem; }
.back {
  background: none;
  border: 1px solid rgba(255,255,255,0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.hdr h1 { color: #f6e8b8; margin: 0; }
.hdr .sub { color: #888; margin: 0.4rem 0 1.6rem; font-size: 0.92rem; }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.2rem;
  margin-top: 0.4rem;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 1.4rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.card:hover { background: rgba(255,255,255,0.08); }
.card__head { display: flex; align-items: baseline; gap: 0.5rem; }
.card__name { flex: 1; font-size: 1.3rem; font-weight: 600; color: #f6e8b8; }
.card__cat { font-size: 0.75rem; color: #c08eff; text-transform: uppercase; letter-spacing: 0.06em; }
.card__desc { color: #bdb6a0; font-size: 0.9rem; line-height: 1.5; margin: 0.2rem 0 0.4rem; }
.card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: #888;
  margin-top: 0.2rem;
}
.empty { text-align: center; padding: 4rem 2rem; color: #6c6c7c; }

@media (max-width: 640px) {
  .race-view { padding: 1.2rem; }
  .card { padding: 1.1rem; }
}
</style>
