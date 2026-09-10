<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { baseNode, fieldMap } from '@/systems/field-generation';
const props=defineProps<{open:boolean}>();
const emit=defineEmits<{close:[]}>();
const run=useRunStore(),dialog=ref<HTMLDialogElement>(),mode=ref<'local'|'world'>('local');
const map=computed(()=>fieldMap(run.data));
const space=computed(()=>run.data.interactionWorld?.spaces?.[run.data.currentNodeId]);
const player=computed(()=>run.data.interactionWorld?.entities.player?.pos);
const current=computed(()=>baseNode(run.data));
const selectedRegion=ref<string>();
const regions=computed(()=>{
  const groups=(map.value?.regions??[]).map(r=>{
    const nodes=map.value!.nodes.filter(n=>n.region===r.id);
    return {id:r.id,name:r.name,x:nodes.reduce((n,t)=>n+t.position.x,0)/Math.max(1,nodes.length),y:nodes.reduce((n,t)=>n+t.position.y,0)/Math.max(1,nodes.length),seen:nodes.some(n=>run.data.nodeStates[n.id]?.visited)};
  });
  const minX=Math.min(...groups.map(r=>r.x)),maxX=Math.max(...groups.map(r=>r.x)),minY=Math.min(...groups.map(r=>r.y)),maxY=Math.max(...groups.map(r=>r.y));
  const points=groups.map(r=>({...r,x:45+(r.x-minX)/Math.max(1,maxX-minX)*410,y:30+(r.y-minY)/Math.max(1,maxY-minY)*300}));
  // Preserve authored geography while separating neighboring touch targets.
  for(let pass=0;pass<30;pass++) for(let i=0;i<points.length;i++) for(let j=i+1;j<points.length;j++) {
    const a=points[i]!,b=points[j]!,dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
    if(d>=40)continue;
    const shift=(40-d)/2,ux=d?dx/d:1,uy=d?dy/d:0;
    a.x=Math.max(24,Math.min(476,a.x-ux*shift));a.y=Math.max(24,Math.min(341,a.y-uy*shift));
    b.x=Math.max(24,Math.min(476,b.x+ux*shift));b.y=Math.max(24,Math.min(341,b.y+uy*shift));
  }
  return points;
});
const connections=computed(()=>{
  const pairs=new Set<string>();
  for(const n of map.value?.nodes??[]) for(const to of [...n.neighbors,...(n.conditionalNeighbors??[]).map(e=>e.nodeId)]) {
    const other=map.value!.nodes.find(t=>t.id===to);
    if(n.region&&other?.region&&n.region!==other.region) pairs.add([n.region,other.region].sort().join('|'));
  }
  return [...pairs].map(key=>{const [a,b]=key.split('|');return {key,a:regions.value.find(r=>r.id===a)!,b:regions.value.find(r=>r.id===b)!};}).filter(p=>p.a&&p.b);
});
const selection=computed(()=>regions.value.find(r=>r.id===selectedRegion.value));
const neighbors=computed(()=>connections.value.filter(e=>e.a.id===selectedRegion.value||e.b.id===selectedRegion.value).map(e=>e.a.id===selectedRegion.value?e.b:e.a));
const visited=computed(()=>map.value?.nodes.filter(n=>n.region===selectedRegion.value&&run.data.nodeStates[n.id]?.visited)??[]);
const colors:Record<string,string>={wall:'#253c30',water:'#78afc1',grass:'#657955',path:'#b8b38a',soil:'#96754f',stone:'#7d8380'};
watch(()=>props.open,async open=>{if(open){mode.value='local';selectedRegion.value=current.value?.region;await nextTick();dialog.value?.showModal();}else dialog.value?.close();});
</script>
<template>
  <dialog ref="dialog" class="atlas" aria-label="지도" @cancel="emit('close')" @close="emit('close')" @click="e=>{if(e.target===dialog)emit('close')}">
    <header><h2>지도</h2><button autofocus aria-label="지도 닫기" @click="emit('close')">×</button></header>
    <nav><button :aria-pressed="mode==='local'" @click="mode='local'">현재 구역</button><button :aria-pressed="mode==='world'" @click="mode='world'">세계</button></nav>
    <template v-if="mode==='local'&&space">
      <p>{{ space.name }} <small>· {{ space.width }} × {{ space.height }}</small></p>
      <svg :viewBox="`0 0 ${space.width*10} ${space.height*10}`" role="img" aria-label="현재 위치와 구역의 출구" class="local-map">
        <g v-for="(row,y) in space.tiles" :key="y"><rect v-for="(tile,x) in row" :key="x" :x="x*10" :y="y*10" width="9.7" height="9.7" :fill="colors[tile]"/></g>
        <rect v-for="exit in space.exits" :key="exit.to" :x="exit.pos.x*10" :y="exit.pos.y*10" width="10" height="10" fill="#f6d78a"/>
        <circle v-if="player" :cx="player.x*10+5" :cy="player.y*10+5" r="3.6" fill="#a7edee" stroke="#244040"/>
      </svg>
      <small>● 현재 위치 · ■ 이어진 길</small>
      <ul class="exits"><li v-for="exit in space.exits" :key="exit.to"><span>{{ exit.pos.y===0?'↑':exit.pos.y===space.height-1?'↓':exit.pos.x===0?'←':exit.pos.x===space.width-1?'→':'≋' }}</span>{{ exit.label }}<small v-if="exit.requirement">◇</small></li></ul>
    </template>
    <template v-else>
      <svg viewBox="0 0 500 365" role="group" aria-label="권역과 연결 경로" class="world-map">
        <line v-for="edge in connections" :key="edge.key" :x1="edge.a.x" :y1="edge.a.y" :x2="edge.b.x" :y2="edge.b.y" stroke="#acb793" :stroke-opacity="edge.a.id===selectedRegion||edge.b.id===selectedRegion?1:.25"/>
        <g v-for="region in regions" :key="region.id" role="button" tabindex="0" :aria-label="region.name" :aria-pressed="region.id===selectedRegion" @click="selectedRegion=region.id" @keydown.enter.prevent="selectedRegion=region.id" @keydown.space.prevent="selectedRegion=region.id"><circle :cx="region.x" :cy="region.y" r="19" fill="transparent"/><circle :cx="region.x" :cy="region.y" :r="region.id===current?.region?9:6" :fill="region.id===current?.region?'#a7edee':region.seen?'#e9d29b':'#6f7b67'"/><circle v-if="region.id===selectedRegion" :cx="region.x" :cy="region.y" r="15" fill="none" stroke="#efdfb7"/></g>
      </svg>
      <p class="region-name">{{ selection?.name }} <small>{{ selectedRegion===current?.region?'● 현재 권역':'' }}</small></p>
      <div class="connections"><button v-for="region in neighbors" :key="region.id" @click="selectedRegion=region.id">{{ region.name }} ↗</button></div>
      <small>밝혀진 장소 {{ visited.length }}</small>
      <div class="visited"><span v-for="node in visited" :key="node.id" :class="{current:node.id===current?.id}">{{ node.label }}</span></div>
    </template>
  </dialog>
