<script setup lang="ts">
import type { WorldEntity } from '@/systems/world/types';
defineProps<{ entity: WorldEntity }>();
</script>
<template>
  <svg viewBox="0 0 48 52" aria-hidden="true" class="entity-art" :class="{ hostile: !!entity.creature, person: entity.kind === 'actor' }">
    <ellipse cx="24" cy="43" rx="15" ry="5" fill="#09140c" opacity=".35" />
    <g v-if="entity.id === 'player'" fill="#e6d8ad" stroke="#324b3a" stroke-width="1.8"><path d="M15 39l2-18h14l3 18-9 5z" fill="#7d9e8a"/><circle cx="24" cy="15" r="8"/><path d="M16 13l3-8 11 2 4 8" fill="#c6aa74"/><path d="M12 24l5-3M31 22l6 10M20 40v7m9-7v7"/></g>
    <g v-else-if="entity.creature && entity.creature.rank !== 'normal'" stroke="#342234" stroke-width="1.6"><path d="M12 40l6-23h12l7 23-13 5z" :fill="entity.creature.rank === 'boss' ? '#bc5f79' : '#ad7f9f'"/><circle cx="24" cy="13" r="7" fill="#dfb1b2"/><path d="M17 10l-4-7 8 4m10 3 4-7-8 4M16 25L7 37m25-12 9 12M20 42l-2 6m10-6 2 6" fill="none"/><path d="M20 14h2m4 0h2" stroke="#502431"/></g>
    <g v-else-if="entity.creature" stroke="#394431" stroke-width="1.5"><path d="M9 35l4-17 7 7 11-2 6-7 4 19-8 9H17z" fill="#baa67d"/><path d="M12 34l11 4 15-5" fill="none"/><circle cx="18" cy="31" r="2" fill="#492e35"/><circle cx="31" cy="30" r="2" fill="#492e35"/></g>
    <g v-else-if="entity.kind === 'actor'" stroke="#34443e" stroke-width="1.5">
      <path v-if="entity.agent?.species === 'moth'" d="M23 25C-5 2 3 48 22 40M26 25C52 2 48 48 27 40" fill="#c3b3dc"/>
      <path v-if="entity.agent?.species === 'slime'" d="M8 40c0-10 8-20 17-20s17 10 17 20c0 9-34 9-34 0z" fill="#8cc8bd"/>
      <g v-else><path d="M14 41l5-19h11l5 19z" fill="#9aacc9"/><circle cx="25" cy="15" r="7" fill="#d1b89a"/><path v-if="entity.agent?.species !== 'human'" d="M19 10l-7-6 2 12m17-6 7-6-2 12" fill="#ae97c3"/><path d="M20 40v7m9-7v7" fill="none"/></g>
    </g>
    <g v-else-if="entity.tags.includes('building')"><path d="M8 23h32v22H8z" fill="#b49d73" stroke="#4d513b"/><path d="M3 25L24 6l21 19z" fill="#776f58" stroke="#cec08d"/><path d="M19 31h10v14H19z" fill="#3c4737"/><path d="M10 28h7v8h-7m22-8h7v8h-7" fill="#e3c979"/></g>
    <g v-else-if="entity.tags.includes('dungeon-entry')"><path d="M5 44V26L14 9l22 1 9 18v16z" fill="#667073"/><path d="M13 44V28l6-10h13l6 10v16" fill="#181d28"/><path d="M19 41h13m-11-5h9m-6-5h5" stroke="#b9ab80" stroke-width="2"/></g>
    <g v-else-if="entity.tags.includes('barrel')"><path d="M13 13Q24 6 35 13l3 25q-14 12-28 0z" fill="#ae9868" stroke="#4a4936" stroke-width="2"/><ellipse cx="24" cy="14" rx="11" ry="5" fill="#7ec0cb"/><path d="M11 25h26M12 36h24" stroke="#d2c6a1" stroke-width="3"/></g>
    <g v-else-if="entity.tags.includes('field-plot') || entity.tags.includes('life-site')"><path d="M6 39l16-8 19 10-16 8z" fill="#745840"/><path v-if="entity.production || Object.values(entity.stock).some(n => n > 0)" d="M16 40V24m-1 8-6-6m7 2 5-7m8 22V20m0 9 7-5m-7 0-5-7" fill="none" :stroke="entity.production && !entity.production.settled ? '#83af73' : '#d6c07e'" stroke-width="3" stroke-linecap="round"/><path v-else d="M12 40l12-5m-4 10 11-5" stroke="#ac8760" stroke-width="2"/></g>
    <g v-else-if="entity.tags.includes('brush') || entity.tags.includes('flammable') && entity.kind === 'resource'"><path d="M5 39l8-19 7 7 5-18 8 20 6-12 5 24z" fill="#719267" stroke="#425f45" stroke-width="2"/><path d="M13 35l3-9m9 13 1-18m8 18 4-13" stroke="#b6c58b" stroke-width="2"/></g>
    <g v-else-if="entity.tags.includes('well')"><ellipse cx="24" cy="35" rx="17" ry="11" fill="#c0b89b"/><ellipse cx="24" cy="31" rx="12" ry="6" fill="#609aab"/><path d="M9 33v9m30-9v9" stroke="#7b8279" stroke-width="4"/></g>
    <g v-else-if="entity.tags.includes('brazier')"><path d="M12 33h24l-5 11H17z" fill="#787c78"/><path d="M16 32c-5-9 4-13 5-23 3 10 13 12 12 23" fill="#dfaa69"/><path d="M21 31l4-15 5 15" fill="#f4d7a3"/></g>
    <g v-else-if="entity.tags.includes('stone')"><path d="M8 38l4-16 16-8 13 20-7 10z" fill="#9caaad" stroke="#506563" stroke-width="2"/><path d="M12 23l13 10 15 1m-15-1 8 10m-8-10 3-17" fill="none" stroke="#cad3ca"/></g>
    <g v-else-if="entity.tags.includes('workshop')"><path d="M8 25h32v7H8zm5 7v14m23-14v14" fill="#b39d78" stroke="#73674e" stroke-width="3"/><path d="M17 15l14 9m-1-12-9 13" stroke="#c3ccc3" stroke-width="4"/></g>
    <g v-else-if="Object.values(entity.stock).some(n => n > 0) || entity.tags.includes('bundle')"><path d="M13 22l11-8 12 8 4 17-16 8L9 39z" fill="#beae84" stroke="#615941" stroke-width="2"/><path d="M10 28l28 10m-15-23 1 31" stroke="#e1d4aa" stroke-width="2"/></g>
    <g v-else><path d="M14 35l10-8 11 9-10 8z" fill="#91a888" opacity=".6"/></g>
    <path v-if="(entity.properties.burning ?? 0) > 0" d="M8 44c-4-9 3-12 4-20 2 9 10 14 8 20m11 0c-4-9 3-12 4-20 2 9 10 14 8 20" fill="#efa564"/>
    <g v-if="(entity.properties.smoke ?? 0) > 0" fill="#b5c7c3" opacity=".7"><circle cx="16" cy="13" r="11"/><circle cx="30" cy="16" r="13"/></g>
    <path v-if="(entity.properties.moisture ?? 0) > 1" d="M41 27q-8 11 0 11t0-11" fill="#99d5e3"/>
  </svg>
</template>
<style scoped>.entity-art { width: 100%; height: 108%; overflow: visible; filter: drop-shadow(0 2px 1px #10160b35); pointer-events: none; }.hostile { filter: drop-shadow(0 1px 3px #7d384738); }</style>
