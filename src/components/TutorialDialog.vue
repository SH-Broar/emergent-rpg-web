<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useUiStore } from '@/stores/ui';
import GesturePad from './GesturePad.vue';
import type { Gesture } from '@/systems/field-types';

const ui = useUiStore(), dialog = ref<HTMLDialogElement | null>(null);
const topics = [{ id: 'combat', name: '걷기' }, { id: 'colors', name: '도형' }, { id: 'life', name: '생활' }, { id: 'world', name: '대화' }] as const;
const step = ref(0), cell = ref(3), message = ref('');
const lesson = computed(() => topics.findIndex(t => t.id === ui.tutorialTopic));
const done = computed(() => step.value >= (ui.tutorialTopic === 'combat' || ui.tutorialTopic === 'world' ? 2 : 3));
const prompt = computed(() => {
  if (done.value) return '직접 해봤습니다. 다음으로 가볼까요?';
  if (ui.tutorialTopic === 'combat') return '빛나는 칸을 눌러 한 칸씩 걸어보세요.';
  if (ui.tutorialTopic === 'colors') return ['금이 간 물통을 바라보고 ∧를 그려보세요.', '빈 칸을 바라보고 ∨를 그려보세요.', '금이 간 물통을 향해 ╱를 그려보세요.'][step.value];
  if (ui.tutorialTopic === 'life') return ['씨앗을 들고 빈 밭에 ╲를 그려보세요.', '자리를 떠나도 작물은 자랍니다. 연습판을 톡 눌러 자란 모습을 보세요.', '여문 작물을 향해 톡 눌러보세요.'][step.value];
  return '주민을 향해 톡 누르면 대화가 시작됩니다.';
});
const rules = computed(() => ({
  combat: ['빈 칸을 누르거나 ↑ ↓ ← →를 그리면 상하좌우로 걸어갑니다.', '방향 입력으로 막힌 칸을 향하면 그곳의 대상과 상호작용합니다. 길 끝은 별도의 고정 구역으로 이어집니다.', '플레이 화면에서 입력이 없어도 시간이 흐릅니다. 대화·메뉴·그리는 중에는 멈춥니다.', '붉은 칸은 다음 공격 위치입니다. 던전 안에는 엘리트와 보스가 기다립니다. 지도에서 현재 구역과 세계의 연결을 볼 수 있습니다.'],
  colors: ['도형은 같은 원리로 작동하지만 대상과 손에 든 재료에 따라 결과가 달라집니다.', '∧ ∨는 물건의 위치, ⊂ ⊃는 재료의 흐름, ╱ ╲는 대상의 상태, ●는 교류에 관여합니다.', '기술 메뉴에서 도형별 연습선을 켤 수 있습니다. 삼각형은 어느 꼭짓점에서 시작해도 됩니다.', '기술은 2획·3획·4획·5획 도형에 장착합니다. 원은 4획이며, 별 전용 마법은 별을 정확히 그려야 합니다.'],
  life: ['손에 쓸 재료는 하단 소지품에서 고릅니다. 선택한 재료를 다시 누르면 빈손이 됩니다.', '작물은 떠나 있어도 자랍니다. 물을 주면 산출이 좋아지지만 돌봄을 강제하지 않습니다.', '놓아둔 물건은 NPC와 마물에게도 영향을 줍니다. 같은 물과 불, 힘과 재고 규칙을 공유합니다.'],
  world: ['대사는 한 번에 하나씩 표시됩니다. 톡 눌러 다음 대사를 듣습니다.', '주민은 직접 보거나 들은 일을 바탕으로 관계를 바꿉니다. 종족이 도덕성을 정하지는 않습니다.', '풍부한 자원과 가공에 든 노동은 다르게 여겨집니다. 마음껏 시도하고 반응을 살펴보세요.'],
}[ui.tutorialTopic ?? 'combat']));
watch(() => ui.tutorialTopic, async value => { step.value = 0; cell.value = 3; message.value = ''; if (value) { await nextTick(); if (!dialog.value?.open) dialog.value?.showModal(); } else dialog.value?.close(); });
function close() { ui.tutorialTopic = null; }
function next() { const topic = topics[lesson.value + 1]; if (topic) ui.tutorialTopic = topic.id; else close(); }
function walk(at: number) { if (ui.tutorialTopic === 'combat' && at === cell.value + 1 && step.value < 2) { cell.value = at; step.value++; } }
function draw(g: Gesture) {
  if (done.value) return;
  const expected = ui.tutorialTopic === 'colors' ? ['lift', 'place', 'strike'] : ui.tutorialTopic === 'life' ? ['tend', 'tap', 'tap'] : ['tap', 'tap'];
  if (g !== expected[step.value]) { message.value = '이 장면에서는 다른 반응이 없습니다.'; return; }
  step.value++; message.value = '';
}
</script>
<template>
  <dialog ref="dialog" class="tutorial" aria-labelledby="tutorial-title" @close="close" @cancel="close" @click="event => { if (event.target === dialog) close(); }">
    <div class="tutorial-body"><header><h2 id="tutorial-title">작은 연습</h2><button autofocus aria-label="튜토리얼 닫기" @click="close">×</button></header>
      <nav aria-label="연습 주제"><button v-for="topic in topics" :key="topic.id" :aria-pressed="ui.tutorialTopic === topic.id" @click="ui.tutorialTopic = topic.id">{{ topic.name }}</button></nav>
      <p class="prompt" role="status">{{ message || prompt }}</p>
      <div v-if="ui.tutorialTopic === 'combat'" class="practice-board" aria-label="이동 연습"><button v-for="at in 9" :key="at" :aria-label="`연습 칸 ${at}`" :class="{ reachable: at - 1 === cell + 1 && step < 2 }" @click="walk(at - 1)"><span v-if="at - 1 === cell" class="person">나</span><span v-else-if="at === 9" class="plant">♧</span></button></div>
      <div v-else class="practice-scene">
        <template v-if="ui.tutorialTopic === 'colors'"><span class="person">나</span><span class="prop" :class="{ raised: step === 1, wet: step === 3 }">{{ step === 3 ? '≋' : '▤' }}</span></template>
        <template v-else-if="ui.tutorialTopic === 'life'"><span class="plant">{{ ['· · ·', '♧ ♧ ♧', '♣ ♣ ♣', '✓'][step] }}</span><small>{{ ['빈 밭', '자라는 중', '여문 들곡', '들곡 +2 · 씨앗 +1'][step] }}</small></template>
        <template v-else><span class="person npc">주민</span><blockquote v-if="step > 0">{{ step === 1 ? '왔구나. 잠깐 쉬었다 갈래?' : '재료는 많아. 쓸 만하게 다듬는 데 손이 많이 갈 뿐이지.' }}</blockquote></template>
      </div>
      <div v-if="ui.tutorialTopic === 'combat'" class="practice-clock">12:{{ step === 2 ? '01:00' : step === 1 ? '00:30' : '00:00' }}</div>
      <GesturePad v-else compact :guide="ui.tutorialTopic==='colors'?['lift','place','strike'][step]:ui.tutorialTopic==='life'?['tend','tap','tap'][step]:'tap'" @gesture="draw" @unrecognized="message = '한 번 더 그려보세요.'"/>
      <details :key="ui.tutorialTopic ?? 'closed'"><summary>더 알아보기</summary><ul><li v-for="rule in rules" :key="rule">{{ rule }}</li></ul></details>
      <footer><span>{{ lesson + 1 }} / 4 · 연습용</span><button @click="next">{{ lesson === 3 ? '마치기' : done ? '다음' : '건너뛰기' }}</button></footer>
    </div>
  </dialog>
