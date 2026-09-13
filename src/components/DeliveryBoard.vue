<script setup lang="ts">
import { computed,ref } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { acceptContract,availableDeliveryContracts,canFulfill,deliveryFailure,fulfillContract,heldTradeCount,tradeItemName,type TradeRequirement } from '@/systems/delivery';
import { advanceFieldTime } from '@/systems/field-simulation';
import Collapsible from './Collapsible.vue';

const run=useRunStore(),data=useDataStore(),page=ref(0),notice=ref('');
interface Row {nodeId:string;label:string;req:TradeRequirement;accepted:boolean}
const rows=computed<Row[]>(()=>{
 const map=data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId??'');
 const active=Object.entries(run.data.tradeContracts??{}).map(([nodeId,c])=>({
  nodeId,label:map?.nodes.find(n=>n.id===nodeId)?.label??nodeId,accepted:true,
  req:{...c,element:c.element as TradeRequirement['element']},
 }));
 return [...active,...availableDeliveryContracts().map(({node,req})=>({nodeId:node.id,label:node.label,req,accepted:false}))];
});
const pages=computed(()=>Math.max(1,Math.ceil(rows.value.length/3)));
const currentPage=computed(()=>Math.min(page.value,pages.value-1));
const visible=computed(()=>rows.value.slice(currentPage.value*3,currentPage.value*3+3));
function failure(row:Row){return deliveryFailure(row.nodeId,!row.accepted)??(row.accepted&&!canFulfill(row.req)?'재료가 부족하다.':undefined);}
function act(row:Row){
 const reason=failure(row);if(reason){notice.value=reason;return;}
 if(row.accepted){
  const result=fulfillContract(row.nodeId);if(!result){notice.value='납품할 수 없다.';return;}
  notice.value=result.shards?'납품 · 시간의 조각 +'+result.shards:'납품 · 생활 경험 +'+result.lifeXp;
 }else{
  if(!acceptContract(row.nodeId)){notice.value='의뢰를 받을 수 없다.';return;}
  notice.value='의뢰를 받았다.';
 }
 advanceFieldTime(30,false);
}
</script>
<template>
 <Collapsible title="납품 의뢰" :badge="String(rows.length)">
  <div class="delivery-board">
   <article v-for="row in visible" :key="row.nodeId">
    <div><strong>{{ row.label }}</strong><small>{{ row.accepted?'받은 의뢰':'지역 의뢰' }} · {{ tradeItemName(row.req.itemId) }} {{ heldTradeCount(row.req) }}/{{ row.req.count }}</small><small v-if="row.req.itemId.startsWith('i-craft-')">시간의 조각 +{{ 3+row.req.tier }}</small></div>
    <button :disabled="!!failure(row)" :title="failure(row)" @click="act(row)">{{ row.accepted?'납품':'받기' }}</button>
   </article>
   <p v-if="!rows.length">남은 의뢰가 없다.</p>
   <nav v-if="pages>1" aria-label="납품 의뢰 페이지"><button :disabled="currentPage===0" @click="page=currentPage-1" aria-label="이전 의뢰">‹</button><span>{{ currentPage+1 }} / {{ pages }}</span><button :disabled="currentPage+1>=pages" @click="page=currentPage+1" aria-label="다음 의뢰">›</button></nav>
   <p v-if="notice" role="status">{{ notice }}</p>
  </div>
 </Collapsible>
</template>
<style scoped>
.delivery-board{display:grid;gap:8px}article{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #73806b44;padding:8px 0}strong{font-size:13px}small{display:block;font-size:11px;color:#a6b2a2;margin-top:4px}button{min-width:48px;min-height:36px;padding:5px 10px;border:1px solid #82947866;border-radius:5px;background:#344333;color:inherit}button:disabled{opacity:.4}nav{display:flex;justify-content:center;align-items:center;gap:12px;font-size:12px}p{margin:4px 0;color:#a6b2a2;font-size:12px}
</style>
