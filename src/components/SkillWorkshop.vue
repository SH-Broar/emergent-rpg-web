<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { SKILL_UPGRADES, ENCHANTMENTS, upgradeQuote, upgradeSkill, materialFailure, atSkillWorkshop, enchantSkill, enchantFailure, ENCHANT_SHARDS, type SkillUpgradePath } from '@/systems/skill-workshop';
import { skillStrokes, skillMana, skillCooldown } from '@/systems/field-skill-rules';
import { skillUnavailable } from '@/systems/field-skills';
import type { Card } from '@/data/schemas';

const props=defineProps<{initialId?:string}>();
const run=useRunStore(), targetId=ref(props.initialId??run.data.collection.find(c=>!skillUnavailable(c))?.instanceId??'');
const mode=ref<'upgrade'|'enchant'>('upgrade'),path=ref<SkillUpgradePath>('power');
const materials=ref<string[]>([]),page=ref(0),notice=ref(''),enchantment=ref<NonNullable<Card['enchantment']>>('ember');
const card=computed(()=>run.data.collection.find(c=>c.instanceId===targetId.value));
const targets=computed(()=>run.data.collection.filter(c=>!skillUnavailable(c)));
const quote=computed(()=>card.value?upgradeQuote(card.value,path.value):undefined);
const candidates=computed(()=>run.data.collection.filter(c=>!!c.instanceId&&!materialFailure(run.data,c,targetId.value)));
const pages=computed(()=>Math.max(1,Math.ceil(candidates.value.length/4)));
const visible=computed(()=>candidates.value.slice(page.value*4,page.value*4+4));
const here=computed(()=>atSkillWorkshop(run.data));
const enchantReason=computed(()=>card.value?enchantFailure(run.data,card.value,enchantment.value):'기술을 선택하세요.');
watch([targetId,path],()=>{materials.value=[];page.value=0;notice.value='';});
watch(pages,n=>page.value=Math.min(page.value,n-1));
watch(()=>props.initialId,id=>{if(id)targetId.value=id;});
function toggle(id:string){if(materials.value.includes(id))materials.value=materials.value.filter(x=>x!==id);else if(materials.value.length<(quote.value?.cards??0))materials.value.push(id);}
function upgrade(){const error=upgradeSkill(run.data,targetId.value,materials.value,path.value);notice.value=error??'강화했다.';if(!error)materials.value=[];}
function enchant(){notice.value=enchantSkill(run.data,targetId.value,enchantment.value)??'인챈트를 새겼다.';}
</script>

