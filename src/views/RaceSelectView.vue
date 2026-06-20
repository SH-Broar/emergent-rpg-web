<script setup lang="ts">
/**
 * 종족 선택 — 시간대 선택 후 *마지막* 선택 단계 (M8 + 2026-05-17 단순화).
 *
 * 종족 = STS의 캐릭터 클래스. 종족을 고르면 *곧장 게임 시작*.
 * 플레이어는 *종족만* 고른다 — characters/ 폴더 폐기 후 race가 stats·덱·시드를 직접 보유.
 *
 * 흐름: TimelineSelect → RaceSelect → /game/map
 *
 * 데이터 매핑: `tl.availableRaceIds`를 순회하며 data.races 직접 조회.
 */

import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { canSelectRace } from '@/frame/Mono';
import type { Race } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();

/**
 * 선택 화면 표기 = "종족 이름: 캐릭터 이름" (사용자 지시 2026-06-18).
 * 데이터의 race.name 은 화면마다 종족명/캐릭터명이 섞여 있어(loader가 그리드 작업 중),
 * 표시용 매핑은 이 뷰에 국소화한다. 미정의 종족은 race.name 으로 폴백.
 */
const RACE_LABELS: Record<string, string> = {
  human: '인간: 하코',
  moth: '나방: 리무',
  whitefang: '고양이: 화이트 팡',
  slime: '슬라임: 샤유아',
  sminthus: '스민투스: 미유',
};
function raceLabel(race: Race): string {
  return RACE_LABELS[race.id] ?? race.name;
}

const timeline = computed(() => {
  const id = ui.pendingRunSetup.timelineId;
  return id ? data.timelines.get(id) : undefined;
});

/** 시간대에서 선택 가능한 종족 — availableRaceIds를 직접 매핑. */
const raceOptions = computed<Race[]>(() => {
  const tl = timeline.value;
  if (!tl) return [];
  const seen = new Set<string>();
  const out: Race[] = [];
  for (const rid of tl.availableRaceIds) {
    if (seen.has(rid)) continue;
    seen.add(rid);
    const r = data.races.get(rid);
    if (r) out.push(r);
  }
  return out;
});

/**
 * 종족 확정 → *카오스 선택* 단계로. (실제 startRun + 덱/컬러 셋업 + 시작형 카오스 적용은
 * ChaosSelectView가 수행 — 시작형 타이밍을 한 곳에서 보장.)
 */
function selectRace(race: Race) {
  if (!canSelectRace(race.id)) {
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
  router.push('/game/chaos-select');
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
      <button class="back" @click="back">← 챕터 선택</button>
      <h1>캐릭터 선택</h1>
      <p class="sub">플레이할 캐릭터를 선택해주세요.</p>
    </header>

    <section v-if="raceOptions.length > 0" class="grid">
      <button
        v-for="race in raceOptions"
        :key="race.id"
        class="card"
        :class="{ 'card--locked': !canSelectRace(race.id) }"
        @click="selectRace(race)"
      >
        <div class="card__head">
          <span class="card__name">{{ raceLabel(race) }}</span>
          <span class="card__cat">{{ race.category }}</span>
        </div>
        <p v-if="race.description" class="card__desc">{{ race.description }}</p>
        <span v-if="!canSelectRace(race.id)" class="card__lock">🔒 연구에서 해금</span>
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
.card--locked { opacity: 0.5; position: relative; }
.card--locked:hover { background: rgba(255,255,255,0.04); }
.card__lock {
  margin-top: 0.6rem;
  font-size: 0.8rem;
  color: #c08eff;
  font-weight: 600;
  letter-spacing: 0.03em;
}
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
