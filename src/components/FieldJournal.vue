<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { JOURNEY_QUESTS } from '@/data/journey-quests';
import { TIME_ALLIES, livingTimeAlly } from '@/systems/time-story';
import { FIELD_RECORDS } from '@/data/field-records';
import { currentJourney, goalProgress, goalApplies, questAvailable, questGoalsReady } from '@/systems/field-journey';
defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>(), run = useRunStore(), data = useDataStore();
const tab = ref('main');
const tabs = [{ id: 'main', label: '이야기' }, { id: 'regional', label: '지역' }, { id: 'evidence', label: '단서' }, { id: 'history', label: '완료' }];
const allies = computed(() => TIME_ALLIES.map(id => livingTimeAlly(run.data, id)).filter(Boolean));
const main = computed(() => currentJourney(run.data));
const entries = computed(() => JOURNEY_QUESTS.filter(q => {
  const state = run.data.field?.journey;
  if (tab.value === 'history') return !!state?.completed[q.id];
  if (tab.value === 'main') return q.id === main.value?.id;
  if (tab.value !== 'regional' || q.main || !questAvailable(run.data, q)) return false;
  return !!state?.accepted[q.id] || !!run.data.interactionWorld?.knowledge.player?.targets['npc:' + q.npcId];
}));
const evidence = computed(() => Object.entries(run.data.field?.journey?.readings ?? {}).map(([id, note]) => ({
  id, name: FIELD_RECORDS.find(r => r.id === id)?.name ?? '기록', ...note,
})));
function chapterLabel(q: typeof JOURNEY_QUESTS[number]) {
  const chain = q.main ? JOURNEY_QUESTS.filter(x => x.main) : JOURNEY_QUESTS.filter(x => q.series && x.series === q.series);
  return (q.series ?? q.chapter ?? '') + (chain.length ? ' · ' + (chain.findIndex(x => x.id === q.id) + 1) + '/' + chain.length : '');
}
function npcLabel(id: string) { return data.npcs.get(id)?.name ?? '주민'; }
function place(id: string) {
  const npc = data.npcs.get(id), map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  const known = run.data.interactionWorld?.knowledge.player?.targets['npc:' + id];
  return known ? (map?.nodes.find(n => n.id === known.nodeId.split('::')[0])?.label ?? '여행길') + '에서 만남' :
    map?.nodes.find(n => n.id === npc?.homeNodeId)?.label ?? '아직 만나지 못함';
}
function recipient(q: typeof JOURNEY_QUESTS[number]) { return run.data.field?.journey?.accepted[q.id] ? (q.turnInNpcId ?? q.npcId) : q.npcId; }
</script>
<template>
  <div v-if="open" class="journal-backdrop" @click.self="emit('close')" @keydown.esc.stop="emit('close')">
    <section role="dialog" aria-modal="true" aria-label="여행 수첩">
      <header><h2>여행 수첩</h2><button aria-label="수첩 닫기" @click="emit('close')">×</button></header>
      <nav><button v-for="item in tabs" :key="item.id" :aria-pressed="tab === item.id" @click="tab = item.id">{{ item.label }}</button></nav>
      <details v-if="allies.length && tab === 'main'" class="evidence"><summary>동행 · {{ allies.map(e => e!.name).join(' · ') }}</summary><p>던은 가까운 동료를 보호하고, 티프레는 공격하며 발을 묶는 힘을 풀어 준다. 지원 간격은 4턴이다.</p></details>
      <template v-if="tab === 'evidence'">
        <details v-for="note in evidence" :key="note.id" class="evidence"><summary>{{ note.name }}</summary><p v-for="line in note.lines" :key="line">{{ line }}</p></details>
        <p v-if="!evidence.length">살펴본 기록은 여기에 남는다.</p>
      </template>
      <template v-else>
        <article v-for="q in entries" :key="q.id">
          <small>{{ chapterLabel(q) }}</small><h3>{{ q.title }}</h3>
          <p>{{ npcLabel(recipient(q)) }} · {{ place(recipient(q)) }}</p>
          <template v-if="!run.data.field?.journey?.completed[q.id]">
            <p v-if="!run.data.field?.journey?.accepted[q.id]" class="objective">먼저 말을 걸어 보자.</p>
            <template v-else>
              <p v-for="(goal, i) in q.goals.filter(g => goalApplies(run.data, g))" :key="i" class="objective" :class="{ done: goalProgress(run.data, goal) >= (goal.amount ?? 1) }">
                {{ goalProgress(run.data, goal) >= (goal.amount ?? 1) ? '✓' : '·' }} {{ goal.label }}
                <b>{{ Math.min(goalProgress(run.data, goal), goal.amount ?? 1) }}/{{ goal.amount ?? 1 }}</b>
              </p>
              <p v-if="questGoalsReady(run.data, q)" class="ready">{{ q.completeOnBoss ? '마지막 일을 마무리하자.' : '만나서 이야기하자.' }}</p>
              <details><summary>부탁 다시 읽기</summary><p>{{ q.reminder }}</p></details>
            </template>
          </template>
          <p v-else class="completed">{{ q.finish }}</p>
        </article>
        <p v-if="!entries.length">{{ tab === 'history' ? '아직 마친 부탁이 없다.' : tab === 'regional' ? '만난 주민들의 부탁을 이곳에서 확인할 수 있다.' : '이번 여정의 이야기를 마쳤다.' }}</p>
      </template>
    </section>
  </div>
</template>
<style scoped>
.journal-backdrop{position:fixed;inset:0;z-index:955;background:#0d181dda;display:grid;place-items:center;padding:12px;color:#e5debc}
.journal-backdrop section{width:min(100%,450px);max-height:88dvh;overflow:auto;box-sizing:border-box;background:#182a22;border:1px solid #68715a;border-radius:12px;padding:16px}
header,nav{display:flex;align-items:center;gap:6px}header{justify-content:space-between}h2{margin:0;font-size:18px}h3{margin:5px 0;font-size:16px}
button{font:inherit;min-width:0;min-height:40px;padding:6px 10px;border:1px solid #68715a;background:#263c30;color:#e5debc;border-radius:5px}button[aria-pressed=true]{border-color:#d9c88b}
nav{margin:12px 0}nav button{flex:1}article,.evidence{border-top:1px solid #68715a66;padding:16px 0}small{font-size:10px;letter-spacing:.08em;color:#ccbc82}
p,details{font-size:12px;line-height:1.7;color:#afbea8;margin:6px 0}.objective{display:flex;gap:6px;color:#e5debc}.objective b{margin-left:auto;white-space:nowrap;font-weight:400}
.done{color:#9eaf96}.ready{color:#dcc885}summary{cursor:pointer}.completed{color:#b8c6ad}
</style>
