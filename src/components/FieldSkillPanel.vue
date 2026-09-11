<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRunStore } from '@/stores/run';
import { GLYPHS } from '@/systems/field-types';
import { GESTURE_CATALOG } from '@/systems/gesture-catalog';
import { SKILL_GESTURES, equippedSkill, equipFieldSkill, skillUnavailable, skillMana, skillCooldown, skillRemaining, skillCastTurns, skillLoadoutLocked } from '@/systems/field-skills';
import SkillWorkshop from './SkillWorkshop.vue';
import { skillStrokes, skillFitsGesture, skillEffectText } from '@/systems/field-skill-rules';
import type { Card } from '@/data/schemas';

const props = defineProps<{open:boolean}>();
const emit = defineEmits<{close:[];guide:[id:string]}>();
const run = useRunStore();
const selected = ref<string>(SKILL_GESTURES[0]), tab = ref<'equip'|'practice'|'workshop'>('equip');
const query = ref(''), page = ref(0), all = ref(false), notice = ref('');
const current = computed(() => equippedSkill(run.data,selected.value));
const locked = computed(() => skillLoadoutLocked(run.data));
const cards = computed(() => run.data.collection.filter(c => (all.value || !skillUnavailable(c)) && c.name.includes(query.value)));
const pages = computed(() => Math.max(1,Math.ceil(cards.value.length/5)));
const visible = computed(() => cards.value.slice(page.value*5,page.value*5+5));
watch([query,all],()=>page.value=0);
watch(pages,n=>page.value=Math.min(page.value,n-1));
watch(()=>props.open,()=>notice.value='');
function equip(card?:Card) {notice.value=equipFieldSkill(run.data,selected.value,card?.instanceId)??(card?'장착했다.':'해제했다.');}
function guide(id:string) {emit('guide',id);emit('close');}
function lines(card:Card) {return skillEffectText(card);}
function brief(card:Card) {return lines(card).slice(0,3).join(' · ');}
</script>

<template>
  <div v-if="open" class="skills-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <section class="skills-panel" role="dialog" aria-modal="true" aria-label="기술 장착">
      <header><h2>기술</h2><button aria-label="기술 닫기" @click="emit('close')">×</button></header>
      <nav class="tabs"><button :aria-pressed="tab==='equip'" @click="tab='equip'">장착</button><button :aria-pressed="tab==='workshop'" @click="tab='workshop'">강화</button><button :aria-pressed="tab==='practice'" @click="tab='practice'">도형 연습</button></nav>
      <template v-if="tab==='equip'">
        <div class="slots" aria-label="기술 도형 8칸">
          <button v-for="id in SKILL_GESTURES" :key="id" :aria-pressed="selected===id" :aria-label="GLYPHS[id]+' '+(equippedSkill(run.data,id)?.name??'빈 기술 칸')" @click="selected=id;notice=''">
            <b>{{ GLYPHS[id] }}<small>{{ GESTURE_CATALOG.find(g=>g.id===id)?.strokes }}</small></b><span>{{ equippedSkill(run.data,id)?.name??'비어 있음' }}</span>
          </button>
        </div>
        <section class="chosen">
          <div><strong>{{ GLYPHS[selected] }} {{ current?.name??'기술을 골라주세요' }} <small v-if="current?.enhanceLevel">+{{ current.enhanceLevel }}</small></strong><button @click="guide(selected)">연습선</button></div>
          <template v-if="current">
            <p>{{ skillStrokes(current) }}획 이상 · ◆ {{ skillMana(current) }} <span>재사용 {{ skillCooldown(current) }}턴</span><span v-if="skillRemaining(run.data,current)">남은 {{ skillRemaining(run.data,current) }}턴</span><span v-if="skillCastTurns(current)>1">시전 {{ skillCastTurns(current) }}턴</span></p>
            <p>{{ brief(current) }}</p>
            <details v-if="lines(current).length>3"><summary>효과 더 보기</summary><p>{{ lines(current).slice(3).join(' · ') }}</p></details>
            <button class="subtle" :disabled="locked" @click="equip()">해제</button>
          </template>
        </section>
        <p v-if="locked" class="notice">안전한 곳에서 기술을 바꿀 수 있다.</p>
        <div class="filters"><input v-model="query" type="search" placeholder="기술 찾기" aria-label="기술 검색"><label><input v-model="all" type="checkbox"> 전체 카드</label></div>
        <div class="card-list">
          <div v-for="card in visible" :key="card.instanceId" class="card-row">
            <div><strong>{{ card.name }} <small v-if="card.enhanceLevel">+{{ card.enhanceLevel }}</small></strong><small>{{ skillUnavailable(card)??(skillStrokes(card)+'획↑ · ◆ '+skillMana(card)+' · 재사용 '+skillCooldown(card)+'턴') }}</small></div>
            <button :disabled="locked||!!skillUnavailable(card)||!skillFitsGesture(card,selected)" @click="equip(card)">장착</button>
          </div>
          <p v-if="!cards.length" class="empty">{{ query?'찾는 카드가 없다.':'장착할 기술이 없다. 전체 카드에서 준비 상태를 볼 수 있다.' }}</p>
        </div>
        <div class="pages"><button :disabled="page===0" aria-label="이전 카드 목록" @click="page--">‹</button><span>{{ page+1 }} / {{ pages }}</span><button :disabled="page+1>=pages" aria-label="다음 카드 목록" @click="page++">›</button></div>
      </template>
      <SkillWorkshop v-else-if="tab==='workshop'" :initial-id="current?.instanceId"/>
      <div v-else><details class="skill-help"><summary>기술 안내</summary><p>도형을 고르고 기술을 장착하세요. 카드에 적힌 획수 이상의 도형에서 사용할 수 있습니다. 원은 4획입니다.</p><p>범위를 확인하고 격자를 선택한 뒤 그리세요. 마나는 최대 3, 두 턴마다 1 회복합니다.</p><p>공방에서 남는 카드로 강화하고, 한 카드에 인챈트 하나를 새길 수 있습니다.</p></details><div class="practice">
        <button v-for="g in GESTURE_CATALOG" :key="g.id" @click="guide(g.id)"><b>{{ g.glyph }}</b><span>{{ g.name }}</span></button>
      </div>
      </div>
      <p class="notice" role="status">{{ notice }}</p>
    </section>
  </div>
