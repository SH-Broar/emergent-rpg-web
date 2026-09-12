<script setup lang="ts">
import { computed,ref } from 'vue';
import { useRunStore } from '@/stores/run';
import { SUPPLY_RECIPES,craftSupply,supplyStation } from '@/systems/field-supplies';
import { distance } from '@/systems/world/spatial';
import { fieldItemName } from '@/systems/field-generation';
import { advanceFieldTime } from '@/systems/field-simulation';
import { syncPlayerFromWorld } from '@/systems/world-interaction';
defineProps<{open:boolean}>();const emit=defineEmits<{close:[]}>();const run=useRunStore(),notice=ref('');
const world=computed(()=>run.data.interactionWorld!),player=computed(()=>world.value.entities.player!);
const station=computed(()=>Object.values(world.value.entities).find(e=>e.pos&&player.value.pos&&e.nodeId===player.value.nodeId&&(e.properties.integrity??100)>0&&supplyStation(e)&&distance(e.pos,player.value.pos)<=1));
function enough(input:Record<string,number>){return Object.entries(input).every(([id,n])=>(player.value.stock[id]??0)>=n);}
function make(id:string){if(!station.value)return;const result=craftSupply(run.data,world.value,station.value.id,id);notice.value=result.message;if(result.ok){run.addLifeXp(1);syncPlayerFromWorld(run.data,world.value);run.data.field!.selectedItem=Object.keys(SUPPLY_RECIPES.find(r=>r.id===id)!.output)[0];advanceFieldTime(30,false);}}
</script>
<template><div v-if="open" class="craft-backdrop" @click.self="emit('close')"><section role="dialog" aria-modal="true" aria-label="도구 가공"><header><strong>가공 <small>{{ station?.name??'작업대 가까이에서' }}</small></strong><button aria-label="가공 닫기" @click="emit('close')">×</button></header><article v-for="recipe in SUPPLY_RECIPES" :key="recipe.id"><div><strong>{{ recipe.name }} ×{{ Object.values(recipe.output)[0] }}</strong><p>{{ recipe.effect }}</p><small><span v-for="[id,n] in Object.entries(recipe.input)" :key="id" :class="{missing:(player.stock[id]??0)<n}">{{ fieldItemName(id) }} {{ player.stock[id]??0 }}/{{ n }} </span></small></div><button :disabled="!station||!enough(recipe.input)" @click="make(recipe.id)">만들기</button></article><p class="hint">손에 고른 뒤 ╲ 그리기</p><p role="status">{{ notice }}</p></section></div></template>
<style scoped>.craft-backdrop{position:fixed;inset:0;background:#102019da;z-index:955;display:grid;place-items:center;padding:12px;color:#e5debc}.craft-backdrop section{width:min(100%,430px);max-height:88dvh;overflow:auto;background:#182a22;border:1px solid #68715a;border-radius:12px;padding:16px;box-sizing:border-box}header,article{display:flex;align-items:center;justify-content:space-between;gap:10px}header{margin-bottom:12px}header small{display:block;color:#a7b8a3;font-size:11px;margin-top:4px}article{padding:14px 0;border-top:1px solid #70826844}article strong{font-size:14px}p{font-size:12px;color:#c0cab5;margin:6px 0}small{font-size:11px;color:#9eaf96}.missing{color:#c79280}button{min-height:38px;border:1px solid #8a9474;border-radius:4px;background:#344a38;color:#f0e3bd;padding:5px 12px;font:inherit}button:disabled{opacity:.4}.hint{text-align:center;color:#dacb95}</style>
