<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { colorLabel } from '@/systems/labels';
import { clockFull, minutesLabel } from '@/systems/time';
import { affordances, ensureInteractionWorld, observedTargets } from '@/systems/world-interaction';
import type { ActionOffer, ObservedTarget } from '@/systems/world/types';

const run = useRunStore();
const data = useDataStore();
const selectedId = ref<string | null>(null);
const busy = ref(false);
const feedback = ref<{ ok: boolean; message: string } | null>(null);
const targets = computed(() => observedTargets(run.data));
const selected = computed(() => targets.value.find(target => target.id === selectedId.value));
const actions = computed(() => selected.value ? affordances(run.data, 'player', selected.value.id) : []);
const visibleColors = computed(() => Object.entries(selected.value?.colors ?? {}).filter(([, value]) => (value ?? 0) > 0));
const observations = computed(() => {
  const facts = run.data.interactionWorld?.knowledge.player?.facts ?? [];
  return [...facts].sort((a, b) => b.id - a.id).slice(0, 8);
});
const kinds: Record<ObservedTarget['kind'], string> = {
  actor: '인물', resource: '자원', facility: '시설', plot: '생산지', terrain: '지형',
};
const professions: Record<string, string> = {
  traveler: '여행자', grower: '재배자', artisan: '장인', researcher: '연구자',
};
const properties: Record<string, string> = {
  integrity: '내구', moisture: '수분', heat: '열', burning: '연소', smoke: '연기',
  flammability: '가연성', conductivity: '전도성', hardness: '단단함', work: '가공 진척',
  workRequired: '필요 노동', irrigation: '관개', safety: '안전',
  mana: 'MP', lifeLevel: '생활 숙련', practice: '노동 경험', force: '힘', charge: '전하', laborPower: '노동력',
};
const resources: Record<string, string> = { 'raw-fiber': '거친 섬유', 'raw-stone': '원석', water: '물' };

function numberLabel(value: number | undefined): string {
  return value === undefined ? '—' : String(Math.round(value * 10) / 10);
}
function resourceName(id: string): string {
  return data.items.get(id)?.name ?? resources[id] ?? id;
}
function speciesName(id: string): string {
  return data.races.get(id)?.name ?? id;
}
function ownerName(target: ObservedTarget): string {
  return target.ownerName ?? (target.ownerId === 'local-community' ? '마을 공동체' : '소유자 미확인');
}
function chooseTarget(id: string): void {
  selectedId.value = id;
  feedback.value = null;
}
function perform(action: ActionOffer): void {
  if (!selected.value || !action.enabled || busy.value) return;
  busy.value = true;
  try {
    const result = run.performWorldAction({ actorId: 'player', targetId: selected.value.id, actionId: action.id });
    feedback.value = { ok: result.ok, message: result.reason || result.message };
  } finally {
    busy.value = false;
  }
}
function changeProfession(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === 'traveler' || value === 'grower' || value === 'artisan' || value === 'researcher') {
    run.setProfession(value);
    feedback.value = { ok: true, message: `이제 ${professions[value]}로 일합니다.` };
  }
}

onMounted(() => ensureInteractionWorld(run.data));
watch(() => run.data.currentNodeId, () => {
  selectedId.value = null;
  feedback.value = null;
});
watch(targets, value => {
  if (selectedId.value && !value.some(target => target.id === selectedId.value)) selectedId.value = null;
});
</script>

