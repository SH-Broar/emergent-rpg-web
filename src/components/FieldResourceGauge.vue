<script setup lang="ts">
import { computed } from 'vue';
import type { WorldEntity } from '@/systems/world/types';
import { resourceGauge } from '@/systems/field-forage';
const props=defineProps<{entity:WorldEntity}>();const gauge=computed(()=>resourceGauge(props.entity));
</script>
<template><span v-if="gauge" class="resource-gauge" :class="{empty:gauge.remaining===0}" role="meter" :aria-label="entity.name+' 남은 수량'" :aria-valuenow="gauge.remaining" :aria-valuemin="0" :aria-valuemax="gauge.capacity"><i :style="{width:gauge.ratio*100+'%'}"/><b>{{ gauge.remaining }}</b></span></template>
<style scoped>.resource-gauge{position:absolute;bottom:0;left:12%;width:76%;height:5px;border:1px solid #202d27;background:#26362f;border-radius:3px;z-index:5;pointer-events:none}.resource-gauge i{display:block;height:100%;background:#dac37e;border-radius:inherit}.resource-gauge b{position:absolute;right:-4px;bottom:3px;color:#fff1c8;background:#23352ecc;border-radius:3px;padding:0 2px;font-size:10px;line-height:13px}.resource-gauge.empty{opacity:.5}</style>
