<script setup lang="ts">
import { resolveFieldEncounter } from '@/systems/field-combat';
import { statusEntries, STATUS_HELP } from '@/systems/world/status';
import { statusLabel } from '@/systems/labels';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import type { GridPos } from '@/data/schemas/base';
import { GLYPHS, type Gesture, type FieldSpeech } from '@/systems/field-types';
import { fieldItemName, FIELD_ITEMS } from '@/systems/field-generation';
import { advanceFieldTime, carriedEntity, dashFailure, ensureField, fieldHints, gestureLevel, performFieldGesture, performFieldService, setFieldViewport, stepField, visibleFieldEntities } from '@/systems/field-simulation';
import { PRODUCTION_MODES } from '@/systems/life-production';
import { createFieldIdleClock } from '@/systems/field-idle';
import { cardinal, distance, fieldPath, positionKey, walkable } from '@/systems/world/spatial';
import FieldSkillPanel from '@/components/FieldSkillPanel.vue';
import { SKILL_GESTURES, equippedSkill, fieldSkillCells, skillRemaining, fieldSkillMana } from '@/systems/field-skills';
import GesturePad from '@/components/GesturePad.vue';
import FieldEntityGlyph from '@/components/FieldEntityGlyph.vue';
import FieldStatusFeedback from '@/components/FieldStatusFeedback.vue';
import SettingsMenu from '@/components/SettingsMenu.vue';
import FieldAtlas from '@/components/FieldAtlas.vue';
import CharacterMenu from '@/components/CharacterMenu.vue';
import InventoryMenu from '@/components/InventoryMenu.vue';

const run = useRunStore(), ui = useUiStore(), router = useRouter();
const initialized = ref(false), moving = ref(false), bagOpen = ref(false), skillsOpen = ref(false), settingsOpen = ref(false);
const mapOpen=ref(false),drawing=ref(false),pointerHeld=ref(false),hidden=ref(document.hidden),guide=ref<string>();
const progressOpen=ref(false),detailsOpen=ref(false),characterOpen=ref(false),inventoryOpen=ref(false);
const idle=createFieldIdleClock();
let idleTimer:ReturnType<typeof setInterval>|undefined;
const paused=computed(()=>moving.value||drawing.value||pointerHeld.value||hidden.value||bagOpen.value||skillsOpen.value||settingsOpen.value||mapOpen.value||detailsOpen.value||progressOpen.value||characterOpen.value||inventoryOpen.value||aimDash.value||!!speech.value||!!run.data.field?.encounter||ui.tutorialTopic!==null);
function wake(){idle.reset(Date.now());}
function press(){pointerHeld.value=true;wake();}
function release(){pointerHeld.value=false;wake();}
function visibility(){hidden.value=document.hidden;wake();}
const aimSkill=ref<string>();
const aimDash=ref(false), routeCells=ref<GridPos[]>([]);
const selectedId = ref<string>(), selectedPos = ref<GridPos>({ x: 0, y: 0 });
const notice = ref(''), speech = ref<FieldSpeech>(), line = ref(0);
const stageElement = ref<HTMLElement | null>(null), width = ref(390), height = ref(430);
let observer: ResizeObserver | undefined, timer: ReturnType<typeof setTimeout> | undefined, movement = 0;
const world = computed(() => run.data.interactionWorld!);
const player = computed(() => world.value?.entities.player);
const space = computed(() => world.value?.spaces?.[run.data.currentNodeId]);
const entities = computed(() => initialized.value ? visibleFieldEntities(run.data) : []);
const held = computed(() => initialized.value ? carriedEntity(world.value) : undefined);
const target = computed(() => {
  const e=selectedId.value==='player'?player.value:entities.value.find(e=>e.id===selectedId.value)??(held.value?.id===selectedId.value?held.value:undefined);
  return e&&e.nodeId===run.data.currentNodeId&&(!e.creature||(e.properties.integrity??100)>0)?e:undefined;
});
const selection=computed(()=>target.value?.carriedBy===player.value?.id?player.value?.pos??selectedPos.value:target.value?.pos??selectedPos.value);
const dashKeys=computed(()=>new Set(aimDash.value&&space.value&&player.value?cells.value.filter(p=>!dashFailure(world.value,space.value!,player.value!,p)).map(positionKey):[]));
const selectedSkill=computed(()=>aimSkill.value?equippedSkill(run.data,aimSkill.value):undefined);
const skillKeys=computed(()=>new Set(selectedSkill.value&&player.value?fieldSkillCells(world.value,player.value,selectedSkill.value,selection.value).map(c=>positionKey(c.pos)):[]));
function prepareSkill(id:string){stop();aimDash.value=false;aimSkill.value=id;guide.value=id;wake();}
const pathKeys=computed(()=>new Set(routeCells.value.map(positionKey)));
const effects=ref<{id:number;pos:GridPos;text:string;kind:string}[]>([]);
let effectCursor=0;
watch(()=>world.value?.sequence,()=>{
  if(!initialized.value)return;
  const fresh=world.value.events.filter(f=>f.id>effectCursor);
  effectCursor=world.value.sequence;
  for(const f of fresh){
    if(f.nodeId!==run.data.currentNodeId||!f.pos)continue;
    const e=world.value.entities[f.targetId];
    let text='',kind='damage';
    if(f.property==='integrity'&&f.before!==undefined&&f.after!==undefined){
      const n=Math.round((f.after-f.before)*(e?.properties.maxHp??100)/100);
      if(n!==0){text=n>0?'+'+n:String(n);kind=n>0?'heal':'damage';}
    } else if(f.property==='guard'&&(f.before??0)>(f.after??0)&&f.actorId!==undefined){text='방어 '+Math.round(f.before!-f.after!);kind='guard';}
    else if(f.kind==='signal'&&['빗나감','변신 저항'].includes(f.message)){text=f.message;kind='miss';}
    if(text){effects.value.push({id:f.id,pos:{...f.pos},text,kind});setTimeout(()=>effects.value=effects.value.filter(x=>x.id!==f.id),1600);}
  }
  effects.value=effects.value.slice(-24);
},{flush:'post'});
watch(()=>run.data.field?.notification,n=>{if(n){stop();speech.value=n;line.value=0;run.data.field!.notification=undefined;}});
const encounter=computed(()=>run.data.field?.encounter);
watch(encounter,e=>{if(e){stop();speech.value=e;line.value=0;}});
function encounterChoice(accept:boolean){resolveFieldEncounter(run.data,accept);speech.value=undefined;advanceFieldTime(0);wake();}
const imminent=computed(()=>new Set(entities.value.flatMap(e=>e.creature?.pending?.remaining===1?e.creature.intent??[]:[]).map(positionKey)));

