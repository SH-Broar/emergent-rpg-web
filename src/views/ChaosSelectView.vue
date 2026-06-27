<script setup lang="ts">
/**
 * 카오스 선택 — 런 시작 *마지막* 단계 (TimelineSelect → RaceSelect → 카오스 → 런 시작).
 *
 * 자기부여 핸디캡(높을수록 원래 세계에서 멀어진다). 소유한 카오스(meta.unlockedChaosIds)를 티어별로 토글하고,
 * 숫자형은 강도(1/2/3), 시작HP는 2단계를 스텝으로 고른다. 이진형·레전드는 on/off.
 * 활성 점수 합 + 연표 최고 기록을 실시간 표시.
 *
 * "런 시작"이 실제 startRun + 덱·컬러 셋업 + applyStartChaos(시작형 효과)를 수행한다.
 * (시작형 타이밍 수정: 덱·컬러 셋업이 끝난 *뒤* applyStartChaos 1회 — 저주덱/시드봉인/색봉인 보존.)
 */

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import { useMetaStore } from '@/stores/meta';
import { instantiateCard } from '@/systems/deck';
import { applySeedColors } from '@/systems/colors';
import { injectStartChaosCards, computeChaosScore, chaosTierLabel, maxIntensityOf, chaosLevelSummary, chaosScoreOf, applyPostApocalypseMap } from '@/systems/chaos';
import { rng } from '@/systems/rng';
import { durationLabel } from '@/systems/time';
import type { Card, Chaos, Race, Season } from '@/data/schemas';

const router = useRouter();
const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();
const meta = useMetaStore();

const timeline = computed(() => {
  const id = ui.pendingRunSetup.timelineId;
  return id ? data.timelines.get(id) : undefined;
});
const race = computed<Race | undefined>(() => {
  const id = ui.pendingRunSetup.raceId;
  return id ? data.races.get(id) : undefined;
});

/** 소유한 카오스만 — 티어 오름차순. */
const ownedChaos = computed<Chaos[]>(() => {
  const owned = new Set(meta.unlockedChaosIds);
  return [...data.chaosDefs.values()]
    .filter((c) => owned.has(c.id))
    .sort((a, b) => a.tier - b.tier);
});

/** 티어별 그룹. */
const groups = computed(() => {
  const byTier = new Map<number, Chaos[]>();
  for (const c of ownedChaos.value) {
    if (!byTier.has(c.tier)) byTier.set(c.tier, []);
    byTier.get(c.tier)!.push(c);
  }
  return [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([tier, items]) => ({ tier, items }));
});

/** 활성 선택 상태 — id → intensity(0=꺼짐, ≥1=강도). reactive. */
const selection = reactive<Record<string, number>>({});

function isOn(id: string): boolean {
  return (selection[id] ?? 0) >= 1;
}
function toggle(c: Chaos) {
  if (isOn(c.id)) selection[c.id] = 0;
  else selection[c.id] = 1; // 켤 때 기본 강도 1.
}
function setIntensity(c: Chaos, n: number) {
  selection[c.id] = Math.max(1, Math.min(maxIntensityOf(c), n));
}
function intensityOf(c: Chaos): number {
  return Math.max(1, selection[c.id] ?? 1);
}

/** 강도 스텝 노출 여부 — 단계가 2 이상이면(numeric/start-hp). */
function hasSteps(c: Chaos): boolean {
  return maxIntensityOf(c) > 1;
}

/** 활성 카오스 목록(강도 포함). */
const active = computed<{ id: string; intensity: number }[]>(() =>
  ownedChaos.value
    .filter((c) => isOn(c.id))
    .map((c) => ({ id: c.id, intensity: intensityOf(c) })),
);

/** 실시간 점수 합. */
const totalScore = computed(() => computeChaosScore(active.value));

/** 연표 최고 기록. */
const bestScore = computed(() => {
  const tl = ui.pendingRunSetup.timelineId;
  return tl ? (meta.bestChaosScore[tl] ?? 0) : 0;
});

/** 한 카오스의 *현재 선택 강도* 점수. */
function scoreOf(c: Chaos): number {
  return chaosScoreOf(c, intensityOf(c));
}

/** 소유한 카오스가 하나라도 있는가 — 없으면 선택 창을 건너뛰고 브리핑만 띄운다(#004). */
const hasChaos = computed(() => ownedChaos.value.length > 0);

/** 런 시작 직전 브리핑 팝업 표시 여부(#005). */
const showBriefing = ref(false);

