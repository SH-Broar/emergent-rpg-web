<script setup lang="ts">
import { computed } from 'vue';
import { useRunStore } from '@/stores/run';
import { lifeCapabilities, PRODUCTION_MODES, type ProductionMode } from '@/systems/life-production';

defineProps<{ modelValue?: ProductionMode; showModes?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: ProductionMode] }>();
const run = useRunStore();
const level = computed(() => run.data.lifeLevel ?? 1);
const capabilities = computed(() => lifeCapabilities(level.value));
</script>

<template>
  <section class="mastery" aria-label="생활 숙련과 생산 방식">
    <div class="mastery__title"><strong>생산자 숙련 {{ level }}</strong><span>다음 숙련 {{ run.data.lifeXp ?? 0 }} / 3</span></div>
    <p>수확·채집·납품으로 생활 경험치를 얻습니다. 생산물은 마을 보급과 시설 복구에도 쓰입니다.</p>
    <ul>
      <li :class="{ unlocked: capabilities.automaticCare }">숙련 2 · 보존 관리 — 떠나 있는 동안 선택 돌봄 자동 적용</li>
      <li :class="{ unlocked: capabilities.specialization }">숙련 3 · 생산 전문화 — 다수확 또는 선별 재배 선택</li>
      <li :class="{ unlocked: capabilities.extraYield > 0 }">숙련 5 · 숙련 도구 — 모든 생산량 +1개</li>
    </ul>
    <fieldset v-if="showModes && capabilities.specialization">
      <legend>이번 생산 방식</legend>
      <label v-for="mode in PRODUCTION_MODES" :key="mode.id" :class="{ selected: modelValue === mode.id }">
        <input type="radio" name="production-mode" :value="mode.id" :checked="modelValue === mode.id" @change="emit('update:modelValue', mode.id)" />
        <span><strong>{{ mode.name }}</strong><small>{{ mode.description }}</small></span>
      </label>
    </fieldset>
  </section>
</template>

<style scoped>
.mastery { margin: 0 0 1.5rem; padding: 1rem; border: 1px solid #506348; border-radius: 10px; background: #19231b; color: #b6c9b5; font-size: .85rem; line-height: 1.55; }
.mastery__title { display: flex; justify-content: space-between; gap: 1rem; color: #d8efba; }
.mastery__title span { font-variant-numeric: tabular-nums; }
.mastery p { margin: .6rem 0; }
.mastery ul { margin: .5rem 0 0; padding-left: 1.1rem; }
.mastery li { color: #98a098; }
.mastery .unlocked { color: #bde79e; }
fieldset { margin: 1rem 0 0; padding: 0; border: 0; display: grid; gap: .5rem; }
legend { color: #edf1df; margin-bottom: .4rem; }
label { display: flex; gap: .6rem; align-items: center; padding: .6rem; border: 1px solid #485446; border-radius: 6px; cursor: pointer; }
label.selected { background: #2a3e26; border-color: #94c578; }
small { display: block; font-size: .8rem; }
input { accent-color: #bde79e; }
</style>
