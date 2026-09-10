<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
const dialog = ref<HTMLDialogElement | null>(null);
const topics = [
  { id: 'combat', name: '전투' }, { id: 'colors', name: '컬러' },
  { id: 'life', name: '생활' }, { id: 'world', name: '주변' },
] as const;
// A small, isolated practice scene. It never reads or writes the active run.
const step = ref(0);
const moving = ref(false);
const subject = ref<'food' | 'wood'>('food');
const collected = ref<string[]>([]);
const feedback = ref('');
const lesson = computed(() => topics.findIndex(t => t.id === ui.tutorialTopic));
const done = computed(() => ui.tutorialTopic === 'world' ? collected.value.length === 2
  : step.value >= (ui.tutorialTopic === 'colors' ? 2 : 3));
const prompt = computed(() => {
  if (ui.tutorialTopic === 'combat') return ['이동을 누르고 빛나는 칸을 선택하세요.', '이제 마물이 사거리 안에 있습니다.', '계획 실행으로 두 행동을 이어보세요.', '이동 → 공격. 카드 없이도 싸울 수 있습니다.'][step.value];
  if (ui.tutorialTopic === 'colors') return ['마물이 선 칸을 적셔보세요.', '젖은 마물에게 전격을 이어보세요.', '전격 7 + 젖음 4 = 피해 11'][step.value];
  if (ui.tutorialTopic === 'life') return ['씨앗을 심어보세요.', '작물은 두고 원정을 다녀오세요.', '시간이 흐르는 동안 다 자랐습니다.', '수확 완료 · 생활 경험 +1'][step.value];
  return '같은 행동도 소유와 노동에 따라 다르게 받아들여집니다.';
});
const rules = computed(() => ({
  combat: ['라운드마다 행동 3회. 카드도 1회를 씁니다.', '이동·공격·방어는 마나가 들지 않습니다. 적의 공격 범위는 마물을 눌러 확인합니다.', '즉시 카드는 바로 발동하고, 나머지는 계획 실행 때 처리됩니다. 보급품을 회수해 출구로 철수하는 전장도 있습니다.'],
  colors: ['컬러는 사물과 인물의 성질입니다.', '물 + 전격은 추가 피해, 물 + 불은 연기를 만듭니다. 불은 그 위의 아군도 해칩니다.', '손패의 효과 펼치기로 카드 효과를 확인합니다. 획득한 카드는 캐릭터 메뉴에서 덱을 바꿔 쓸 수 있습니다.'],
  life: ['일반 작업은 즉시, 정성껏은 재료와 솜씨로 품질을 높입니다.', '생산은 떠나 있어도 진행됩니다. 돌봄은 선택이며, 다른 이도 현장을 이용할 수 있습니다.', '수확·채집·납품으로 숙련이 오릅니다. 숙련 2는 자동 돌봄, 3은 생산 방식 선택, 5는 산출 +1.'],
  world: ['대상을 고르면 가능한 행동이 나타납니다. 살펴보기에서 관찰한 성질을 확인합니다.', '자원은 풍부하지만 채집·가공에는 노동이 듭니다. 손을 많이 거친 물건일수록 노동을 존중하는지가 중요해집니다.', '아래는 두 가지 상황의 예시입니다. 실제 판단은 소유·노동·피해·종족·직업·관계에 따라 달라집니다. 기록에는 직접 본 일과 전해 들은 일을 구분합니다.'],
}[ui.tutorialTopic ?? 'combat']));

watch(() => ui.tutorialTopic, async value => {
  step.value = 0;
  moving.value = false;
  collected.value = [];
  feedback.value = '';
  subject.value = 'food';
  if (value) { await nextTick(); if (!dialog.value?.open) dialog.value?.showModal(); }
  else dialog.value?.close();
});
function close() { ui.tutorialTopic = null; }
function next() {
  const topic = topics[lesson.value + 1];
  if (topic) ui.tutorialTopic = topic.id;
  else close();
}
function move(cell: number) {
  if (ui.tutorialTopic !== 'combat' || !moving.value || cell !== 4 || step.value !== 0) return;
  moving.value = false;
  step.value = 1;
}
function take() {
  if (collected.value.includes(subject.value)) return;
  collected.value.push(subject.value);
  feedback.value = subject.value === 'food' ? '들곡 +1 · 함께 나누는 식량' : '목재 +1 · 장인은 자기 노동을 알아주길 바란다';
}
</script>