/** 챕터 번호(표시용) — 연도 오름차순 인덱스. */
const chapterNo = computed(() => {
  const tl = timeline.value;
  if (!tl) return 1;
  const sorted = [...data.timelines.values()].sort((a, b) => a.year - b.year);
  const idx = sorted.findIndex((t) => t.id === tl.id);
  return idx >= 0 ? idx + 1 : 1;
});

/** 브리핑에 표시할 활성 카오스 요약(이름 + 점수). */
const activeChaosList = computed<{ name: string; score: number }[]>(() =>
  active.value.map((a) => {
    const c = data.chaosDefs.get(a.id);
    return { name: c?.name ?? a.id, score: c ? chaosScoreOf(c, a.intensity) : 0 };
  }),
);

function openBriefing() {
  showBriefing.value = true;
}
function closeBriefing() {
  // 카오스가 없어 선택 창을 건너뛴 경우엔 닫을 화면이 없으므로 캐릭터 선택으로 돌아간다.
  if (!hasChaos.value) {
    router.push('/game/race-select');
    return;
  }
  showBriefing.value = false;
}

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter', 'monsoon', 'twilight'];
function randomSeason(): Season {
  return SEASONS[Math.floor(Math.random() * SEASONS.length)];
}

async function confirmStart() {
  const tl = timeline.value;
  const r = race.value;
  if (!tl || !r) {
    ui.toast('error', '시간대/종족이 선택되지 않았습니다.');
    return;
  }
  const map = data.nodeMaps.get(tl.nodeMapId);
  if (!map) {
    ui.toast('error', `노드 맵 누락: ${tl.nodeMapId}`);
    return;
  }

  // 선택 확정 — ui + 런에 전달.
  ui.pendingRunSetup.activeChaos = active.value.map((a) => ({ ...a }));

  const maxHp = r.baseStats.hp + (r.startHpBonus ?? 0);
  const maxMp = r.baseStats.mp + (r.startMpBonus ?? 0);

  // startRun — 시드 결정 + rng 바인딩 + activeChaos 확정.
  // (startRun 내부에서도 applyStartChaos를 1회 부르지만, 그 시점엔 덱·컬러가 비어 있어
  //  start-hp/time-limit/color-seal/score만 반영된다. 덱·컬러 의존 효과는 아래 셋업 후 재적용.)
  run.startRun({
    timelineId: tl.id,
    raceId: r.id,
    season: randomSeason(),
    maxHp,
    maxMp,
    startNodeId: map.startNodeId,
    timeLimit: tl.timeLimit,
    activeChaos: ui.pendingRunSetup.activeChaos,
  });

  // 종족 강화 — 최대 목숨 보정(Item 28). 기본 2 + 보너스(올릴 때 현재 목숨도 같이 증가).
  if (r.maxLivesBonus && r.maxLivesBonus > 0) run.raiseMaxLives(r.maxLivesBonus);

  // 시작 덱 — 동명 카드도 별개 인스턴스.
  const startingInstances: Card[] = r.startingDeck
    .map((cardId: string) => data.cards.get(cardId))
    .filter((card): card is Card => card !== undefined)
    .map(instantiateCard);
  const deckSize = r.deckSize ?? startingInstances.length;
  const fillCount = Math.max(0, deckSize - startingInstances.length);
  const seedPool: Card[] = (r.seedCardIds ?? [])
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

  // 시작 아이템 — 전 종족 공통 회복약.
  const starter = data.items.get('i-potion-small');
  if (starter) run.addItem(starter);

  // 종족 시작 회복 아이템 — 공통 회복약에 *더해* 지급(나방·아르카나 초반 회복 보완).
  for (const itemId of r.seedItemIds ?? []) {
    const item = data.items.get(itemId);
    if (item) run.addItem(item);
  }

  // 컬러 베이스 0 → 종족 시드 컬러 적용.
  run.data.colors = {
    fire: 0, water: 0, electric: 0, iron: 0,
    earth: 0, wind: 0, light: 0, dark: 0,
  };
  applySeedColors(r.seedColors);

  // 종족 시드 유물.
  if (r.seedRelicIds) {
    for (const relicId of r.seedRelicIds) {
      const relic = data.relics.get(relicId);
      if (relic) {
        run.data.relics.push(relic);
        if (!run.data.newRelicEncounters.includes(relic.id)) {
          run.data.newRelicEncounters.push(relic.id);
        }
      }
    }
  }

  // === 메타로 해금한 종족 앵커 유물 자동 지급 (Item 37-③ 메타 배선) ===
  // 규약: id가 `r-race-<raceId>-...` 인 유물은 그 종족 앵커. 다른 종족 해금분은 누출 0.
  // 기본 r-race-<raceId> 1종은 위 seed_relics 루프에서 이미 지급됨(중복 push 가드).
  const racePrefix = `r-race-${r.id}-`;
  const alreadyOwned = new Set(run.data.relics.map((rel) => rel.id));
  const grantedAnchors: string[] = [];
  for (const relicId of meta.unlockedRelicIds) {
    if (!relicId.startsWith(racePrefix)) continue;
    if (alreadyOwned.has(relicId)) continue;
    const relic = data.relics.get(relicId);
    if (!relic) continue;
    run.data.relics.push(relic);
    alreadyOwned.add(relicId);
    grantedAnchors.push(relic.name);
    if (!run.data.newRelicEncounters.includes(relic.id)) {
      run.data.newRelicEncounters.push(relic.id);
    }
  }
  // R4 — 연구로 해금한 종족 앵커 유물이 런 시작에 실제로 지급됐음을 가시화(현재 무표시였음).
  for (const name of grantedAnchors) {
    ui.toast('success', `연구 해금: ${name}`);
  }

  // === 시작형 카오스 *재적용* — 덱·컬러 셋업이 끝난 시점에 1회. ===
  // start-inject-card(저주덱)/seed-seal(시드봉인)은 위 덱·컬러 셋업을 덮어쓰지 않도록 *여기서* 적용.
  // (start-hp/time-limit/color-seal는 startRun 내부에서 이미 1회 적용됐고 idempotent하지 않으므로
  //  applyStartChaos를 여기서 한 번 더 부르면 HP가 또 깎인다. → '셋업 의존' 시작형만 골라 적용.)
  applyStartChaosDeckColorPhase();

  // Passive 유물 효과 1회 적용.
  const { applyPassiveRelicsAtRunStart } = await import('@/systems/relic');
  applyPassiveRelicsAtRunStart();

  // #007 — 시작 노드가 마을이면 "마을에 입장된 상태"로 런을 연다(누르게 하지 않음).
  //   시작 노드는 startRun에서 currentNodeId(=pass-only)로 마킹되므로, 맵에 떨궈 두면
  //   "보이는데 못 들어가는" 어색함이 생긴다. 마을이면 곧장 VillageView로(시간 비용 없음).
  const startKind = map.nodes.find((n) => n.id === map.startNodeId)?.kind;
  router.push(startKind === 'village' ? '/game/village' : '/game/map');
}