</template>

<style scoped>
.skills-backdrop{position:fixed;inset:0;z-index:950;display:grid;place-items:center;padding:12px;background:#0c171bd9;color:#e5debc;font-family:'Pretendard',system-ui,sans-serif}
.skills-panel{width:min(100%,470px);max-height:calc(100dvh - 24px);overflow:auto;background:#182a22;border:1px solid #68715a;border-radius:12px;padding:16px;box-sizing:border-box}
header,.chosen>div,.filters,.card-row,.pages{display:flex;align-items:center;gap:8px}header{justify-content:space-between}h2{font-size:18px;margin:0}button,input{font:inherit}button{min-height:40px;padding:7px 12px;border:1px solid #68715a66;background:#263c30;color:#e5debc;border-radius:5px;cursor:pointer}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible{outline:2px solid #d9c88b;outline-offset:2px}header button{font-size:23px;border:0;background:none}button[aria-pressed=true]{background:#465642;border-color:#d9c88b}.tabs{display:flex;gap:6px;margin:12px 0}.tabs button{flex:1}.slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.slots button{min-width:0;padding:8px 2px;display:grid;gap:6px;justify-items:center}.slots b{font-size:26px;font-weight:400}.slots span{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.chosen{margin:14px 0;padding:12px 0;border-block:1px solid #68715a55;min-height:84px}.chosen strong{flex:1;font-size:14px}.chosen p{font-size:12px;line-height:1.6;color:#b5c0a9;margin:6px 0}.chosen span{margin-left:10px}.chosen small{color:#d9c88b}.subtle{background:none;padding:4px 12px}.filters{justify-content:space-between;margin-bottom:6px}.filters>input{min-width:0;flex:1;width:45%;background:#10231d;color:#e5debc;border:1px solid #68715a;border-radius:4px;padding:9px}.filters label{font-size:11px;white-space:nowrap}.card-row{justify-content:space-between;min-height:54px;border-bottom:1px solid #68715a33}.card-row>div{display:grid;gap:3px;min-width:0}.card-row strong{font-size:13px}.card-row small{font-size:11px;color:#b5c0a9}.card-row button{flex:none}.pages{justify-content:center;margin-top:10px;font-size:12px}.pages button{font-size:20px;min-width:40px}.notice{font-size:12px;color:#d9c88b;min-height:16px;margin:8px 0 0}.empty{font-size:13px;line-height:1.6;color:#b5c0a9}.practice{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.practice button{display:grid;gap:4px;justify-items:center}.practice b{font-size:24px}.practice span{font-size:11px}
.slots b small{font-size:10px;color:#b5c0a9;margin-left:4px}
.chosen details{font-size:12px;color:#b5c0a9}.chosen summary{cursor:pointer}
.skill-help{font-size:12px;color:#b5c0a9;margin:10px 0;line-height:1.6}.skill-help summary{cursor:pointer}
</style>
