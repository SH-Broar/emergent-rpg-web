<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Element, GridPos } from '@/data/schemas/base';
import type { InteractionWorld, WorldEntity } from '@/systems/world/types';
import { colorOperationOffers } from '@/systems/field-color-actions';
import { labelOfColor } from '@/systems/equipment';
const props=defineProps<{world:InteractionWorld;target?:WorldEntity;pos:GridPos;selected?:Element}>();
const emit=defineEmits<{close:[];choose:[color:Element,direction:'out'|'in']}>();
const colors:Element[]=['fire','water','electric','iron','earth','wind','light','dark'];
const color=ref<Element>(props.selected??'fire');
const preview=computed(()=>{
  if(props.target)return {world:props.world,id:props.target.id};
  const player=props.world.entities.player!;
  const soil=props.world.spaces?.[player.nodeId]?.tiles[props.pos.y]?.[props.pos.x]==='soil';
  const ground:WorldEntity={id:'color-preview',name:soil?'빈 밭':'바닥',kind:'terrain',nodeId:player.nodeId,pos:props.pos,
    colors:{},stock:{},tags:['ground','storage','shared'],properties:{integrity:100,soil:soil?1:0}};
  return {world:{...props.world,entities:{...props.world.entities,[ground.id]:ground}},id:ground.id};
});
const offers=computed(()=>colorOperationOffers(preview.value.world,'player',preview.value.id,color.value));
</script>
<template>
  <section class="color-panel" aria-label="컬러 조율">
    <header><strong>컬러 · {{ target?.name??'바닥' }}</strong><button aria-label="컬러 닫기" @click="emit('close')">×</button></header>
    <nav aria-label="컬러 선택"><button v-for="id in colors" :key="id" :aria-pressed="color===id" @click="color=id">{{ labelOfColor(id) }}</button></nav>
    <div class="operations"><button v-for="offer in offers" :key="offer.id" :data-ready="offer.enabled" @click="emit('choose',color,offer.direction)">
      <strong><b>{{ offer.direction==='out'?'╱':'╲' }}</b> {{ offer.label }} <small>◆{{ offer.mana }}</small></strong>
      <span>{{ offer.description }}</span><em v-if="offer.reason">{{ offer.reason }}</em>
    </button></div>
  </section>
</template>
<style scoped>
.color-panel{display:block!important}.color-panel header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.color-panel header strong{font-size:13px}.color-panel button{font:inherit;color:#dedac1;border:1px solid #758a7155;background:#263c30;border-radius:5px;cursor:pointer}.color-panel header button{width:34px;height:34px;font-size:20px}.color-panel nav{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;margin-bottom:10px}.color-panel nav button{padding:9px 0;font-size:11px}.color-panel nav button[aria-pressed=true]{background:#51583a;border-color:#e1ca90;color:#fff1c0}.operations{display:grid;grid-template-columns:1fr 1fr;gap:8px}.operations button{padding:10px;text-align:left}.operations strong{display:flex;gap:5px;align-items:center;font-size:12px}.operations b{font-size:23px;color:#d4e4d6}.operations small{margin-left:auto;color:#9bd1da}.operations span,.operations em{display:block;font-size:11px;line-height:1.6;margin-top:6px;font-style:normal}.operations span{color:#bfcbb7}.operations em{color:#d4b39f}
</style>