/**
 * 덱·컬러 의존 시작형 효과만 셋업 *후* 적용 — 중복 적용 방지를 위해 startRun 내부 호출과 분리.
 *   - start-inject-card : 시작 덱에 죽은 카드 주입(덱이 채워진 뒤라야 보존). injectStartChaosCards로 1회.
 *   - seed-seal         : 종족 시드 컬러 0(applySeedColors 뒤라야 무효화).
 *   - color-seal/start-hp/time-limit : startRun 내부에서 이미 1회 적용 — 여기선 미적용(중복 방지).
 *     (score 캐시도 startRun에서 이미 산정됨 — 여기선 건드리지 않는다.)
 */
function applyStartChaosDeckColorPhase() {
  const r = run.data;
  const defs = data.chaosDefs;
  // 카드 주입은 전용 헬퍼로 한 번에(점수/HP/색결정 등 다른 효과는 재적용하지 않음).
  injectStartChaosCards(r);
  for (const a of r.activeChaos) {
    const c = defs.get(a.id);
    if (c?.effectKind === 'seed-seal') {
      r.colors = {
        fire: 0, water: 0, electric: 0, iron: 0,
        earth: 0, wind: 0, light: 0, dark: 0,
      };
    }
  }
  // post-apocalypse(포스트 아포칼립스) — 맵의 전투/채집 노드 일부를 휴식으로 변환(nodeKindOverrides).
  //  맵은 timeline의 node_map. 카오스 비활성이면 헬퍼 내부에서 no-op.
  const tl = data.timelines.get(r.timelineId);
  const map = tl ? data.nodeMaps.get(tl.nodeMapId) : undefined;
  if (map) applyPostApocalypseMap(r, map);
}

function back() {
  router.push('/game/race-select');
}

onMounted(async () => {
  await data.ensureLoaded();
  if (!ui.pendingRunSetup.timelineId) {
    router.push('/game/timeline-select');
    return;
  }
  if (!ui.pendingRunSetup.raceId) {
    router.push('/game/race-select');
    return;
  }
  // #004 — 카오스가 하나도 해금되지 않았으면 선택 창을 건너뛰고 곧장 브리핑을 띄운다.
  if (!hasChaos.value) showBriefing.value = true;
});
</script>