<template>
  <section class="world-panel" aria-label="현재 장소의 대상과 행동">
    <details class="world-panel__profession">
      <summary>나의 일 · {{ professions[run.data.profession ?? 'traveler'] }}</summary>
      <label>
        직업
        <select :value="run.data.profession ?? 'traveler'" @change="changeProfession">
          <option v-for="(label, value) in professions" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
    </details>

    <div class="world-panel__targets" aria-label="관찰한 대상">
      <button
        v-for="target in targets" :key="target.id" type="button"
        :aria-pressed="selectedId === target.id"
        :aria-label="target.id === 'player' ? '나 자신' : undefined"
        :class="{ 'is-selected': selectedId === target.id }"
        @click="chooseTarget(target.id)"
      >
        <strong>{{ target.name }}</strong>
      </button>
    </div>
    <p v-if="!targets.length" class="world-panel__empty">아직 발견한 대상 없음</p>

    <section v-if="selected" class="world-panel__target" :aria-label="selected.name">
      <header>
        <h3>{{ selected.name }}</h3>
      </header>
      <details :key="selected.id" class="world-panel__details">
      <summary>살펴보기</summary>
      <p>{{ kinds[selected.kind] }}<template v-if="selected.species"> · {{ speciesName(selected.species) }}</template><template v-if="selected.profession"> · {{ professions[selected.profession] ?? selected.profession }}</template></p>
      <small>{{ clockFull(selected.turn) }} 관찰</small>
      <div class="world-panel__colors" aria-label="컬러 성질">
        <span v-for="[color, value] in visibleColors" :key="color">{{ colorLabel(color) }} {{ numberLabel(value) }}</span>
      </div>
      <dl class="world-panel__properties">
        <div v-if="selected.ownerId && selected.ownerId !== selected.id"><dt>소유</dt><dd>{{ ownerName(selected) }}</dd></div>
        <div v-for="(value, key) in selected.properties" :key="key"><dt>{{ key === 'integrity' && selected.kind === 'actor' ? '신체 상태' : properties[key] ?? key }}</dt><dd>{{ numberLabel(value) }}{{ key === 'integrity' ? '%' : '' }}</dd></div>
        <div v-if="selected.labor > 0"><dt>투입된 노동</dt><dd>{{ numberLabel(selected.labor) }}</dd></div>
      </dl>
      <section v-if="Object.keys(selected.stock).length" class="world-panel__stock">
        <h4>{{ selected.kind === 'actor' ? '확인한 소지품' : '확인한 자원' }}</h4>
        <p v-for="(count, id) in selected.stock" :key="id">{{ resourceName(id) }} <b>{{ count }}</b></p>
      </section>
      </details>
      <section class="world-panel__actions" aria-label="가능한 행동">
        <article v-for="action in actions" :key="action.id">
          <button type="button" :disabled="!action.enabled || busy" @click="perform(action)">
            <strong>{{ action.label }}</strong>
            <span>{{ action.duration > 0 ? minutesLabel(action.duration) : '즉시' }}</span>
          </button>
          <p v-if="!action.enabled && action.reason" class="world-panel__reason">{{ action.reason }}</p>
        </article>
        <p v-if="!actions.length" class="world-panel__empty">가능한 행동 없음</p>
      </section>
    </section>

    <p v-if="feedback" role="status" aria-live="polite" class="world-panel__feedback" :class="{ 'world-panel__feedback--failed': !feedback.ok }">{{ feedback.message }}</p>

    <details class="world-panel__history">
      <summary>관찰 기록 <span>{{ observations.length }}</span></summary>
      <ol v-if="observations.length">
        <li v-for="fact in observations" :key="fact.id">
          <small>{{ clockFull(fact.turn) }} · {{ fact.sourceFactId !== undefined ? '전해 들음' : '직접 관찰' }}</small>
          <p>{{ fact.message }}</p>
        </li>
      </ol>
      <p v-else class="world-panel__empty">아직 기록한 변화가 없습니다.</p>
    </details>
  </section>
</template>