</template>
<style scoped>
.tutorial { width: min(460px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid #9ca680; border-radius: 14px; background: #1b2921; color: #e6e0c5; }.tutorial::backdrop { background: #06110ade; }.tutorial-body { padding: 18px; display: grid; gap: 12px; }header, footer, nav { display: flex; align-items: center; justify-content: space-between; gap: 7px; }h2 { margin: 0; font-size: 1.1rem; }button { min-height: 38px; padding: 6px 12px; border: 1px solid #7b876755; border-radius: 6px; font: inherit; font-size: 13px; color: inherit; background: #2d3b2d; cursor: pointer; }button[aria-pressed="true"] { border-color: #dfc98a; color: #f3dfa6; }nav button { flex: 1; }button:focus-visible, summary:focus-visible { outline: 2px solid #e4d297; outline-offset: 2px; }.prompt { min-height: 42px; margin: 0; font-size: 14px; line-height: 1.5; }.practice-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; width: min(240px, 100%); justify-self: center; }.practice-board button { aspect-ratio: 1; padding: 0; background: #526b47; }.practice-board .reachable { border: 2px dashed #e9d391; background: #778261; }.person { display: inline-grid; place-content: center; background: #90ac92; color: #223d2e; border-radius: 50% 50% 35% 35%; width: 44px; height: 48px; font-size: 13px; }.npc { background: #b7add1; }.plant { font-size: 35px; color: #c8bb76; }.practice-scene { min-height: 104px; display: flex; align-items: center; justify-content: center; gap: 24px; border-radius: 8px; background: #344934; position: relative; padding: 12px; }.practice-scene small { position: absolute; bottom: 8px; font-size: 11px; color: #cfceaf; }.practice-scene .plant { margin-bottom: 14px; }.prop { font-size: 47px; color: #c7b783; transition: transform .2s; }.prop.raised { transform: translate(-60px, -25px); }.prop.wet { color: #9cd5d8; }.practice-scene blockquote { margin: 0; max-width: 230px; border-radius: 8px; background: #e6ddbc; padding: 10px; color: #334b36; font-size: 13px; line-height: 1.5; }.practice-clock { text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }details, footer { color: #aebba1; font-size: 12px; }summary { cursor: pointer; padding: 6px 0; }ul { padding-left: 17px; line-height: 1.6; }li + li { margin-top: 6px; }footer { border-top: 1px solid #70846144; padding-top: 10px; }
</style>