<template>
  <main class="chaos-select-view">
    <header class="hdr">
      <button class="back" @click="back">← 캐릭터 선택</button>
      <h1>카오스</h1>
      <p class="sub">카오스 레벨을 선택해주세요. 카오스 수치가 높을수록 원래 세계에서 멀어집니다.</p>
    </header>

    <template v-if="hasChaos">
    <!-- 점수 요약 -->
    <section class="score-bar">
      <div class="score">
        <span class="score__label">도전 점수</span>
        <span class="score__val">{{ totalScore }}</span>
      </div>
      <div class="score score--best">
        <span class="score__label">이 챕터의 최고 기록</span>
        <span class="score__val">{{ bestScore }}</span>
      </div>
    </section>

    <!-- 소유 카오스 -->
    <section class="catalog">
      <div v-for="g in groups" :key="g.tier" class="group">
        <h2 class="group__title">{{ chaosTierLabel(g.tier) }}</h2>
        <div class="group__items">
          <div
            v-for="c in g.items"
            :key="c.id"
            class="chaos"
            :class="{ 'chaos--on': isOn(c.id) }"
          >
            <button class="chaos__toggle" @click="toggle(c)">
              <span class="chaos__check">{{ isOn(c.id) ? '■' : '□' }}</span>
              <span class="chaos__name">{{ c.name }}</span>
              <span class="chaos__score">+{{ isOn(c.id) ? scoreOf(c) : chaosScoreOf(c, 1) }}점</span>
            </button>
            <p class="chaos__desc">{{ c.description }}</p>

            <!-- 강도 스텝 (numeric/start-hp) -->
            <div v-if="isOn(c.id) && hasSteps(c)" class="steps">
              <span class="steps__label">강도</span>
              <button
                v-for="n in maxIntensityOf(c)"
                :key="n"
                class="step"
                :class="{ 'step--active': intensityOf(c) === n }"
                @click="setIntensity(c, n)"
                :title="chaosLevelSummary(c, n)"
              >
                {{ n }}
              </button>
              <span class="steps__summary">{{ chaosLevelSummary(c, intensityOf(c)) }}</span>
            </div>
            <!-- 단일 단계 효과 요약 (binary/legend) -->
            <p v-else-if="isOn(c.id)" class="chaos__summary">{{ chaosLevelSummary(c, 1) }}</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <button class="start" @click="openBriefing">런 시작 (도전 점수 {{ totalScore }})</button>
    </footer>
    </template>

    <!-- 런 시작 직전 브리핑 팝업(#005) — 미션·제한시간·카오스 재확인. -->
    <transition name="brief-fade">
      <div v-if="showBriefing" class="brief-backdrop" role="dialog" aria-modal="true">
        <div class="brief-modal">
          <h2 class="brief-modal__title">{{ chapterNo }}장</h2>
          <dl class="brief-meta">
            <div>
              <dt>제한 시간</dt>
              <dd>{{ timeline ? durationLabel(timeline.timeLimit) : '—' }}</dd>
            </div>
          </dl>
          <p class="brief-mission"><strong>미션</strong> · {{ timeline?.missionGoal ?? '—' }}</p>

          <div v-if="activeChaosList.length > 0" class="brief-chaos">
            <span class="brief-chaos__title">카오스 · 도전 점수 {{ totalScore }}</span>
            <ul>
              <li v-for="c in activeChaosList" :key="c.name">
                {{ c.name }} <span class="brief-chaos__score">+{{ c.score }}</span>
              </li>
            </ul>
          </div>

          <div class="brief-actions">
            <button class="brief-btn brief-btn--cancel" @click="closeBriefing">뒤로</button>
            <button class="brief-btn brief-btn--go" @click="confirmStart">시작</button>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.chaos-select-view { max-width: 860px; margin: 0 auto; padding: 2rem; }
.hdr { margin-bottom: 1.2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.sub { color: #888; margin: 0.4rem 0 0; font-size: 0.92rem; }

.score-bar { display: flex; gap: 1rem; margin: 1rem 0 1.6rem; flex-wrap: wrap; }
.score {
  display: flex; flex-direction: column; gap: 0.2rem;
  padding: 0.7rem 1.3rem;
  background: rgba(192,142,255,0.1);
  border: 1px solid rgba(192,142,255,0.35);
  border-radius: 10px; min-width: 130px;
}
.score--best { background: rgba(255,232,142,0.08); border-color: rgba(255,232,142,0.3); }
.score__label { font-size: 0.78rem; color: #b6b6c4; letter-spacing: 0.04em; }
.score__val { font-size: 1.7rem; font-weight: 700; color: #f6e8b8; font-variant-numeric: tabular-nums; }

.catalog { display: flex; flex-direction: column; gap: 1.6rem; }
.group__title { font-size: 0.95rem; margin: 0 0 0.6rem; color: #c08eff; letter-spacing: 0.04em; }
.group__items { display: flex; flex-direction: column; gap: 0.6rem; }

.chaos {
  padding: 0.9rem 1.1rem;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
}
.chaos--on { border-color: rgba(192,142,255,0.5); background: rgba(192,142,255,0.07); }
.chaos__toggle {
  display: flex; align-items: center; gap: 0.6rem; width: 100%;
  background: none; border: none; color: inherit; cursor: pointer; text-align: left; padding: 0;
}
.chaos__check { color: #c08eff; font-size: 1rem; }
.chaos__name { flex: 1; font-weight: 600; color: #f6e8b8; }
.chaos__score { font-size: 0.85rem; color: #ffe88e; font-variant-numeric: tabular-nums; }
.chaos__desc { color: #bdb6a0; font-size: 0.85rem; line-height: 1.45; margin: 0.35rem 0 0; }
.chaos__summary { color: #c08eff; font-size: 0.82rem; margin: 0.4rem 0 0; }

.steps { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.6rem; flex-wrap: wrap; }
.steps__label { font-size: 0.8rem; color: #888; }
.step {
  width: 28px; height: 28px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.2);
  color: #d6d6e0; border-radius: 6px; cursor: pointer;
  font: inherit; font-size: 0.85rem;
}
.step--active { background: rgba(192,142,255,0.3); border-color: rgba(192,142,255,0.6); color: #f6e8b8; }
.steps__summary { font-size: 0.82rem; color: #c08eff; margin-left: 0.3rem; }

.empty { text-align: center; padding: 3rem 2rem; color: #6c6c7c; }

.foot { margin-top: 2rem; display: flex; justify-content: flex-end; }
.start {
  padding: 0.8rem 1.8rem;
  background: rgba(192,142,255,0.2);
  border: 1px solid rgba(192,142,255,0.5);
  color: #f6e8b8; border-radius: 8px; cursor: pointer;
  font: inherit; font-weight: 600; font-size: 1rem;
}
.start:hover { background: rgba(192,142,255,0.32); }

/* 런 시작 직전 브리핑 팝업(#005) */
.brief-backdrop {
  position: fixed; inset: 0; z-index: var(--z-overlay);
  background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.brief-modal {
  max-width: 460px; width: 100%;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1.6rem 1.7rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  display: grid; gap: 1rem;
}
.brief-modal__title { color: #f6e8b8; margin: 0; font-size: 1.7rem; }
.brief-meta { display: flex; gap: 1.6rem; margin: 0; }
.brief-meta div { display: grid; gap: 0.15rem; }
.brief-meta dt { font-size: 0.72rem; color: #888; letter-spacing: 0.06em; }
.brief-meta dd { color: #f6e8b8; margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
.brief-mission {
  background: rgba(0,0,0,0.25);
  border-left: 2px solid rgba(246, 232, 184, 0.45);
  padding: 0.6rem 0.9rem; margin: 0;
  color: #d6cfb8; font-size: 0.92rem;
}
.brief-mission strong { color: #f6e8b8; }
.brief-chaos { display: grid; gap: 0.4rem; }
.brief-chaos__title { font-size: 0.82rem; color: #c08eff; letter-spacing: 0.03em; }
.brief-chaos ul { margin: 0; padding-left: 1.1rem; color: #bdb6a0; font-size: 0.88rem; display: grid; gap: 0.2rem; }
.brief-chaos__score { color: #ffe88e; font-variant-numeric: tabular-nums; }
.brief-actions { display: flex; gap: 0.6rem; margin-top: 0.3rem; }
.brief-btn {
  flex: 1; padding: 0.7rem 1rem; border-radius: 6px; cursor: pointer;
  font: inherit; font-weight: 600; font-size: 0.95rem; border: 1px solid transparent;
  transition: filter 120ms ease, transform 120ms ease;
}
.brief-btn--go { background: linear-gradient(180deg, #c0b693 0%, #a39872 100%); color: #1a1a26; }
.brief-btn--cancel { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.18); color: #b6b6c4; }
.brief-btn:hover { transform: translateY(-1px); filter: brightness(1.06); }
.brief-fade-enter-active, .brief-fade-leave-active { transition: opacity 200ms ease; }
.brief-fade-enter-from, .brief-fade-leave-to { opacity: 0; }

@media (max-width: 640px) { .chaos-select-view { padding: 1.2rem; } }
</style>
