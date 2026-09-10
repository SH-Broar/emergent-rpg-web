<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useUiStore } from '@/stores/ui';
import type { GridPos } from '@/data/schemas/base';
import { GESTURES, GLYPHS, type Gesture, type FieldSpeech } from '@/systems/field-types';
import { fieldItemName, FIELD_ITEMS } from '@/systems/field-generation';
import { advanceFieldTime, carriedEntity, ensureField, fieldAction, fieldClock, gestureLevel, performFieldGesture, setFieldViewport, stepField, visibleFieldEntities } from '@/systems/field-simulation';
import { GESTURE_CATALOG, gestureDefinition } from '@/systems/gesture-catalog';
import { createFieldIdleClock } from '@/systems/field-idle';
import { cardinal, distance, fieldPath, positionKey, walkable } from '@/systems/world/spatial';
import { interactionDisabled } from '@/systems/world/engine';
import GesturePad from '@/components/GesturePad.vue';
import FieldEntityGlyph from '@/components/FieldEntityGlyph.vue';
import SettingsMenu from '@/components/SettingsMenu.vue';
import FieldAtlas from '@/components/FieldAtlas.vue';

const run = useRunStore(), ui = useUiStore(), router = useRouter();
const initialized = ref(false), moving = ref(false), bagOpen = ref(false), skillsOpen = ref(false), settingsOpen = ref(false);
const mapOpen=ref(false),drawing=ref(false),pointerHeld=ref(false),hidden=ref(document.hidden),guide=ref<string>(),idleProgress=ref(0);
const idle=createFieldIdleClock();
let idleTimer:ReturnType<typeof setInterval>|undefined;
const paused=computed(()=>moving.value||drawing.value||pointerHeld.value||hidden.value||bagOpen.value||skillsOpen.value||settingsOpen.value||mapOpen.value||!!speech.value||ui.tutorialTopic!==null);
function wake(){idle.reset(Date.now());idleProgress.value=0;}
function press(){pointerHeld.value=true;wake();}
function release(){pointerHeld.value=false;wake();}
function visibility(){hidden.value=document.hidden;wake();}
const selectedId = ref<string>(), selectedPos = ref<GridPos>({ x: 0, y: 0 });
const notice = ref(''), speech = ref<FieldSpeech>(), line = ref(0), lastGesture = ref<Gesture>();
const stageElement = ref<HTMLElement | null>(null), width = ref(390), height = ref(430);
let observer: ResizeObserver | undefined, timer: ReturnType<typeof setTimeout> | undefined, movement = 0;
const world = computed(() => run.data.interactionWorld!);
const player = computed(() => world.value?.entities.player);
const space = computed(() => world.value?.spaces?.[run.data.currentNodeId]);
const entities = computed(() => initialized.value ? visibleFieldEntities(run.data) : []);
const held = computed(() => initialized.value ? carriedEntity(world.value) : undefined);
const target = computed(() => selectedId.value ? world.value?.entities[selectedId.value] : undefined);
const targetName = computed(() => target.value?.name ?? space.value?.exits.find(e => distance(e.pos, selectedPos.value) === 0)?.label ?? (space.value?.tiles[selectedPos.value.y]?.[selectedPos.value.x] === 'soil' ? '빈 밭' : '바닥'));
const inventory = computed(() => Object.entries(player.value?.stock ?? {}).filter(([, n]) => n > 0));
const targetStock = computed(() => target.value?.id === 'player' ? [] : Object.entries(target.value?.stock ?? {}).filter(([, n]) => n > 0));
const layeredTargets = computed(() => at(target.value?.pos ?? selectedPos.value));
const columns = computed(() => Math.max(5, Math.min(11, Math.floor(width.value / 48))));
const rows = computed(() => Math.max(4, Math.min(9, Math.floor(height.value / 48))));
watch([columns,rows],([columns,rows])=>setFieldViewport({columns,rows}),{immediate:true,flush:'sync'});
watch(paused,wake,{flush:'sync'});
const tileSize = computed(() => Math.floor(Math.min(width.value / columns.value, height.value / rows.value)));
const camera = computed(() => ({ x: Math.max(0, Math.min((space.value?.width ?? 15) - columns.value, (player.value?.pos?.x ?? 7) - Math.floor(columns.value / 2))), y: Math.max(0, Math.min((space.value?.height ?? 13) - rows.value, (player.value?.pos?.y ?? 6) - Math.floor(rows.value / 2))) }));
const cells = computed(() => Array.from({ length: rows.value * columns.value }, (_, i) => ({ x: camera.value.x + i % columns.value, y: camera.value.y + Math.floor(i / columns.value) })));
const danger = computed(() => new Set(entities.value.flatMap(e => e.creature?.intent ?? []).map(positionKey)));
const glyphs = computed(() => {
  if (!player.value || !target.value || !initialized.value) return [...GESTURES];
  return GESTURES.filter(g => {
    if(gestureDefinition(g)?.direction) return true;
    const t = g === 'place' ? held.value : target.value;
    if (!t) return false;
    const action = fieldAction(run.data, world.value, player.value!, t, g, selectedPos.value, run.data.field?.selectedItem);
    return !!action && !interactionDisabled(world.value, 'player', t.id, action);
  });
});
function at(p: GridPos) { return entities.value.filter(e => e.pos && distance(e.pos, p) === 0).sort((a,b) => Number(a.kind === 'actor') - Number(b.kind === 'actor')); }
function tile(p: GridPos) { return space.value?.tiles[p.y]?.[p.x] ?? 'wall'; }
function exitAt(p: GridPos) { return space.value?.exits.find(e => distance(e.pos, p) === 0); }
function label(p: GridPos) { return `${p.x + 1}열 ${p.y + 1}행, ${at(p).map(e => e.name).join(', ') || (exitAt(p)?.label ?? (tile(p) === 'wall' ? '벽' : tile(p) === 'soil' ? '밭' : '빈 칸'))}`; }
function selectSelf() { selectedId.value = 'player'; if (player.value?.pos) selectedPos.value = { ...player.value.pos }; }
function say(text: string) { notice.value = text; clearTimeout(timer); if (text) timer = setTimeout(() => notice.value = '', 3500); }
function stop() { movement++; moving.value = false; }
async function clickCell(pos: GridPos) {
  if (!player.value?.pos || speech.value || run.data.ended) return;
  stop();
  const candidates = at(pos);
  const sameCell = distance(selectedPos.value, pos) === 0;
  const e = sameCell && candidates.length > 1 ? candidates[(candidates.findIndex(e => e.id === selectedId.value) + 1) % candidates.length] : candidates.find(e => e.kind === 'actor') ?? candidates.at(-1);
  selectedId.value = e?.id;
  selectedPos.value = { ...pos };
  if (e?.id === 'player') return;
  const near = !!held.value || !!e && (e.kind === 'actor' || (e.properties.solid ?? 0) > 0 || (e.properties.portable ?? 0) > 0 || e.kind === 'plot');
  const path = fieldPath(world.value, run.data.currentNodeId, player.value.pos, pos, 'player', near);
  if (!path) { say('길이 막혀 있다.'); return; }
  const token = movement;
  const origin = run.data.currentNodeId;
  moving.value = true;
  for (const p of path) {
    if (token !== movement || run.data.ended) break;
    const result = stepField(p);
    if (result.message) say(result.message);
    if (!result.ok || result.travel || run.data.currentNodeId !== origin) break;
    // A new telegraph pauses travel so a long tap never walks blindly into the next hit.
    if (danger.value.size) break;
    await new Promise(resolve => setTimeout(resolve, 90));
  }
  if (token === movement) moving.value = false;
  if (run.data.currentNodeId !== origin) selectSelf();
  if (run.data.ended) router.push('/game/end');
}
function perform(gesture: Gesture, quality=1, drawn=false) {
  if (!initialized.value || run.data.ended) return;
  stop();
  lastGesture.value = gesture;
  if (speech.value) {
    if (gesture === 'circle') { if (++line.value >= speech.value.lines.length) speech.value = undefined; }
    return;
  }
  let pos = target.value?.pos ?? selectedPos.value;
  if (gesture === 'place' && held.value && player.value?.pos && distance(player.value.pos, pos) === 0) pos = cardinal(player.value.pos).find(p => walkable(world.value, run.data.currentNodeId, p, held.value?.id)) ?? pos;
  const origin = run.data.currentNodeId;
  const result = performFieldGesture(gesture, selectedId.value, pos, {quality,drawn});
  say(result.message);
  if (result.speech) { speech.value = result.speech; line.value = 0; }
  if(result.targetPos) { selectedPos.value=result.targetPos; selectedId.value=result.targetId; }
  if (run.data.currentNodeId !== origin) selectSelf();
  if (gesture === 'place' && result.ok) { selectedPos.value = pos; selectedId.value = undefined; }
  wake();
  if (run.data.ended) router.push('/game/end');
}
function chooseItem(id: string) { run.data.field!.selectedItem = run.data.field!.selectedItem === id ? undefined : id; }
function help() { stop(); ui.tutorialTopic = 'combat'; }
onMounted(async () => {
  if (!run.active) { router.replace('/main'); return; }
  ensureField(run.data); initialized.value = true; selectSelf();
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
    idleProgress.value=paused.value?0:idle.progress(Date.now());
  },100);
});
onBeforeUnmount(() => { stop(); observer?.disconnect(); clearTimeout(timer);clearInterval(idleTimer);setFieldViewport();window.removeEventListener('pointerup',release);window.removeEventListener('pointercancel',release);document.removeEventListener('visibilitychange',visibility); });
</script>

