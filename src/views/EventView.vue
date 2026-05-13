<script setup lang="ts">
/**
 * 이벤트 화면 — 본문 + 선택지 + *결과 화면*.
 *
 * 사용자 피드백: 결과를 한 번의 텍스트 타이밍 후 명시적으로 보여줄 것.
 * 카드/유물 획득은 *이름*으로 표시 (id 노출 X).
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { pickEvent } from '@/systems/event-runner';
import type { Event, EventChoice, EventChoiceEffect } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();

const currentEvent = ref<Event | undefined>();
const result = ref<{ lines: string[] } | null>(null);

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

const pool = computed<Event[]>(() => {
  const node = currentNode.value;
  if (!node) return [];
  return (node.contentRef?.eventIdPool ?? [])
    .map((id: string) => data.events.get(id))
    .filter((e: Event | undefined): e is Event => e !== undefined);
});

/**
 * 선택지의 효과들을 *런타임에 적용*하면서 결과 라인 수집.
 * event-runner의 selectChoice를 *대체*하여 *이름 lookup*까지 처리.
 */
function applyChoice(choice: EventChoice) {
  const lines: string[] = [];

  for (const eff of choice.effects) {
    applyEffectWithNames(eff, lines);
    if (eff.resultText) lines.push(eff.resultText);
  }

  result.value = { lines };
}

function applyEffectWithNames(effect: EventChoiceEffect, lines: string[]) {
  const r = run.data;

  if (effect.hpDelta !== undefined) {
    r.hp = Math.max(0, Math.min(r.maxHp, r.hp + effect.hpDelta));
    lines.push(effect.hpDelta >= 0 ? `HP +${effect.hpDelta}` : `HP ${effect.hpDelta}`);
  }
  if (effect.goldDelta !== undefined) {
    r.gold = Math.max(0, r.gold + effect.goldDelta);
    lines.push(effect.goldDelta >= 0 ? `골드 +${effect.goldDelta}` : `골드 ${effect.goldDelta}`);
  }
  if (effect.affinityDelta) {
    const a = effect.affinityDelta;
    r.npcAffinity[a.npcId] = (r.npcAffinity[a.npcId] ?? 0) + a.delta;
    const npcName = data.characters.get(a.npcId)?.name ?? a.npcId;
    lines.push(`${npcName} 친밀도 ${a.delta >= 0 ? '+' : ''}${a.delta}`);
  }
  if (effect.grantCardId) {
    const card = data.cards.get(effect.grantCardId);
    if (card) {
      run.addCardToCollection(card);
      lines.push(`카드 획득 — ${card.name} (컬렉션)`);
    } else {
      lines.push(`알 수 없는 카드 (${effect.grantCardId})`);
    }
  }
  if (effect.grantRelicId) {
    const relic = data.relics.get(effect.grantRelicId);
    if (relic) {
      r.relics.push(relic);
      lines.push(`유물 획득 — ${relic.name}`);
      if (!r.newRelicEncounters.includes(relic.id)) {
        r.newRelicEncounters.push(relic.id);
      }
    } else {
      lines.push(`알 수 없는 유물 (${effect.grantRelicId})`);
    }
  }
}

function choose(c: EventChoice) {
  applyChoice(c);
}

function leave() {
  router.push('/game/map');
}

onMounted(() => {
  currentEvent.value = pickEvent(pool.value);
  if (currentEvent.value) {
    run.markEventTriggered(run.data.currentNodeId, currentEvent.value.id);
  }
});
</script>

<template>
  <main class="event-view">
    <article v-if="currentEvent" class="event">
      <h1>{{ currentEvent.name }}</h1>
      <p class="body">{{ currentEvent.body }}</p>

      <!-- 선택지 -->
      <div v-if="!result" class="choices">
        <button
          v-for="(c, i) in currentEvent.choices"
          :key="i"
          class="choice"
          @click="choose(c)"
        >
          {{ c.label }}
        </button>
      </div>

      <!-- 결과 화면 -->
      <div v-else class="result">
        <h3>결과</h3>
        <ul class="result-list">
          <li v-for="(line, i) in result.lines" :key="i">{{ line }}</li>
          <li v-if="result.lines.length === 0" class="empty">조용한 결말.</li>
        </ul>
        <button class="leave" @click="leave">계속 →</button>
      </div>
    </article>
    <section v-else class="empty-event">
      <p>이 자리엔 사건이 없었다.</p>
      <button class="leave" @click="leave">계속 →</button>
    </section>
  </main>
</template>

<style scoped>
.event-view { max-width: 720px; margin: 0 auto; padding: 3rem 2rem; min-height: 100vh; }
.event h1 { color: #8eedff; margin-bottom: 1rem; }
.body { white-space: pre-line; line-height: 1.8; color: #d6d6e0; margin-bottom: 2rem; }
.choices { display: flex; flex-direction: column; gap: 0.7rem; }
.choice { padding: 1rem 1.2rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); color: inherit; border-radius: 8px; cursor: pointer; text-align: left; font: inherit; }
.choice:hover { background: rgba(142,237,255,0.1); border-color: rgba(142,237,255,0.4); }
.result { margin-top: 2rem; padding: 1.2rem; background: rgba(0,0,0,0.4); border-left: 3px solid #8eedff; border-radius: 4px; }
.result h3 { margin: 0 0 0.6rem; color: #8eedff; font-size: 1rem; }
.result-list { margin: 0 0 1rem; padding-left: 1.2rem; color: #d6d6e0; }
.result-list li { padding: 0.2rem 0; }
.empty { color: #6c6c7c; font-style: italic; list-style: none; padding-left: 0; }
.leave { padding: 0.6rem 1.2rem; background: rgba(192,142,255,0.2); border: 1px solid rgba(192,142,255,0.5); color: inherit; border-radius: 6px; cursor: pointer; font: inherit; }
.leave:hover { background: rgba(192,142,255,0.3); }
.empty-event { text-align: center; padding: 4rem; color: #6c6c7c; }
.empty-event p { font-style: italic; margin-bottom: 1.5rem; }
</style>