<style scoped>
.world-panel { display: grid; gap: .8rem; color: #dedfe7; font-size: .85rem; line-height: 1.5; min-width: 0; }
.world-panel h2, .world-panel h3, .world-panel h4, .world-panel p { margin: 0; }
.world-panel h2 { color: #f6e8b8; font-size: 1.16rem; margin: .2rem 0; }
.world-panel h3 { color: #f6e8b8; font-size: 1rem; }
.world-panel h4 { color: #cdd2dc; font-size: .82rem; }
.world-panel__eyebrow { color: #a9dfc0; font-size: .74rem; letter-spacing: .1em; }
.world-panel__header p, .world-panel__empty, .world-panel__target header p { color: #a9adbd; }
.world-panel button, .world-panel select { color: inherit; font: inherit; }
.world-panel button { cursor: pointer; }
.world-panel button:disabled { opacity: .5; cursor: not-allowed; }
.world-panel button:focus-visible, .world-panel select:focus-visible, .world-panel summary:focus-visible { outline: 2px solid #c08eff; outline-offset: 3px; }
.world-panel__profession { border-bottom: 1px solid #363944; padding-bottom: .65rem; color: #bec4cf; }
.world-panel summary { cursor: pointer; color: #becfdf; }
.world-panel__profession label { display: flex; gap: .75rem; align-items: center; margin: .6rem 0 .4rem; }
.world-panel select { background: #222632; border: 1px solid #667386; border-radius: 5px; padding: .35rem .5rem; }
.world-panel__profession p { font-size: .77rem; color: #a9adbd; }
.world-panel__targets { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .4rem; }
.world-panel__targets button { display: flex; flex-direction: column; align-items: flex-start; gap: .15rem; border: 1px solid #454c59; border-radius: 7px; background: #1d222c; padding: .55rem .65rem; text-align: left; min-width: 0; overflow-wrap: anywhere; }
.world-panel__targets button:hover { background: #2c3441; }
.world-panel__targets button.is-selected { border-color: #a9dfc0; background: #223c31; }
.world-panel__targets button > span, .world-panel__targets small { color: #a8b7c9; font-size: .7rem; }
.world-panel__target { display: grid; gap: .65rem; padding: .8rem; background: rgba(255,255,255,.025); border: 1px solid #465366; border-radius: 8px; min-width: 0; }
.world-panel__target header small { color: #95a0b3; font-size: .72rem; }
.world-panel__colors { display: flex; flex-wrap: wrap; gap: .3rem; }
.world-panel__colors span { padding: .15rem .4rem; border: 1px solid #4e5265; border-radius: 4px; font-size: .75rem; color: #d5c9e8; }
.world-panel__properties { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem .6rem; margin: 0; font-size: .77rem; }
.world-panel__properties > div { display: flex; justify-content: space-between; gap: .35rem; border-bottom: 1px solid #363c46; }
.world-panel__properties dt { color: #a9b4c6; }
.world-panel__properties dd { margin: 0; color: #e2e6ed; text-align: right; }
.world-panel__stock { display: grid; gap: .2rem; padding: .5rem .6rem; background: #18241f; border-radius: 5px; }
.world-panel__stock p { display: flex; justify-content: space-between; gap: .5rem; color: #bfd6c6; font-size: .78rem; }
.world-panel__actions { display: grid; gap: .55rem; }
.world-panel__actions article { display: grid; gap: .25rem; }
.world-panel__actions button { display: flex; justify-content: space-between; align-items: center; gap: .6rem; width: 100%; padding: .55rem .65rem; background: #193026; border: 1px solid #517661; border-radius: 6px; color: #d4f4e3; text-align: left; }
.world-panel__actions button:hover:not(:disabled) { background: #294b3b; }
.world-panel__actions button span { color: #b8d5c6; font-size: .72rem; flex-shrink: 0; }
.world-panel__actions article p { color: #aeb7c5; font-size: .76rem; overflow-wrap: anywhere; }
.world-panel__actions article .world-panel__reason { color: #e9b4a5; }
.world-panel__feedback { padding: .65rem; color: #cdf4d9; border: 1px solid #46795b; border-radius: 6px; background: #192e24; }
.world-panel__feedback--failed { color: #f2c1b4; border-color: #795c50; background: #30251e; }
.world-panel__history ol { padding: 0; margin: .5rem 0 0; list-style: none; display: grid; gap: .6rem; }
.world-panel__history li { border-left: 2px solid #515f73; padding-left: .6rem; }
.world-panel__history li small { color: #98a6ba; font-size: .7rem; }
.world-panel__history li p { font-size: .77rem; overflow-wrap: anywhere; }
.world-panel__history summary span { color: #91a2b8; font-size: .75rem; }
.world-panel__details > :not(summary) { margin-top: .6rem; }
.world-panel__actions { grid-template-columns: 1fr; }
.world-panel button { min-height: 44px; }
.world-panel summary { cursor: pointer; padding-block: .5rem; }
</style>
