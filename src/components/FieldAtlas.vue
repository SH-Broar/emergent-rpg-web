<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { baseTown } from '@/systems/field-bases';
import { baseNode, fieldMap } from '@/systems/field-generation';
import { fieldClock } from '@/systems/field-simulation';
import { roadCount } from '@/systems/field-geography';
import { RESIDENT_EVENTS, WEEK_DAYS, worldDate, eventActive } from '@/data/npc-calendar';
import { useDataStore } from '@/stores/data';
const props=defineProps<{open:boolean}>();
const emit=defineEmits<{close:[]}>();
const run=useRunStore(),dialog=ref<HTMLDialogElement>(),mode=ref<'local'|'world'|'calendar'>('local');
const map=computed(()=>fieldMap(run.data));
const space=computed(()=>run.data.interactionWorld?.spaces?.[run.data.currentNodeId]);
const player=computed(()=>run.data.interactionWorld?.entities.player?.pos);
const current=computed(()=>baseNode(run.data));
const date=computed(()=>worldDate(run.data.field?.elapsedSeconds));
const appointments=computed(()=>RESIDENT_EVENTS.filter(e=>map.value?.nodes.some(n=>n.id===e.nodeId&&n.region===current.value?.region)));
const residents=computed(()=>[...useDataStore().npcs.values()].filter(n=>map.value?.nodes.some(p=>p.id===n.homeNodeId&&p.region===current.value?.region)));
const selectedRegion=ref(''), selectedNode=ref('');
const regions=computed(()=>map.value?.regions??[]);
const nodes=computed(()=>map.value?.nodes.filter(n=>!selectedRegion.value||n.region===selectedRegion.value)??[]);
const points=computed(()=>{
  const list=nodes.value;
  const minX=Math.min(...list.map(n=>n.position.x)),maxX=Math.max(...list.map(n=>n.position.x));
  const minY=Math.min(...list.map(n=>n.position.y)),maxY=Math.max(...list.map(n=>n.position.y));
  const scale=Math.min(450/Math.max(.001,maxX-minX),310/Math.max(.001,maxY-minY));
  return list.map(n=>({...n,x:250+(n.position.x-(minX+maxX)/2)*scale,y:180+(n.position.y-(minY+maxY)/2)*scale}));
});
const connections=computed(()=>{
  const byId=new Map(points.value.map(n=>[n.id,n])),seen=new Set<string>();
  return points.value.flatMap(a=>[...a.neighbors,...(a.conditionalNeighbors??[]).map(e=>e.nodeId)].flatMap(id=>{
    const b=byId.get(id),key=[a.id,id].sort().join('|');
    if(!b||seen.has(key))return [];
    seen.add(key);return [{key,a,b}];
  }));
});
const selection=computed(()=>map.value?.nodes.find(n=>n.id===selectedNode.value));
const neighbors=computed(()=>[...new Set([...(selection.value?.neighbors??[]),...(selection.value?.conditionalNeighbors??[]).map(e=>e.nodeId)])].flatMap(id=>{
  const node=map.value?.nodes.find(n=>n.id===id);
  return node&&map.value&&selection.value?[{...node,roads:roadCount(map.value,selection.value,node)}]:[];
}));
function selectNode(id:string){selectedNode.value=id;const n=map.value?.nodes.find(n=>n.id===id);if(selectedRegion.value&&n)selectedRegion.value=n.region??'';}
function selectRegion(){selectedNode.value=nodes.value.find(n=>n.id===current.value?.id)?.id??nodes.value[0]?.id??'';}
const colors:Record<string,string>={wall:'#253c30',water:'#78afc1',grass:'#657955',path:'#b8b38a',soil:'#96754f',stone:'#7d8380',sand:'#c5b58c',wood:'#9a8360'};
watch(()=>props.open,async open=>{if(open){mode.value='local';selectedRegion.value=current.value?.region??'';selectedNode.value=current.value?.id??'';await nextTick();dialog.value?.showModal();}else dialog.value?.close();});
</script>
<template>
  <dialog ref="dialog" class="atlas" aria-label="지도" @cancel="emit('close')" @close="emit('close')" @click="e=>{if(e.target===dialog)emit('close')}">
    <header><h2>지도</h2><button autofocus aria-label="지도 닫기" @click="emit('close')">×</button></header>
    <nav><button :aria-pressed="mode==='local'" @click="mode='local'">현재 구역</button><button :aria-pressed="mode==='world'" @click="mode='world'">세계</button><button :aria-pressed="mode==='calendar'" @click="mode='calendar'">생활</button></nav>
    <template v-if="mode==='local'&&space">
      <p>{{ space.name }} <small>· {{ space.width }} × {{ space.height }} · {{ fieldClock(run.data).slice(0,-3) }}</small></p>
      <svg :viewBox="`0 0 ${space.width*10} ${space.height*10}`" role="img" aria-label="현재 위치와 구역의 출구" class="local-map">
        <g v-for="(row,y) in space.tiles" :key="y"><rect v-for="(tile,x) in row" :key="x" :x="x*10" :y="y*10" width="9.7" height="9.7" :fill="colors[tile]"/></g>
        <rect v-for="exit in space.exits" :key="exit.to" :x="exit.pos.x*10" :y="exit.pos.y*10" width="10" height="10" fill="#f6d78a"/>
        <circle v-if="player" :cx="player.x*10+5" :cy="player.y*10+5" r="3.6" fill="#a7edee" stroke="#244040"/>
      </svg>
      <small>● 현재 위치 · ■ 이어진 길</small>
      <ul class="exits"><li v-for="exit in space.exits" :key="exit.to"><span>{{ exit.pos.y===0?'↑':exit.pos.y===space.height-1?'↓':exit.pos.x===0?'←':exit.pos.x===space.width-1?'→':'≋' }}</span>{{ exit.label }}<small v-if="exit.requirement">◇</small></li></ul>
    </template>
    <template v-else-if="mode==='world'">
      <div class="filters">
        <select v-model="selectedRegion" aria-label="지도 권역" @change="selectRegion"><option value="">전체 · {{ map?.nodes.length }}개 장소</option><option v-for="region in regions" :key="region.id" :value="region.id">{{ region.name }}</option></select>
        <select :value="selectedNode" aria-label="지도 장소" @change="selectNode(($event.target as HTMLSelectElement).value)"><option v-for="node in nodes" :key="node.id" :value="node.id">{{ node.id===current?.id?'● ':'' }}{{ node.label }}</option></select>
      </div>
      <svg viewBox="0 0 500 360" role="group" aria-label="장소와 연결 경로" class="world-map">
        <line v-for="edge in connections" :key="edge.key" :x1="edge.a.x" :y1="edge.a.y" :x2="edge.b.x" :y2="edge.b.y" stroke="#acb793" :stroke-opacity="edge.a.id===selectedNode||edge.b.id===selectedNode?1:.25"/>
        <g v-for="node in points" :key="node.id" role="button" tabindex="0" :aria-label="node.label" :aria-pressed="node.id===selectedNode" @click="selectNode(node.id)" @keydown.enter.prevent="selectNode(node.id)" @keydown.space.prevent="selectNode(node.id)"><circle :cx="node.x" :cy="node.y" :r="selectedRegion?13:5" fill="transparent"/><circle :cx="node.x" :cy="node.y" :r="node.id===current?.id?7:selectedRegion?5:2.5" :fill="node.id===current?.id?'#a7edee':run.data.nodeStates[node.id]?.visited?'#e9d29b':'#6f7b67'"/><circle v-if="node.id===selectedNode" :cx="node.x" :cy="node.y" r="10" fill="none" stroke="#efdfb7"/></g>
      </svg>
      <p class="region-name">{{ selection?.label }} <small>{{ selectedNode===current?.id?'● 현재 위치':'' }}</small></p>
      <div class="connections"><button v-for="node in neighbors" :key="node.id" @click="selectNode(node.id)">{{ node.label }} <small v-if="node.roads">· 길 {{ node.roads }}구간</small><span v-else> ↗</span></button></div>

    </template>
    <template v-else-if="mode==='calendar'">
      <p>{{ fieldClock(run.data).slice(0,-3) }} · {{ WEEK_DAYS[date.weekday] }}요일</p>
      <details><summary>거점</summary>
        <p v-for="node in map?.nodes.filter(n=>baseTown(run.data,n.id))" :key="node.id">{{ node.label }} · {{ run.data.field?.bases?.owned[node.id]?'내 집':'건축 가능' }}<small> · 공동 마당</small></p>
        <p>깨어날 집 · {{ run.data.interactionWorld?.spaces?.[run.data.field?.bases?.lastHouse??'']?.name??'일루네온의 내 집' }}</p>
        <small>내 집·숙박 중인 여관에서 기술과 직업 변경</small>
      </details>
      <p v-if="!appointments.length">이 지역에 적어 둔 약속이 없다.</p>
      <article v-for="event in appointments" :key="event.id" class="appointment">
        <strong>{{ event.title }} <small v-if="eventActive(event,run.data.field?.elapsedSeconds??0)">지금</small></strong>
        <span>{{ useDataStore().npcs.get(event.npcId)?.name }} · {{ map?.nodes.find(n=>n.id===event.nodeId)?.label }}</span>
        <small>{{ event.weekdays?event.weekdays.map(d=>WEEK_DAYS[d]).join('·')+'요일':event.days?.join('·')+'일' }} {{ event.start }}–{{ event.end }}시</small>
      </article>
      <details><summary>이웃의 집</summary><p v-for="npc in residents" :key="npc.id">{{ npc.name }} <small>{{ map?.nodes.find(n=>n.id===npc.homeNodeId)?.label }} · 주거지</small></p></details>
    </template>
  </dialog>
