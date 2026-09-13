<script setup lang="ts">
import type { WorldEntity } from '@/systems/world/types';
import { creatureIntent } from '@/systems/field-ai';
defineProps<{entity:WorldEntity}>();
</script>
<template><span class="intent-mark" :class="{ opening:entity.creature?.nextAction?.kind==='recover' }" :title="creatureIntent(entity).label" :aria-label="'다음 의도: '+creatureIntent(entity).label">{{ creatureIntent(entity).glyph }}</span></template>
<style scoped>.intent-mark{position:absolute;right:0;top:-4px;min-width:18px;padding:0 3px;height:18px;line-height:18px;border-radius:6px;font-size:12px;font-weight:bold;background:#d88875;color:#31201d;z-index:8;white-space:nowrap;pointer-events:none}.intent-mark.opening{background:#c9e1a4;color:#244335;box-shadow:0 0 0 1px #314937}</style>
