<script setup lang="ts">
import { computed } from 'vue';
import type { WorldEntity } from '@/systems/world/types';
import { fieldStatusFeedback } from '@/systems/field-status-feedback';

const props=defineProps<{entity?:WorldEntity;transformed?:boolean}>();
const feedback=computed(()=>fieldStatusFeedback(props.entity,props.transformed));
</script>

<template>
  <div v-if="feedback" class="status-feedback" :data-status="feedback.id" :style="{'--status-tint':feedback.tint,'--status-edge':feedback.edge}" aria-hidden="true">
    <div class="status-veil"/>
    <svg class="status-marks" viewBox="0 0 400 400" preserveAspectRatio="none">
      <g v-for="mark in feedback.marks" :key="mark" :class="'mark--'+mark">
        <g v-if="mark==='grasp'"><path d="M0 38Q36 56 8 86T5 146M400 42Q365 68 394 108T393 180M12 400q9-38 25-14t27 14M388 400q-9-38-25-14t-27 14"/></g>
        <g v-else-if="mark==='drowsy'"><path d="M0 18q200 35 400 0M0 382q200-35 400 0"/><path d="m30 14 4 15m72-6 1 12m184-12-1 12m73-20-4 15"/></g>
        <g v-else-if="mark==='fracture'"><path d="m0 100 14 14-7 18 14 15-7 15m386-48-16 14 9 19-16 15 9 19M20 400l18-16 17 8 20-19m260 27-13-18 8-14-17-20"/></g>
        <g v-else-if="mark==='embers'"><path d="M20 400q-16-18 2-39 1 18 11 19t0 20m47 0q-8-14 3-24 0 14 8 24m271 0q19-21-2-39-1 18-11 19t0 20m-42 0q8-14-3-24 0 14-8 24"/><circle cx="18" cy="330" r="2"/><circle cx="378" cy="313" r="2"/><circle cx="49" cy="365" r="1.5"/></g>
        <g v-else-if="mark==='drops'"><path d="M13 89q-11 18 0 18t0-18m372 65q-11 18 0 18t0-18M30 344q-8 15 0 15t0-15m348-80q-8 15 0 15t0-15"/><path d="M0 388q48-17 80 12m320-12q-48-17-80 12"/></g>
        <g v-else-if="mark==='runes'"><path d="m12 40 10 10-10 10L2 50zM7 120h15m-8-8v25m371 21 10 10-10 10-10-10zM370 290h18m-9-10v25M40 393l10-10 10 10m280 0 10-10 10 10"/></g>
        <g v-else-if="mark==='haze'"><path d="M0 80q40 20 0 40t0 50m400-90q-40 20 0 40t0 50M0 358q40-20 80 10m320-10q-40-20-80 10"/></g>
        <g v-else-if="mark==='claws'"><path d="m3 70 16 34M3 83l12 27M3 97l9 22m385-49-16 34m16-21-12 27m12-13-9 22M23 400l18-24m-7 24 16-18m316 18-18-24m7 24-16-18"/></g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.status-feedback{position:absolute;inset:0;z-index:5;pointer-events:none;overflow:hidden;contain:strict}
.status-veil{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgb(var(--status-tint) / calc(var(--status-edge) * .4)) 78%,rgb(var(--status-tint) / var(--status-edge)) 100%)}
.status-marks{position:absolute;inset:0;width:100%;height:100%;fill:none;stroke:rgb(var(--status-tint));stroke-width:2;opacity:.58}
.mark--embers{fill:rgb(var(--status-tint));stroke-width:1}
.mark--drops{fill:rgb(var(--status-tint) / .16)}
.mark--haze{stroke-width:8;opacity:.24}
[data-status=devour] .status-veil{background:radial-gradient(ellipse at center,rgb(25 14 30 / .035) 15%,rgb(25 14 30 / .12) 65%,rgb(25 14 30 / .38) 100%)}
[data-status=sleep] .status-veil{background:linear-gradient(rgb(24 30 58 / .3),transparent 28%,transparent 72%,rgb(24 30 58 / .22))}
@media(prefers-reduced-motion:reduce){.status-feedback{animation:none;transition:none}}
@media(prefers-contrast:more){.status-veil{opacity:.45}.status-marks{opacity:.8}}
</style>