</template>
<style scoped>
.appointment{display:grid;gap:5px;padding:12px 0;border-bottom:1px solid #829b6b33;font-size:13px}.appointment span{font-size:12px}details{margin-top:16px}summary{cursor:pointer;font-size:13px}
.filters{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.filters select{min-width:0;width:100%;padding:8px;border:1px solid #7c8c6655;border-radius:6px;background:#2b3c2d;color:inherit;font:inherit;font-size:12px}.world-map g{cursor:pointer;outline:none}.world-map g:focus-visible circle:last-child{stroke:#fff;stroke-width:3px}.connections{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.connections button{font-size:11px;min-height:36px}.region-name{margin:0 0 10px}
.atlas{width:min(540px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;padding:18px;border:1px solid #839572;border-radius:12px;background:#1b2a21;color:#e3d9b9}.atlas::backdrop{background:#07100de0}header,nav{display:flex;align-items:center;gap:8px}header{justify-content:space-between;margin-bottom:10px}h2{margin:0;font-size:18px}button{min-height:38px;padding:7px 14px;border:1px solid #7c8c6644;border-radius:6px;color:inherit;background:#2b3c2d;font:inherit;font-size:13px}button[aria-pressed=true]{border-color:#dec788}nav button{flex:1}p{font-size:14px}small{color:#a7b598;font-size:11px}.local-map{display:block;width:min(100%,340px);margin:14px auto}.world-map{width:100%;min-height:230px;margin:12px 0}.world-map text{font-size:12px;paint-order:stroke;stroke:#1b2a21;stroke-width:3px}.exits{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0;list-style:none;font-size:12px}.exits li{display:flex;gap:7px;align-items:center}.exits span{color:#e7d08d}.visited{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}.visited span{border:1px solid #a6b68333;padding:4px 6px;border-radius:4px;font-size:11px}.visited .current{color:#a7edee;border-color:#a7edee66}button:focus-visible{outline:2px solid #e7d08d}
</style>
