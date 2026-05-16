<script setup lang="ts">
/**
 * 종족 선택 — 시간대 선택 후 캐릭터 선택 전 단계 (M8).
 *
 * 흐름: TimelineSelect → RaceSelect → CharacterSelect.
 * 시간대의 availableCharacterIds에서 raceId를 추출, 중복 제거 후 카드로 노출.
 * 클릭 시 `ui.pendingRunSetup.raceId` 저장 → `/game/character-select` 이동.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import type { Character, Race } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();

const timeline = computed(() => {
  const id = ui.pendingRunSetup.timelineId;
  return id ? data.timelines.get(id) : undefined;
});

/** 시간대에서 등장 가능한 종족 목록 (중복 제거). */
const races = computed<Race[]>(() => {
  const tl = timeline.value;
  if (!tl) return [];
  const seen = new Set<string>();
  const out: Race[] = [];
  for (const cid of tl.availableCharacterIds) {
    const ch = data.characters.get(cid);
    if (!ch) continue;
    if (seen.has(ch.raceId)) continue;
    seen.add(ch.raceId);
    const r = data.races.get(ch.raceId);
    if (r) out.push(r);
  }
  return out;
});

/** 한 종족에서 시간대 내 선택 가능한 캐릭터 수. */
function characterCount(race: Race): number {
  const tl = timeline.value;
  if (!tl) return 0;
  return tl.availableCharacterIds
    .map((cid: string) => data.characters.get(cid))
    .filter((c: Character | undefined): c is Character => c !== undefined && c.raceId === race.id)
    .length;
}

function selectRace(r: Race) {
  ui.pendingRunSetup.raceId = r.id;
  router.push('/game/character-select');
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
      <p class="sub">이 시대에 깃들 종족을 고른다.</p>
    </header>

    <section v-if="races.length > 0" class="grid">
      <button
        v-for="r in races"
        :key="r.id"
        class="card"
        @click="selectRace(r)"
      >
        <div class="card__head">
          <span class="card__name">{{ r.name }}</span>
          <span class="card__cat">{{ r.category }}</span>
        </div>
        <p v-if="r.description" class="card__desc">{{ r.description }}</p>
        <div class="card__stats">
          <span v-if="r.startHpBonus !== undefined">HP +{{ r.startHpBonus }}</span>
          <span v-if="r.startMpBonus !== undefined">MP +{{ r.startMpBonus }}</span>
          <span v-if="r.deckSize">덱 {{ r.deckSize }}</span>
          <span>시드 카드 {{ r.seedCardIds.length }}</span>
          <span>캐릭터 {{ characterCount(r) }}</span>
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