const targetName = computed(() => target.value?.name ?? space.value?.exits.find(e => distance(e.pos, selectedPos.value) === 0)?.label ?? (space.value?.tiles[selectedPos.value.y]?.[selectedPos.value.x] === 'soil' ? '빈 밭' : '바닥'));
const inventory = computed(() => Object.entries(player.value?.stock ?? {}).filter(([, n]) => n > 0));
const targetStock = computed(() => target.value?.id === 'player' ? [] : Object.entries(target.value?.stock ?? {}).filter(([, n]) => n > 0));
const layeredTargets = computed(() => at(target.value?.pos ?? selectedPos.value));
const columns = computed(() => Math.min(space.value?.width??6,Math.max(4, Math.min(11, Math.floor(width.value / 48)))));
const rows = computed(() => Math.min(space.value?.height??6,Math.max(4, Math.min(9, Math.floor(height.value / 48)))));
watch([columns,rows],([columns,rows])=>setFieldViewport({columns,rows}),{immediate:true,flush:'sync'});
watch(paused,wake,{flush:'sync'});
const tileSize = computed(() => Math.floor(Math.min(width.value / columns.value, height.value / rows.value)));
const camera = computed(() => ({ x: Math.max(0, Math.min((space.value?.width ?? 15) - columns.value, (player.value?.pos?.x ?? 7) - Math.floor(columns.value / 2))), y: Math.max(0, Math.min((space.value?.height ?? 13) - rows.value, (player.value?.pos?.y ?? 6) - Math.floor(rows.value / 2))) }));
const cells = computed(() => Array.from({ length: rows.value * columns.value }, (_, i) => ({ x: camera.value.x + i % columns.value, y: camera.value.y + Math.floor(i / columns.value) })));
const danger = computed(() => new Set(entities.value.flatMap(e => e.creature?.intent ?? []).map(positionKey)));
const hints=computed(()=>initialized.value?fieldHints(run.data,world.value,target.value,selection.value):[]);
function at(p: GridPos) { return entities.value.filter(e => e.pos && distance(e.pos, p) === 0).sort((a,b) => Number(a.kind === 'actor') - Number(b.kind === 'actor')); }
function tile(p: GridPos) { return space.value?.tiles[p.y]?.[p.x] ?? 'wall'; }
function exitAt(p: GridPos) { return space.value?.exits.find(e => distance(e.pos, p) === 0); }
function label(p: GridPos) { return `${p.x + 1}열 ${p.y + 1}행, ${at(p).map(e => e.name).join(', ') || (exitAt(p)?.label ?? (tile(p) === 'wall' ? '벽' : tile(p) === 'soil' ? '밭' : '빈 칸'))}`; }
function selectSelf() { aimSkill.value=undefined;aimDash.value=false; selectedId.value = 'player'; if (player.value?.pos) selectedPos.value = { ...player.value.pos }; }
function say(text: string) { notice.value = text; clearTimeout(timer); if (text) timer = setTimeout(() => notice.value = '', 3500); }
function stop() { movement++; moving.value = false; routeCells.value=[]; }
async function clickCell(pos: GridPos) {
  if (!player.value?.pos || speech.value || run.data.ended) return;
  stop();
  if(aimDash.value){
    const result=performFieldGesture('dash',undefined,pos,{quality:1,drawn:true});
    say(result.message);if(result.ok){aimDash.value=false;selectSelf();}
    wake();return;
  }
  if(aimSkill.value){selectedId.value=at(pos).find(e=>e.kind==='actor')?.id;selectedPos.value={...pos};wake();return;}
  const candidates = at(pos);
  const e = candidates.find(e=>e.id===selectedId.value)??candidates.find(e => e.kind === 'actor') ?? candidates.at(-1);
  selectedId.value = e?.id;
  selectedPos.value = { ...pos };
  if (e?.kind === 'actor') return;
  const near = !!held.value || !!e && ((e.properties.solid ?? 0) > 0 || (e.properties.portable ?? 0) > 0 || e.kind === 'plot');
  const path = fieldPath(world.value, run.data.currentNodeId, player.value.pos, pos, 'player', near);
  if (!path) { say('길이 막혀 있다.'); return; }
  const token = movement;
  const origin = run.data.currentNodeId;
  moving.value = true; routeCells.value=[...path];
  for (const p of path) {
    if (token !== movement || run.data.ended) break;
    const result = stepField(p);routeCells.value=routeCells.value.filter(q=>distance(q,p)!==0);
    if (result.message) say(result.message);
    if(result.speech){speech.value=result.speech;line.value=0;}
    if (!result.ok || result.travel || run.data.currentNodeId !== origin) break;
    // A new telegraph pauses travel so a long tap never walks blindly into the next hit.
    if (danger.value.size) break;
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  if (token === movement) {moving.value = false;routeCells.value=[];if(!e)selectSelf();}
  if (run.data.currentNodeId !== origin) selectSelf();
  if (run.data.ended) router.push('/game/end');
}
function perform(gesture: Gesture, quality=1, drawn=false) {
  if (!initialized.value || run.data.ended) return;
  stop();
  if (speech.value) {
    if (gesture === 'tap'||gesture==='circle') nextLine();
    return;
  }
  if(!SKILL_GESTURES.includes(gesture as typeof SKILL_GESTURES[number]))aimSkill.value=undefined;
  if(gesture==='dash'){aimDash.value=!aimDash.value;say(aimDash.value?'ϟ 도착할 칸을 선택하세요.':'');return;}
  aimDash.value=false;
  let pos = selection.value;
  if (gesture === 'place' && held.value && player.value?.pos && distance(player.value.pos, pos) === 0) pos = cardinal(player.value.pos).find(p => walkable(world.value, run.data.currentNodeId, p, held.value?.id)) ?? pos;
  const origin = run.data.currentNodeId;
  const result = performFieldGesture(gesture, target.value?.id, pos, {quality,drawn});
  say(result.message);
  if(result.ok)aimSkill.value=undefined;
  if (result.speech) { speech.value = result.speech; line.value = 0; }
  if(result.targetPos) { selectedPos.value=result.targetPos; selectedId.value=result.targetId; }
  if (run.data.currentNodeId !== origin) selectSelf();
  if (gesture === 'place' && result.ok) { selectedPos.value = pos; selectedId.value = undefined; }
  wake();
  if (run.data.ended) router.push('/game/end');else if(result.route==='base-configure')skillsOpen.value=true;else if(result.route)router.push(result.route);
}
function chooseTopic(topic:NonNullable<FieldSpeech['topics']>[number]){
  if(!speech.value)return;
  if(topic.action&&topic.lines.length){
    speech.value={...speech.value,lines:[...topic.lines],topics:[{label:topic.confirmLabel??'함께하기',lines:[],action:topic.action},{label:'나중에',lines:['다음에 다시 이야기하자.']}]};line.value=0;return;
  }
  if(topic.action){
    const result=performFieldService(speech.value.actorId,topic.action);
    say(result.message);
    if(result.speech){speech.value=result.speech;line.value=0;}
    else speech.value=undefined;
  }else{speech.value.lines=[...topic.lines];line.value=0;}
  wake();
}
function nextLine(){if(speech.value&&line.value+1<speech.value.lines.length)line.value++;else if(!encounter.value)speech.value=undefined;wake();}
function chooseItem(id: string) { run.data.field!.selectedItem = run.data.field!.selectedItem === id ? undefined : id; }
watch(()=>run.data.currentNodeId,()=>{if(initialized.value){ensureField(run.data);selectSelf();}});
watch([bagOpen,skillsOpen,progressOpen,settingsOpen,mapOpen,detailsOpen,characterOpen,inventoryOpen],values=>{if(values.some(Boolean))stop();});
watch([characterOpen,inventoryOpen],()=>{if(initialized.value)ensureField(run.data);});
onMounted(async () => {
  if (!run.active) { router.replace('/main'); return; }
  ensureField(run.data); effectCursor=world.value.sequence; initialized.value = true; selectSelf();
  if(run.data.field?.encounter){speech.value=run.data.field.encounter;line.value=0;}
  else if(run.data.field?.notification){speech.value=run.data.field.notification;line.value=0;run.data.field.notification=undefined;}
  await nextTick();
  observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) { width.value = rect.width; height.value = rect.height; } });
  if (stageElement.value) observer.observe(stageElement.value);
  wake();
  window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);document.addEventListener('visibilitychange',visibility);
  idleTimer=setInterval(()=>{
    if(!initialized.value||run.data.ended)return;
    if(idle.poll(Date.now(),paused.value)) {
      const origin=run.data.currentNodeId;advanceFieldTime(30);
      if(run.data.currentNodeId!==origin)selectSelf();
      if(run.data.ended)router.push('/game/end');
    }
  },100);
});
onBeforeUnmount(() => { stop(); observer?.disconnect(); clearTimeout(timer);clearInterval(idleTimer);setFieldViewport();window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);document.removeEventListener('visibilitychange',visibility); });
</script>