<template>
  <main v-if="initialized && space && player" class="field-view" @pointerdown.capture="press" @keydown.capture="wake">
    <header class="field-heading"><div><span class="eyebrow">COLORZ</span><h1>{{ space.name }}</h1></div><div class="field-clock"><time>{{ fieldClock(run.data) }}</time><span><b>♥</b> {{ run.data.hp }}/{{ run.data.maxHp }} <i>·</i> {{ '◈'.repeat(Math.max(0, run.data.lives)) }}</span></div></header>
    <div ref="stageElement" class="field-stage" :class="{ dungeon: !!space.dungeon }">
      <div class="field-board" role="group" aria-label="격자 필드" :style="{ gridTemplateColumns: `repeat(${columns}, ${tileSize}px)`, gridTemplateRows: `repeat(${rows}, ${tileSize}px)` }">
        <button v-for="pos in cells" :key="positionKey(pos)" class="field-cell" :class="[`tile--${tile(pos)}`, { selected: distance(selectedPos, pos) === 0, danger: danger.has(positionKey(pos)), exit: !!exitAt(pos) }]" :aria-label="label(pos)" @click="clickCell(pos)">
          <span v-if="tile(pos) === 'grass'" class="grass-marks" aria-hidden="true">{{ (pos.x * 3 + pos.y) % 4 === 0 ? 'ˎ ˏ' : '·' }}</span>
          <span v-if="exitAt(pos)" class="exit-mark" aria-hidden="true">{{ space.dungeon ? '≋' : '⋮' }}</span>
          <span v-for="entity in at(pos)" :key="entity.id" class="field-piece" :class="{ 'field-piece--player': entity.id === 'player' }"><FieldEntityGlyph :entity="entity"/><span v-if="entity.creature" class="creature-hp"><i :style="{ width: `${entity.properties.integrity ?? 100}%` }"/></span><span v-if="entity.creature?.intent" class="intent-mark">!</span><span v-if="entity.id === speech?.actorId" class="speech-bubble">{{ speech.lines[line]?.slice(0, 22) }}{{ (speech.lines[line]?.length ?? 0) > 22 ? '…' : '' }}</span></span>
          <span v-if="exitAt(pos)" class="exit-label">{{ exitAt(pos)?.label }}</span>
        </button>
      </div>
      <div v-if="notice" class="field-notice" role="status">{{ notice }}</div>
      <div v-if="space.cleared && space.dungeon" class="room-clear">◇ 길이 열렸다</div>
    </div>
    <section class="field-console" aria-label="하단 조작 패널">
      <div class="idle-clock" role="progressbar" :aria-label="paused?'시간 일시정지':'다음 30초까지'" :aria-valuenow="Math.round(idleProgress*100)" aria-valuemin="0" aria-valuemax="100"><i :style="{width:`${idleProgress*100}%`}"/><span>{{ paused?'Ⅱ':'5초 · 30초' }}</span></div>
      <section v-if="speech" class="field-dialogue" aria-label="대화"><div><strong>{{ speech.name }}</strong><button aria-label="대화 닫기" @click="speech = undefined">×</button></div><blockquote>{{ speech.lines[line] }}</blockquote><small>{{ line + 1 }} / {{ speech.lines.length }} <span>○</span></small></section>
      <section v-if="bagOpen" class="field-drawer" aria-label="소지품"><button v-for="[id, count] in inventory" :key="id" :aria-pressed="run.data.field?.selectedItem === id" @click="chooseItem(id)"><span :style="{ color: FIELD_ITEMS[id]?.color ?? '#d3cab2' }">{{ FIELD_ITEMS[id]?.glyph ?? '◇' }}</span> {{ fieldItemName(id) }} <b>{{ count }}</b></button><p v-if="!inventory.length">빈 가방</p></section>
      <section v-if="skillsOpen" class="field-drawer field-skills" aria-label="도형 모음"><button v-for="g in GESTURE_CATALOG" :key="g.id" :aria-label="`${g.name} 연습선`" @click="guide=g.id;skillsOpen=false"><b>{{ g.glyph }}</b><span>{{ gestureLevel(run.data,g.id) }}</span><small>{{ g.drawOnly?'직접 그리기':'연습선' }}</small></button></section>
      <div class="console-target"><div><span class="target-dot"/><strong>{{ targetName }}</strong><small v-if="target?.creature">{{ Math.ceil(target.creature.maxHp * (target.properties.integrity ?? 100) / 100) }} HP</small><small v-else-if="target?.production && !target.production.settled">{{ Math.max(0, Math.ceil(((target.production.startedTurn + target.production.duration) * 864 - run.data.field!.elapsedSeconds) / 60)) }}분</small></div><button v-if="moving" aria-label="이동 멈추기" @click="stop">■</button><button v-else aria-label="자신 선택" @click="selectSelf">◎</button></div>
      <div v-if="layeredTargets.length > 1" class="target-stock" aria-label="같은 칸의 대상"><button v-for="entity in layeredTargets" :key="entity.id" :aria-pressed="selectedId === entity.id" @click="stop(); selectedId = entity.id">{{ entity.name }}</button></div>
      <div v-if="targetStock.length && !bagOpen" class="target-stock"><button v-for="[id, n] in targetStock" :key="id" :aria-pressed="run.data.field?.selectedItem === id" @click="chooseItem(id)">{{ fieldItemName(id) }} <b>{{ n }}</b></button></div>
      <div class="console-body"><div class="hand-slot"><span class="hand-label">{{ held ? '들고 있음' : '손' }}</span><FieldEntityGlyph v-if="held" :entity="held"/><span v-else class="hand-glyph">{{ FIELD_ITEMS[run.data.field?.selectedItem ?? '']?.glyph ?? '·' }}</span><strong>{{ held?.name ?? (run.data.field?.selectedItem ? fieldItemName(run.data.field.selectedItem) : '빈손') }}</strong><small v-if="lastGesture">{{ GLYPHS[lastGesture] }} {{ gestureLevel(run.data, lastGesture) }}</small></div><GesturePad :available="glyphs" :guide="guide" :disabled="ui.tutorialTopic !== null || settingsOpen || mapOpen" @drawing="drawing=$event" @gesture="perform" @unrecognized="say('다시 그려보세요.');wake()"/></div>
      <nav class="console-nav" aria-label="필드 메뉴"><button :aria-pressed="bagOpen" @click="stop();bagOpen = !bagOpen; skillsOpen = false"><span>▣</span> 소지품</button><button :aria-pressed="skillsOpen" @click="stop();skillsOpen = !skillsOpen; bagOpen = false"><span>◇</span> 도형</button><button aria-label="지도" @click="stop();mapOpen=true">지도</button><button aria-label="튜토리얼" @click="help">?</button><button aria-label="설정" @click="stop(); settingsOpen = true">⚙</button></nav>
    </section>
    <SettingsMenu :open="settingsOpen" @close="settingsOpen = false"/>
    <FieldAtlas :open="mapOpen" @close="mapOpen=false"/>
  </main>
</template>

<style scoped>
.idle-clock{height:3px;position:relative;background:#08160e66;margin:0 -14px}.idle-clock i{display:block;height:100%;background:#c9b477;transition:width .1s linear}.idle-clock span{position:absolute;right:12px;top:-14px;font-size:9px;color:#c5c7a9;background:#192b20b3;border-radius:3px;padding:0 3px}.field-skills button{display:flex;align-items:center;gap:12px;min-height:44px;padding:7px 10px;color:#e1d6b0;background:#223527;border:1px solid #99aa7644;border-radius:6px}.field-skills button b{font-size:25px}.field-skills button small{color:#a4b69a;font-size:10px}
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
</style>