<template>
  <section class="skill-workshop">
    <label class="target-label">기술<select v-model="targetId" aria-label="강화할 기술"><option value="" disabled>카드 선택</option><option v-for="c in targets" :key="c.instanceId" :value="c.instanceId">{{ c.name }} +{{ c.enhanceLevel??0 }}</option></select></label>
    <p v-if="card" class="meta">{{ skillStrokes(card) }}획 이상 · ◆ {{ skillMana(card) }} · 재사용 {{ skillCooldown(card) }}턴 <span v-if="card.enchantment"> / {{ ENCHANTMENTS.find(e=>e.id===card!.enchantment)?.name }}</span></p>
    <nav><button :aria-pressed="mode==='upgrade'" @click="mode='upgrade'">강화</button><button :aria-pressed="mode==='enchant'" @click="mode='enchant'">인챈트</button></nav>
    <p v-if="!here" class="notice">공방 가까이에서 작업할 수 있다.</p>
    <template v-if="card&&mode==='upgrade'">
      <div class="paths"><button v-for="p in SKILL_UPGRADES" :key="p.id" :aria-pressed="path===p.id" @click="path=p.id"><strong>{{ p.name }}</strong><small>{{ p.description }}</small></button></div>
      <div v-if="quote" class="quote"><strong>{{ SKILL_UPGRADES.find(p=>p.id===path)?.name }} {{ quote.before }} → {{ quote.after }}</strong><span>카드 {{ quote.cards }}장<span v-if="quote.shards"> · 조각 {{ quote.shards }}</span></span></div>
      <p v-if="quote?.reason" class="notice">{{ quote.reason }}</p>
      <template v-else>
        <p class="material-label">소모할 카드 {{ materials.length }}/{{ quote?.cards }}</p>
        <div class="materials"><button v-for="c in visible" :key="c.instanceId" :aria-pressed="materials.includes(c.instanceId!)" @click="toggle(c.instanceId!)"><span>{{ materials.includes(c.instanceId!)?'☑':'□' }} {{ c.name }}</span><small>+{{ c.enhanceLevel??0 }}</small></button></div>
        <div class="pages"><button :disabled="page===0" aria-label="이전 재료" @click="page--">‹</button><span>{{ page+1 }}/{{ pages }}</span><button :disabled="page+1>=pages" aria-label="다음 재료" @click="page++">›</button></div>
        <p v-if="materials.length" class="consumed">{{ run.data.collection.filter(c=>materials.includes(c.instanceId??'')).map(c=>c.name).join(', ') }} 소모</p>
        <button class="commit" :disabled="!here||materials.length!==quote?.cards||run.data.timeShards<(quote?.shards??0)" @click="upgrade">선택한 카드로 강화</button>
      </template>
    </template>
    <template v-if="card&&mode==='enchant'">
      <div class="enchantments"><button v-for="e in ENCHANTMENTS" :key="e.id" :aria-pressed="enchantment===e.id" @click="enchantment=e.id"><strong>{{ e.name }}</strong><small>{{ e.description }}</small></button></div>
      <p class="meta">조각 {{ ENCHANT_SHARDS }} · 가공 재료 2개</p>
      <p v-if="card.enchantment" class="consumed">{{ ENCHANTMENTS.find(e=>e.id===card!.enchantment)?.name }} → {{ ENCHANTMENTS.find(e=>e.id===enchantment)?.name }}</p>
      <p v-if="enchantReason" class="notice">{{ enchantReason }}</p>
      <button class="commit" :disabled="!!enchantReason" @click="enchant">{{ card.enchantment?'인챈트 교체':'이 카드에 새기기' }}</button>
    </template>
    <p class="notice" role="status">{{ notice }}</p>
  </section>
</template>

<style scoped>
.skill-workshop{color:#e5debc;font-family:'Pretendard',system-ui,sans-serif;font-size:13px}.target-label{display:flex;align-items:center;gap:10px}select{min-width:0;flex:1;padding:10px;background:#182a22;color:#e5debc;border:1px solid #68715a;border-radius:4px;font:inherit}button{min-height:38px;padding:7px 10px;border:1px solid #68715a88;border-radius:5px;background:#263c30;color:#e5debc;font:inherit;cursor:pointer}button:disabled{opacity:.45;cursor:default}button[aria-pressed=true]{border-color:#d9c88b;background:#465642}button:focus-visible,select:focus-visible{outline:2px solid #e5d299;outline-offset:2px}nav{display:flex;gap:5px;margin:12px 0}nav button{flex:1}.paths{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.paths button,.enchantments button{display:grid;gap:4px;justify-items:start}.paths small,.enchantments small{font-size:11px;color:#b5c0a9}.quote{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:12px 0;border-bottom:1px solid #68715a55}.quote span{font-size:12px}.meta,.notice,.consumed,.material-label{font-size:12px;line-height:1.5}.meta{color:#b5c0a9}.notice{color:#d9c88b;min-height:16px}.materials{display:grid;gap:4px}.materials button{display:flex;justify-content:space-between;gap:8px}.materials span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pages{display:flex;align-items:center;justify-content:center;gap:12px;margin:8px}.pages button{font-size:20px}.commit{width:100%;border-color:#d9c88b;background:#465642}.consumed{color:#dda794}.enchantments{display:grid;gap:6px}
</style>