<template>
  <dialog ref="dialog" class="tutorial" aria-labelledby="tutorial-title" @close="close" @cancel="close" @click="event => { if (event.target === dialog) close(); }">
    <div class="tutorial__body">
      <header><h2 id="tutorial-title">튜토리얼</h2><button autofocus aria-label="튜토리얼 닫기" @click="close">닫기</button></header>
      <nav aria-label="연습 주제"><button v-for="topic in topics" :key="topic.id" :aria-pressed="ui.tutorialTopic === topic.id" @click="ui.tutorialTopic = topic.id">{{ topic.name }}</button></nav>
      <p class="tutorial__prompt" role="status">{{ prompt }}</p>

      <template v-if="ui.tutorialTopic === 'combat' || ui.tutorialTopic === 'colors'">
        <div class="practice-board" aria-label="연습 전장">
          <button v-for="cell in 9" :key="cell" :aria-label="cell === 6 ? '연습 마물' : `연습 칸 ${cell}`" :class="{ reachable: ui.tutorialTopic === 'combat' && moving && cell === 5, wet: ui.tutorialTopic === 'colors' && step > 0 && cell === 6 }" @click="move(cell - 1)">
            <span v-if="cell - 1 === (ui.tutorialTopic === 'combat' && step > 0 ? 4 : 3)" class="practice-player">나</span>
            <span v-if="cell === 6 && !done" class="practice-enemy">마물<small>{{ ui.tutorialTopic === 'colors' ? '11' : '5' }} HP</small></span>
            <span v-if="cell === 6 && done" class="practice-clear">✓</span>
          </button>
        </div>
        <div v-if="ui.tutorialTopic === 'combat'" class="practice-actions">
          <button :disabled="step !== 0" :aria-pressed="moving" @click="moving = !moving">이동</button>
          <button :disabled="step !== 1" @click="step = 2">공격 5</button>
          <button :disabled="step !== 2" @click="step = 3">계획 실행</button>
        </div>
        <div v-else class="practice-actions">
          <button :disabled="step !== 0" @click="step = 1">물길 열기</button>
          <button :disabled="step !== 1" @click="step = 2">도전성 섬광</button>
        </div>
      </template>

      <template v-else-if="ui.tutorialTopic === 'life'">
        <div class="practice-field" :class="{ grown: step >= 2 }" aria-label="연습 텃밭"><span aria-hidden="true">{{ ['· · ·', '♧ ♧ ♧', '♣ ♣ ♣', '✓'][step] }}</span><strong>{{ ['빈 텃밭', '자라는 중', '수확 가능', '들곡 +2'][step] }}</strong></div>
        <div class="practice-actions"><button :disabled="done" @click="step++">{{ ['씨앗 심기', '원정 다녀오기', '수확', '수확 완료'][step] }}</button></div>
      </template>

      <template v-else-if="ui.tutorialTopic === 'world'">
        <div class="practice-actions"><button :aria-pressed="subject === 'food'" @click="subject = 'food'; feedback = ''">공용 식량</button><button :aria-pressed="subject === 'wood'" @click="subject = 'wood'; feedback = ''">장인의 목재</button></div>
        <div class="practice-subject"><strong>{{ subject === 'food' ? '나누어 먹는 들곡' : '오래 손질한 목재' }}</strong><span>{{ subject === 'food' ? '공동 사용 · 적은 노동' : '장인 소유 · 많은 노동' }}</span><button :disabled="collected.includes(subject)" @click="take">{{ collected.includes(subject) ? '가져옴' : '가져가기' }}</button></div>
        <p class="practice-feedback" role="status">{{ feedback }}</p>
      </template>

      <details :key="ui.tutorialTopic ?? 'closed'"><summary>규칙 더 보기</summary><ul><li v-for="rule in rules" :key="rule">{{ rule }}</li></ul></details>
      <footer><span>{{ lesson + 1 }} / {{ topics.length }} · 연습용</span><button @click="next">{{ lesson === topics.length - 1 ? '마치기' : done ? '다음' : '건너뛰기' }}</button></footer>
    </div>
  </dialog>
</template>

<style scoped>
.tutorial { width: min(520px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; border: 1px solid #64617a; border-radius: 12px; background: #16171f; color: #eeeaf4; }
.tutorial::backdrop { background: #080910d9; }
.tutorial__body { padding: 20px; display: grid; gap: 18px; }
header, footer, nav, .practice-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
h2 { margin: 0; font-size: 1.2rem; color: #f6e8b8; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid #55536a; border-radius: 6px; font: inherit; color: inherit; background: #282535; cursor: pointer; }
button[aria-pressed="true"] { border-color: #f6e8b8; color: #f6e8b8; background: #393242; }
button:disabled { opacity: .4; cursor: default; }
button:focus-visible, summary:focus-visible { outline: 3px solid #c08eff; outline-offset: 2px; }
nav button, .practice-actions button { flex: 1; }
.tutorial__prompt { min-height: 44px; margin: 0; font-size: .95rem; line-height: 1.55; }
.practice-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; width: min(280px, 100%); justify-self: center; }
.practice-board button { aspect-ratio: 1; background: #252832; padding: 0; cursor: default; }
.practice-board button.reachable { background: #29466b; border: 2px dashed #8eedff; cursor: pointer; }
.practice-board button.wet { background: #204863; border-color: #8eedff; }
.practice-player, .practice-enemy { display: inline-grid; place-content: center; border-radius: 50%; width: 58px; height: 58px; background: #37584c; }
.practice-enemy { background: #683c4a; }
.practice-enemy small { font-size: .7rem; }
.practice-clear { color: #a8e8b8; font-size: 2rem; }
.practice-field { height: 220px; display: grid; place-content: center; text-align: center; gap: 16px; background: #292820; border-radius: 8px; }
.practice-field > span { font-size: 3rem; color: #c2a36a; }
.practice-field.grown > span { color: #a8e8b8; }
.practice-subject { min-height: 160px; display: grid; align-content: center; text-align: center; gap: 14px; background: #292832; padding: 20px; border-radius: 8px; }
.practice-subject span, footer, details { color: #b6b6c4; font-size: .8rem; }
.practice-feedback { min-height: 42px; margin: 0; color: #a8e8b8; font-size: .9rem; }
summary { cursor: pointer; padding: 10px 0; }
ul { padding-left: 18px; line-height: 1.65; } li + li { margin-top: 8px; }
footer { border-top: 1px solid #393747; padding-top: 12px; }
@media (max-width: 400px) { .tutorial__body { padding: 14px; gap: 12px; } button { font-size: .85rem; padding: 6px 8px; } }
</style>
