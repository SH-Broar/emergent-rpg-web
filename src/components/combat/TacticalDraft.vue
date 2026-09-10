<script setup lang="ts">
import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import { chooseTacticalReward } from '@/systems/tactical-cards';

const run = useRunStore();
const ui = useUiStore();
const choices = computed(() => run.data.tacticalDraft ?? []);

function choose(index: number | null) {
  const name = index === null ? '' : choices.value[index]?.name;
  if (!chooseTacticalReward(index)) {
    ui.toast('warning', '카드 선택 상태가 바뀌었습니다. 남은 선택지를 확인하세요.');
    return;
  }
  ui.toast('success', index === null ? '이번 카드 보상을 건너뛰었습니다.' : `${name} — 현재 덱과 컬렉션에 추가했습니다.`);
}
</script>

<template>
  <section v-if="choices.length" class="tactical-draft" aria-label="전술 카드 보상">
    <header class="tactical-draft__heading">
      <div>
        <h2>카드 선택</h2>
        <details><summary>덱에 추가</summary><p>덱이 가득 차면 기본 카드부터 교체합니다. 교체된 카드는 컬렉션에 남습니다.</p></details>
      </div>
      <button class="tactical-draft__skip" @click="choose(null)">건너뛰기</button>
    </header>
    <div class="tactical-draft__choices">
      <button v-for="(card, index) in choices" :key="card.instanceId ?? card.id" class="tactical-draft__card" @click="choose(index)">
        <span class="tactical-draft__cost">마나 {{ card.cost ?? 0 }}</span>
        <strong>{{ card.name }}</strong>
        <span class="tactical-draft__effect">{{ card.description }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.tactical-draft { width: 100%; padding: 1rem; background: #202438; border: 1px solid #66638b; border-radius: 10px; text-align: left; box-sizing: border-box; }
.tactical-draft__heading { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 0.9rem; }
.tactical-draft h2 { margin: 0; color: #efe3ff; font-size: 1.12rem; }
.tactical-draft p { margin: 0.4rem 0 0; color: #c0bdd2; font-size: 0.82rem; line-height: 1.5; max-width: 60ch; }
.tactical-draft__skip { flex-shrink: 0; padding: 0.5rem; border: 1px solid #74708b; background: transparent; color: #d6d1e4; font: inherit; font-size: 0.76rem; border-radius: 5px; cursor: pointer; }
.tactical-draft__choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.65rem; }
.tactical-draft__card { display: flex; flex-direction: column; gap: 0.55rem; min-height: 180px; padding: 0.85rem; background: #161c2d; border: 1px solid #827eaa; border-radius: 8px; text-align: left; color: #e9e7f1; font: inherit; cursor: pointer; }
.tactical-draft__card:hover { border-color: #e3c780; background: #2c2c42; }
.tactical-draft__cost { color: #b8adcf; font-size: 0.73rem; }
.tactical-draft__card strong { color: #f1e0b8; font-size: 1rem; }
.tactical-draft__effect { font-size: 0.82rem; line-height: 1.6; color: #d1ccdf; }
.tactical-draft__pick { margin-top: auto; padding-top: 0.45rem; font-size: 0.76rem; color: #c6dfb1; }
.tactical-draft button:focus-visible { outline: 3px solid #ffe19a; outline-offset: 3px; }
@media (max-width: 620px) {
  .tactical-draft__heading { flex-direction: column; gap: 0.6rem; }
  .tactical-draft__choices { grid-template-columns: 1fr; }
  .tactical-draft__card { min-height: 0; gap: 0.4rem; }
}
</style>