<template>
  <main v-if="initialized && space && player" class="field-view" @pointerdown.capture="press" @keydown.capture="wake">
    <header class="field-heading"><div><span class="eyebrow">COLORZ</span><h1>{{ space.name }}</h1></div><div class="field-clock"><span><b>♥</b> {{ run.data.hp }}/{{ run.data.maxHp }}</span><span class="mana-pips" :aria-label="'마나 '+run.data.mp+' / 3'"><i v-for="n in 3" :key="n" :class="{filled:run.data.mp>=n}">◆</i></span></div></header>
    <div ref="stageElement" class="field-stage" :class="{ dungeon: !!space.dungeon }">
      <div class="field-board" role="group" aria-label="격자 필드" :style="{ gridTemplateColumns: `repeat(${columns}, ${tileSize}px)`, gridTemplateRows: `repeat(${rows}, ${tileSize}px)` }">
        <button v-for="pos in cells" :key="positionKey(pos)" class="field-cell" :class="[`tile--${tile(pos)}`, { selected: distance(selection, pos) === 0, danger: danger.has(positionKey(pos)), imminent:imminent.has(positionKey(pos)), path:pathKeys.has(positionKey(pos)), 'dash-aim':dashKeys.has(positionKey(pos)), 'skill-aim':skillKeys.has(positionKey(pos)), exit: !!exitAt(pos) }]" :aria-label="label(pos)" @click="clickCell(pos)">
          <span v-for="fx in effects.filter(f=>distance(f.pos,pos)===0)" :key="fx.id" class="combat-float" :class="'combat-float--'+fx.kind" aria-live="polite">{{ fx.text }}</span>
          <span v-if="tile(pos) === 'grass'" class="grass-marks" aria-hidden="true">{{ (pos.x * 3 + pos.y) % 4 === 0 ? 'ˎ ˏ' : '·' }}</span>
          <span v-if="exitAt(pos)" class="exit-mark" aria-hidden="true">{{ space.dungeon ? '≋' : '⋮' }}</span>
          <span v-for="entity in at(pos)" :key="entity.id" class="field-piece" :class="{ 'field-piece--player': entity.id === 'player' }"><FieldEntityGlyph :entity="entity"/><span v-if="entity.creature" class="creature-hp"><i :style="{ width: `${entity.properties.integrity ?? 100}%` }"/></span><span v-if="entity.creature?.pending" class="intent-mark">{{ entity.creature.pending.remaining }}</span><span v-if="entity.id === speech?.actorId" class="speech-bubble">{{ speech.lines[line]?.slice(0, 22) }}{{ (speech.lines[line]?.length ?? 0) > 22 ? '…' : '' }}</span></span>
          <span v-if="exitAt(pos)" class="exit-label">{{ exitAt(pos)?.label }}</span>
          <span v-if="distance(selection,pos)===0&&hints.length&&target?.id!=='player'" class="tile-hints" aria-hidden="true">{{ hints.map(h=>GLYPHS[h.id]).join(' ') }}</span>
        </button>
      </div>
      <FieldStatusFeedback :entity="player" :transformed="!!run.data.transform"/>
      <div v-if="statusEntries(player).length||run.data.transform" class="field-statuses" aria-label="내 상태"><button v-if="run.data.transform" @click="say('여우 기술은 공방에서 성장한다. 원래 모습으로 돌아와도 수련은 남는다.')">두 꼬리 여우</button><button v-for="s in statusEntries(player)" :key="s.key" :aria-label="statusLabel(s.key)+' '+s.value" @click="say(STATUS_HELP[s.key]??statusLabel(s.key))">{{ statusLabel(s.key) }} {{ s.value }}</button></div>
      <div v-if="notice" class="field-notice" role="status">{{ notice }}</div>
      <div v-if="space.cleared && space.dungeon" class="room-clear">◇ 길이 열렸다</div>
    </div>
    <section class="field-console" aria-label="하단 조작 패널">
      <section v-if="speech" class="field-dialogue" aria-label="대화">
        <div><strong>{{ speech.name }}</strong><button aria-label="대화 닫기" @click="encounter?encounterChoice(false):speech=undefined">×</button></div>
        <blockquote>{{ speech.lines[line] }}</blockquote>
        <div v-if="encounter&&line+1===speech.lines.length" class="encounter-choices"><button @click="encounterChoice(true)">도전한다</button><button @click="encounterChoice(false)">물러난다</button></div>
        <div v-else-if="speech.topics&&line+1===speech.lines.length" class="dialogue-topics"><button v-for="topic in speech.topics" :key="topic.label" @click="chooseTopic(topic)">{{ topic.label }}</button><button @click="speech=undefined">다음에 또</button></div>
        <button v-else class="dialogue-next" @click="nextLine">● {{ line+1===speech.lines.length?'대화 마치기':'계속' }}</button>
      </section>
      <section v-if="bagOpen" class="field-drawer" aria-label="소지품 선택">
        <header><strong>손에 쓸 물건</strong><button @click="bagOpen=false;inventoryOpen=true">소지품 관리</button><button aria-label="소지품 선택 닫기" @click="bagOpen=false">×</button></header>
        <button v-for="[id,count] in inventory" :key="id" :aria-pressed="run.data.field?.selectedItem===id" @click="chooseItem(id);bagOpen=false"><span>{{ FIELD_ITEMS[id]?.glyph??'◇' }}</span> {{ fieldItemName(id) }} <b>{{ count }}</b></button>
        <p v-if="!inventory.length">빈 가방</p>
      </section>
      <section v-if="progressOpen" class="field-drawer field-progress" aria-label="생활과 도형 성장">
        <header><strong>생활 숙련 {{ run.data.lifeLevel??1 }} <small>· {{ run.data.lifeXp??0 }}/3</small></strong><button aria-label="성장 닫기" @click="progressOpen=false">×</button></header>
        <div class="growth-marks"><span :class="{earned:(run.data.lifeLevel??1)>=2}">2 · 자동 돌봄</span><span :class="{earned:(run.data.lifeLevel??1)>=3}">3 · 생산 선택</span><span :class="{earned:(run.data.lifeLevel??1)>=5}">5 · 산출 +1</span></div>
        <div v-if="(run.data.lifeLevel??1)>=3" class="production-modes"><button v-for="mode in PRODUCTION_MODES" :key="mode.id" :aria-pressed="(run.data.field?.productionMode??'standard')===mode.id" @click="run.data.field!.productionMode=mode.id">{{ mode.name }}<small>{{ mode.description }}</small></button></div>
        <div class="growth-marks"><span v-for="id in ['strike','tend','lift','take']" :key="id">{{ GLYPHS[id] }} {{ gestureLevel(run.data,id) }}</span></div>
        <button @click="progressOpen=false;characterOpen=true">캐릭터 정보</button>
      </section>
      <section v-if="detailsOpen" class="field-drawer" aria-label="대상 살펴보기">
        <header><strong>{{ targetName }}</strong><button aria-label="대상 살펴보기 닫기" @click="detailsOpen=false">×</button></header>
        <div v-if="layeredTargets.length>1" class="target-stock" aria-label="같은 칸의 대상"><button v-for="entity in layeredTargets" :key="entity.id" :aria-pressed="selectedId===entity.id" @click="selectedId=entity.id">{{ entity.name }}</button></div>
        <div class="target-stock"><button v-for="[id,n] in targetStock" :key="id" :aria-pressed="run.data.field?.selectedItem===id" @click="chooseItem(id);detailsOpen=false">{{ fieldItemName(id) }} <b>{{ n }}</b></button></div>
        <div v-if="target?.creature" class="target-states"><p>{{ target.creature.pending?.name??'경계 중' }}</p><p v-if="target.creature.pending?.transform">첫 낙인은 수화 · 수화 중에는 변신 판정</p><p v-for="s in statusEntries(target)" :key="s.key">{{ statusLabel(s.key) }} {{ s.value }} · {{ STATUS_HELP[s.key] }}</p></div><p v-else-if="!targetStock.length">놓인 물건 없음</p>
      </section>
      <div class="console-target">
        <div><strong>{{ selectedSkill?selectedSkill.name:aimDash?'ϟ 도착할 칸':targetName }}</strong><small v-if="target?.creature">{{ Math.ceil(target.creature.maxHp*(target.properties.integrity??100)/100) }} HP · {{ target.creature.pending?.name??'경계 중' }}</small><small v-else-if="target?.production&&!target.production.settled">성장 중</small></div>
        <button v-if="targetStock.length||layeredTargets.length>1||target?.creature" aria-label="대상 살펴보기" @click="stop();progressOpen=false;detailsOpen=!detailsOpen;bagOpen=false;skillsOpen=false">···</button>
        <button v-if="moving" aria-label="이동 멈추기" @click="stop">■</button><button v-else aria-label="자신 선택" @click="selectSelf">◎</button>
      </div>
      <div class="console-body">
        <div v-if="target?.creature||aimSkill" class="context-tools combat-tools">
          <button class="hand-slot" @click="skillsOpen=true"><span>기술 구성</span><strong>◆ {{ selectedSkill?fieldSkillMana(run.data,selectedSkill):run.data.mp }}</strong></button>
          <div class="skill-runes" aria-label="장착 기술">
            <button v-for="id in SKILL_GESTURES" :key="id" :aria-pressed="aimSkill===id" :aria-label="GLYPHS[id]+' '+(equippedSkill(run.data,id)?.name??'비어 있음')" :class="{empty:!equippedSkill(run.data,id)}" @click="equippedSkill(run.data,id)?prepareSkill(id):skillsOpen=true"><b>{{ GLYPHS[id] }}</b><small v-if="equippedSkill(run.data,id)">{{ skillRemaining(run.data,equippedSkill(run.data,id)!)||'·' }}</small></button>
          </div>
          <div class="combat-basics"><button @click="aimSkill=undefined;guide='strike'" aria-label="기본 공격 연습선">╱ 기본</button><button @click="aimSkill=undefined;guide='dash'" aria-label="이동기 연습선">ϟ 이동 ◆1</button></div>
        </div>
        <div v-else class="context-tools">
          <button class="hand-slot" @click="stop();progressOpen=false;bagOpen=!bagOpen;skillsOpen=false;detailsOpen=false"><span>{{ held?'들고 있음':'손' }}</span><strong>{{ held?.name??(run.data.field?.selectedItem?fieldItemName(run.data.field.selectedItem):'빈손') }}</strong></button>
          <div class="context-hints" aria-label="가능한 동작"><button v-for="hint in hints" :key="hint.id" :aria-label="hint.label+' 연습선'" @click="guide=hint.id"><b>{{ GLYPHS[hint.id] }}</b><span>{{ hint.label }}</span></button></div>
          <small v-if="!hints.length">대상을 가까이에서 선택하세요.</small>
        </div>
        <GesturePad :guide="guide" :disabled="ui.tutorialTopic!==null||settingsOpen||mapOpen||bagOpen||skillsOpen||detailsOpen||progressOpen||characterOpen||inventoryOpen" @drawing="drawing=$event" @gesture="perform" @unrecognized="say('다시 그려보세요.');wake()"/>
      </div>
      <nav class="console-nav" aria-label="필드 메뉴">
        <button :aria-pressed="bagOpen" @click="stop();progressOpen=false;bagOpen=!bagOpen;skillsOpen=false;detailsOpen=false">가방</button>
        <button @click="stop();progressOpen=!progressOpen;bagOpen=false;skillsOpen=false;detailsOpen=false">성장</button>
        <button @click="stop();progressOpen=false;bagOpen=false;skillsOpen=false;detailsOpen=false;mapOpen=true">지도</button>
        <button :aria-pressed="skillsOpen" @click="stop();progressOpen=false;skillsOpen=!skillsOpen;bagOpen=false;detailsOpen=false">기술</button>
        <button @click="stop();progressOpen=false;bagOpen=false;skillsOpen=false;detailsOpen=false;settingsOpen=true">설정</button>
      </nav>
    </section>
    <FieldSkillPanel :open="skillsOpen" @close="skillsOpen=false" @guide="id=>SKILL_GESTURES.includes(id as typeof SKILL_GESTURES[number])?prepareSkill(id):guide=id"/>
    <CharacterMenu :open="characterOpen" @close="characterOpen=false"/>
    <InventoryMenu :open="inventoryOpen" @close="inventoryOpen=false"/>
    <SettingsMenu :open="settingsOpen" @close="settingsOpen = false"/>
    <FieldAtlas :open="mapOpen" @close="mapOpen=false"/>
  </main>