</template>
<style scoped>
.world-map g{cursor:pointer;outline:none}.world-map g:focus-visible circle:last-child{stroke:#fff;stroke-width:3px}.connections{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 12px}.connections button{font-size:11px;min-height:36px}.region-name{margin:0 0 10px}
.atlas{width:min(540px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;padding:18px;border:1px solid #839572;border-radius:12px;background:#1b2a21;color:#e3d9b9}.atlas::backdrop{background:#07100de0}header,nav{display:flex;align-items:center;gap:8px}header{justify-content:space-between;margin-bottom:10px}h2{margin:0;font-size:18px}button{min-height:38px;padding:7px 14px;border:1px solid #7c8c6644;border-radius:6px;color:inherit;background:#2b3c2d;font:inherit;font-size:13px}button[aria-pressed=true]{border-color:#dec788}nav button{flex:1}p{font-size:14px}small{color:#a7b598;font-size:11px}.local-map{display:block;width:min(100%,340px);margin:14px auto}.world-map{width:100%;min-height:230px;margin:12px 0}.world-map text{font-size:12px;paint-order:stroke;stroke:#1b2a21;stroke-width:3px}.exits{display:grid;grid-template-columns:1fr 1fr;gap:9px;padding:0;list-style:none;font-size:12px}.exits li{display:flex;gap:7px;align-items:center}.exits span{color:#e7d08d}.visited{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}.visited span{border:1px solid #a6b68333;padding:4px 6px;border-radius:4px;font-size:11px}.visited .current{color:#a7edee;border-color:#a7edee66}button:focus-visible{outline:2px solid #e7d08d}
</style>