</template>

<style scoped>
.field-view { height: 100dvh; min-height: 480px; width: 100%; max-width: 1100px; margin: 0 auto; padding: 0 !important; display: flex; flex-direction: column; color: #e0e0cd; background: #17221e; overflow: hidden; font-family: 'Pretendard', system-ui, sans-serif; }
.field-heading { flex: none; height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 18px; border-bottom: 1px solid #63715a33; background: #18211e; }
.eyebrow { font-size: 9px; letter-spacing: .25em; color: #9aaa8d; }
h1 { font-size: 16px; line-height: 1.4; margin: 0; font-weight: 600; color: #e3d8b8; }
.field-clock { display: grid; justify-items: end; gap: 3px; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; color: #b5c1ae; }.field-clock b { color: #d9988e; }.field-clock i { font-style: normal; opacity: .4; }
.field-stage { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; background: radial-gradient(ellipse, #334735, #192c23); padding: 8px; box-sizing: border-box; }
.field-stage.dungeon { background: radial-gradient(ellipse, #414347, #1d2225); }
.field-board { display: grid; flex: none; border: 1px solid #596c4744; box-shadow: 0 14px 55px #0005; border-radius: 3px; overflow: visible; isolation: isolate; }
.field-cell { appearance: none; display: block; position: relative; min-width: 0; width: 100%; height: 100%; padding: 0; margin: 0; border: 0; border-right: 1px solid #172b2520; border-bottom: 1px solid #172b2520; border-radius: 0; box-sizing: border-box; cursor: pointer; touch-action: manipulation; }
.tile--grass { background: #415e45; }.tile--grass:nth-child(3n) { background: #456148; }.tile--path { background: #77856b; }.tile--soil { background: repeating-linear-gradient(165deg, #725e44 0 7px, #66533e 7px 9px); }.tile--water { background: #608992; }.tile--stone { background: #535c59; }.tile--wall { background: #263b2d; box-shadow: inset 0 -7px #15281f66; }.dungeon .tile--wall { background: #303735; box-shadow: inset 0 -7px #171c1ccc; }
.grass-marks { color: #a0ba823b; font-size: 22px; position: absolute; bottom: 4px; left: 8px; }.field-cell:focus-visible { outline: 3px solid #e9d898; z-index: 4; }
.field-cell.path::before{content:'·';position:absolute;inset:0;display:grid;place-items:center;color:#f3e2a7;font-size:30px;z-index:1}.field-cell.dash-aim{box-shadow:inset 0 0 0 2px #90d9e9}.field-cell.imminent{outline:1px solid #ffb096;outline-offset:-3px}.mana-pips{display:flex;gap:5px}.mana-pips i{color:#486365;opacity:1}.mana-pips i.filled{color:#9ddaea}.combat-float{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:800;white-space:nowrap;color:#fff0df;text-shadow:0 2px 2px #321716,1px 0 #321716,-1px 0 #321716;z-index:20;pointer-events:none;animation:damage-rise 1.6s ease-out forwards}.combat-float--heal{color:#b6edbb}.combat-float--guard,.combat-float--miss{font-size:13px;color:#d0e8f3}.field-statuses{position:absolute;top:7px;left:8px;right:8px;display:flex;gap:4px;overflow-x:auto;z-index:6}.field-statuses button{padding:4px 6px;background:#182b29e8;color:#f5cbb5;border:1px solid #8c8f70;border-radius:4px;font-size:10px;white-space:nowrap}.dialogue-topics{display:flex;gap:8px;flex-wrap:wrap}.dialogue-topics button{padding:9px 10px;border:1px solid #aaa184;background:#263d35;color:#ecdfb7;border-radius:4px}.encounter-choices{display:flex;gap:12px}.encounter-choices button{flex:1;padding:10px;border:1px solid #aaa184;border-radius:4px;background:#263d35;color:#ecdfb7}@keyframes damage-rise{0%{transform:translateY(0) scale(.7);opacity:1}20%{transform:translateY(-9px) scale(1.08);opacity:1}75%{opacity:1}100%{transform:translateY(-32px);opacity:0}}
.field-cell.selected::after { content: ''; position: absolute; inset: 3px; border: 1.5px solid #f4df9c; border-radius: 5px; z-index: 4; pointer-events: none; }.field-cell.danger { background-image: repeating-linear-gradient(135deg, #d1796733 0 5px, #d1796799 5px 7px); box-shadow: inset 0 0 0 2px #eaa18a; }
.field-piece { position: absolute; inset: -4px 2px 2px; z-index: 2; pointer-events: none; }.field-piece--player { z-index: 3; }.creature-hp { position: absolute; left: 12%; right: 12%; bottom: 1px; height: 3px; background: #352d2c; border-radius: 3px; }.creature-hp i { display: block; height: 100%; background: #d78687; border-radius: inherit; }
.intent-mark { position: absolute; right: 0; top: -4px; background: #d88875; color: #31201d; font-weight: bold; width: 14px; height: 17px; border-radius: 6px; font-size: 12px; }
.exit-mark { font-size: 26px; color: #edd89a; }.exit-label { position: absolute; left: 50%; bottom: -5px; transform: translate(-50%, 50%); white-space: nowrap; color: #f8eac0; background: #1a2622e6; border: 1px solid #c4b78e33; border-radius: 3px; font-size: 9px; padding: 1px 4px; z-index: 5; pointer-events: none; }.speech-bubble { position: absolute; bottom: 94%; left: 50%; transform: translateX(-50%); max-width: 150px; min-width: 80px; padding: 6px 8px; background: #eee4c6; color: #384c3e; border-radius: 8px 8px 8px 0; font-size: 10px; line-height: 1.5; z-index: 9; }
.field-notice { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); background: #111c18ec; color: #eadcaa; font-size: 12px; padding: 7px 15px; border: 1px solid #b8b08033; border-radius: 20px; pointer-events: none; z-index: 10; white-space: nowrap; }.room-clear { position: absolute; top: 10px; right: 12px; font-size: 11px; color: #e4d398; }
.field-console { flex: none; position: relative; padding: 0 14px max(5px, env(safe-area-inset-bottom)); border-top: 1px solid #8a97714d; background: linear-gradient(#242f27, #17211b); z-index: 20; box-shadow: 0 -10px 25px #0c170d30; }
.console-target { height: 39px; display: flex; align-items: center; justify-content: space-between; gap: 6px; border-bottom: 1px solid #91a08122; }.console-target > div { display: flex; align-items: center; gap: 9px; min-width: 0; }.console-target strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.console-target small { font-size: 11px; color: #a6b9a5; white-space: nowrap; }.target-dot { width: 6px; height: 6px; border-radius: 50%; background: #dac893; }.console-target button { flex: none; width: 38px; height: 34px; color: #e3d6b0; border: 0; background: none; font-size: 22px; cursor: pointer; }
.console-body { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 9px 0; }.hand-slot { width: 70px; display: grid; justify-items: center; gap: 5px; text-align: center; }.hand-label { color: #a9b69d; font-size: 10px; }.hand-slot strong { font-size: 10px; line-height: 1.3; color: #c5ceb6; }.hand-slot small { color: #d7c68e; font-size: 11px; }.hand-slot .entity-art { width: 52px; height: 58px; }.hand-glyph { display: grid; place-content: center; width: 54px; height: 60px; font-size: 35px; color: #d4c89f; border: 1px solid #aeb09822; border-radius: 12px; background: #09130c24; }
.console-nav { display: flex; align-items: center; justify-content: center; gap: 6px; padding-top: 3px; border-top: 1px solid #91a08122; }.console-nav button { min-height: 36px; min-width: 40px; padding: 4px 13px; border: 0; background: none; border-radius: 7px; color: #b3c0a6; font: inherit; font-size: 11px; cursor: pointer; }.console-nav span { font-size: 17px; margin-right: 4px; }.console-nav button[aria-pressed="true"] { background: #3b4735; color: #f2dfab; }
.target-stock { display: flex; overflow-x: auto; gap: 5px; padding-top: 5px; }.target-stock button { font-size: 10px; color: #b3c0a6; border: 1px solid #a2ad8033; border-radius: 5px; padding: 4px 7px; background: #213124; white-space: nowrap; cursor: pointer; }.target-stock button[aria-pressed="true"] { border-color: #d5bd76; color: #f4e4b2; }
.field-drawer { position: absolute; bottom: 100%; left: 0; right: 0; display: flex; flex-wrap: wrap; max-height: 180px; overflow-y: auto; gap: 7px; padding: 14px; background: #192a22f5; border-top: 1px solid #b8b58666; box-shadow: 0 -12px 20px #0003; }.field-drawer button { color: #e0dabc; border: 1px solid #89976b55; background: #28392b; border-radius: 8px; padding: 10px; font: inherit; font-size: 12px; cursor: pointer; }.field-drawer button[aria-pressed="true"] { background: #4c5134; border-color: #e5ce8a; }.field-drawer b { margin-left: 7px; color: #a6bb92; }.field-skills { justify-content: space-around; }.field-skills > div { width: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-items: center; }.field-skills b { font-size: 24px; color: #e9d69c; }.field-skills meter { width: 100%; height: 5px; grid-column: 1/-1; }
.field-dialogue { position: absolute; bottom: calc(100% + 6px); left: 12px; right: 12px; padding: 12px 16px; border: 1px solid #c4c19b; border-radius: 12px 12px 12px 2px; background: #e8e1c7; color: #2d4937; box-shadow: 0 7px 28px #10221970; z-index: 30; }.field-dialogue > div { display: flex; justify-content: space-between; align-items: center; }.field-dialogue strong { font-size: 12px; }.field-dialogue button { color: #52664b; border: 0; background: none; font-size: 20px; cursor: pointer; min-width: 30px; min-height: 30px; }.field-dialogue blockquote { margin: 4px 0 10px; font-size: 14px; line-height: 1.6; max-height: 160px; overflow-y: auto; }.field-dialogue small { display: block; text-align: right; color: #738062; font-size: 10px; }.field-dialogue small span { margin-left: 12px; font-size: 17px; }
@media (min-width: 800px) { .field-view { border-left: 1px solid #8a977133; border-right: 1px solid #8a977133; }.field-console { padding-left: 24%; padding-right: 24%; }.field-dialogue { left: 18%; right: 18%; }.field-drawer { padding-left: 20%; padding-right: 20%; } }
@media (max-width: 360px) { .field-heading { padding: 0 12px; } h1 { font-size: 14px; }.field-console { padding-left: 8px; padding-right: 8px; }.console-body { gap: 5px; }.hand-slot { width: 49px; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto; } }

.field-view{--pad-size:168px}.field-console{height:calc(var(--pad-size) + 92px + env(safe-area-inset-bottom));box-sizing:border-box;display:grid;grid-template-rows:40px calc(var(--pad-size) + 12px) 40px;padding:0 14px env(safe-area-inset-bottom);overflow:visible}
.console-target{height:40px;box-sizing:border-box;width:min(100%,460px);margin:auto}.console-target>div{flex:1}.console-target button{width:34px;height:34px}
.console-body{display:grid;grid-template-columns:minmax(0,1fr) var(--pad-size);gap:16px;padding:6px 0;width:min(100%,460px);height:calc(var(--pad-size) + 12px);box-sizing:border-box;margin:auto;overflow:hidden}
.context-tools{height:100%;display:flex;flex-direction:column;justify-content:center;gap:6px;min-width:0}.context-tools>small{font-size:11px;color:#a1af9c}
.hand-slot{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:34px;padding:5px 7px;box-sizing:border-box;border:1px solid #80947844;border-radius:5px;background:#1b2a21;color:#d5dabf;font:inherit;text-align:left}
.hand-slot span{font-size:10px;color:#9caa95;white-space:nowrap}.hand-slot strong{font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.context-hints{display:grid;gap:3px}.context-hints button{display:grid;grid-template-columns:30px minmax(0,1fr);align-items:center;gap:4px;min-height:30px;padding:2px 4px;border:0;background:none;color:#d9d1ae;font:inherit;text-align:left;border-radius:4px}
.context-hints b{font-size:23px;text-align:center;font-weight:400}.context-hints span{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.context-hints button:hover{background:#80947822}
.console-nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0;padding:0;width:min(100%,460px);margin:auto;height:40px;box-sizing:border-box}.console-nav button{min-width:0;height:36px;padding:3px;font-size:12px}
.field-drawer{max-height:min(45dvh,320px);box-sizing:border-box;padding:12px;z-index:25}.field-drawer header{display:flex;align-items:center;gap:8px;width:100%;font-size:13px}.field-drawer header strong{flex:1}.field-drawer header button{min-height:34px;padding:5px 9px}
.field-drawer .target-stock{width:100%;flex-wrap:wrap;padding:0}.field-skills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.field-skills header{grid-column:1/-1}.field-skills button{min-width:0;gap:7px;padding:8px}.field-skills button span{font-size:11px}.field-skills button small{margin-left:auto}.field-skills button b{margin:0}
.field-dialogue .dialogue-next{display:block;margin-left:auto;font-size:12px;min-height:36px}.tile-hints{position:absolute;top:-14px;left:50%;transform:translateX(-50%);padding:1px 5px;white-space:nowrap;z-index:8;background:#f0e3bc;color:#30422f;border-radius:4px;font-size:13px;pointer-events:none}
.tile--sand{background:#a59168}.tile--wood{background:repeating-linear-gradient(90deg,#817159 0 13px,#6b614c 13px 15px)}
@media(min-width:800px){.field-console{padding-left:14px;padding-right:14px}.field-drawer{left:calc(50% - 240px);right:calc(50% - 240px);padding:12px}}
@media(max-height:710px){.field-view{--pad-size:138px}.context-hints button{min-height:25px}.hand-slot{min-height:28px}}
.field-progress{display:block}.growth-marks{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0;font-size:12px;color:#a4b19e}.growth-marks .earned{color:#e7d497}.production-modes{display:flex;gap:6px}.production-modes button{flex:1;font-size:11px}.production-modes small{display:block;margin-top:5px;font-size:10px}.production-modes button[aria-pressed=true]{border-color:#dac890}
.skill-runes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}.skill-runes button{display:flex;justify-content:center;align-items:center;gap:3px;height:34px;min-width:0;padding:0;border:1px solid #89976b55;border-radius:4px;background:#263c30;color:#e9d69c;cursor:pointer}.skill-runes b{font-size:23px;font-weight:400}.skill-runes small{font-size:11px;color:#b5c0a9}.skill-runes button[aria-pressed=true]{border-color:#f0dc9c;background:#4a593a}.skill-runes button.empty{opacity:.45}.combat-tools>small{font-size:10px;min-height:12px}.field-cell.skill-aim{outline:2px solid #a5d7d6;outline-offset:-3px}.field-cell.skill-aim::before{content:'';position:absolute;inset:0;background:#83d2d42e;pointer-events:none;z-index:1}
.combat-basics{display:flex;gap:4px}.combat-basics button{flex:1;min-width:0;min-height:24px;padding:2px;border:0;border-radius:3px;background:#263c30;color:#c8c5a9;font-size:10px;white-space:nowrap}.combat-tools>*{flex-shrink:0}
</style>
