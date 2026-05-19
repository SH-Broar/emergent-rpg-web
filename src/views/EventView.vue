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
import { useUiStore } from '@/stores/ui';
import {
  pickEvent,
  isChoiceAvailable,
  invokeCustomEffect,
} from '@/systems/event-runner';
import { effectiveContent } from '@/systems/map';
import { applyAffinityDelta } from '@/systems/affinity';
import { rng } from '@/systems/rng';
import type { Card, Event, EventChoice, EventChoiceEffect } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const currentEvent = ref<Event | undefined>();
const result = ref<{ lines: string[] } | null>(null);
/** followupEventId 체인 가드 — 같은 이벤트 무한 루프 방지. */
const followupChain = ref<Set<string>>(new Set());

const currentNode = computed(() => {
  const map = data.nodeMaps.get(data.timelines.get(run.data.timelineId)?.nodeMapId ?? '');
  return map?.nodes.find((n: { id: string }) => n.id === run.data.currentNodeId);
});

const pool = computed<Event[]>(() => {
  const node = currentNode.value;
  if (!node) return [];
  // 권역 풀에서 재추첨된 eventIdPool도 반영.
  const content = effectiveContent(node, run.data);
  return (content.eventIdPool ?? [])
    .map((id: string) => data.events.get(id))
    .filter((e: Event | undefined): e is Event => e !== undefined);
});

/**
 * 선택지의 효과들을 *런타임에 적용*하면서 결과 라인 수집.
 * event-runner의 selectChoice를 *대체*하여 *이름 lookup*까지 처리.
 *
 * r4 확장: customEffectId / grantCardFromPool / followupEventId 처리 추가.
 */
function applyChoice(choice: EventChoice) {
  const lines: string[] = [];

  // 효과들을 순서대로 적용. 마지막 effect에 followupEventId가 있으면 체인 진입.
  let followupId: string | undefined;
  for (const eff of choice.effects) {
    applyEffectWithNames(choice, eff, lines);
    if (eff.resultText) lines.push(eff.resultText);
    if (eff.followupEventId) followupId = eff.followupEventId;
  }

  // followupEventId 처리 — chain 가드로 무한 루프 방지.
  if (followupId) {
    if (followupChain.value.has(followupId)) {
      lines.push(`(주의) 이미 흘러간 이야기로 다시 돌아가지 않는다.`);
    } else {
      const next = data.events.get(followupId);
      if (next) {
        followupChain.value.add(followupId);
        result.value = { lines }; // 현재 결과를 한 번 표시한 뒤,
        // followup을 사용자가 *결과 화면을 닫는 순간*이 아니라 *지금 바로* 이어가게 한다.
        // 사용자 경험: "결과 라인 + 다음 이벤트의 본문이 곧바로 이어진다."
        currentEvent.value = next;
        result.value = null;
        return;
      } else {
        lines.push(`(알 수 없는 후속 이벤트: ${followupId})`);
      }
    }
  }

  result.value = { lines };
}

function applyEffectWithNames(choice: EventChoice, effect: EventChoiceEffect, lines: string[]) {
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
    const npcName = data.npcs.get(a.npcId)?.name ?? data.characters.get(a.npcId)?.name ?? a.npcId;
    lines.push(`${npcName} 친밀도 ${a.delta >= 0 ? '+' : ''}${a.delta}`);
    applyAffinityDelta(a.npcId, a.delta, lines);
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
  // r4: 카드 풀에서 필터 후 추첨. rank / tag 둘 다 옵션.
  if (effect.grantCardFromPool) {
    const filt = effect.grantCardFromPool;
    const pool: Card[] = [...data.cards.values()].filter((c) => {
      if (filt.rank && c.rank !== filt.rank) return false;
      // tag 필터 — Card 스키마에 tags 필드가 *없으므로* 현재는 항상 통과.
      // 다음 데이터 라운드에 Card.tags 추가 시 자동 작동.
      void filt.tag;
      return true;
    });
    if (pool.length > 0) {
      const pick = pool[Math.floor(rng() * pool.length)];
      run.addCardToCollection(pick);
      lines.push(`카드 획득 — ${pick.name} (컬렉션)`);
    } else {
      lines.push(`(카드 풀이 비어 있다.)`);
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
  if (effect.grantClueId) {
    const clue = data.clues.get(effect.grantClueId);
    if (clue) {
      const added = run.addClue(clue);
      if (added) lines.push(`단서 — '${clue.name}'`);
    } else {
      lines.push(`알 수 없는 단서 (${effect.grantClueId})`);
    }
  }
  // r4: customEffectId — 등록된 핸들러 호출. 미등록 id는 console.warn + false.
  if (effect.customEffectId) {
    invokeCustomEffect(effect.customEffectId, {
      run: r,
      ui,
      data,
      choice,
      effect,
      lines,
    });
  }
}

function choose(c: EventChoice) {
  applyChoice(c);
}

/** 선택지 버튼 disabled 판단 — DSL 평가. */
function isAvailable(c: EventChoice): boolean {
  return isChoiceAvailable(c, run.data);
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

      <!-- 선택지 — r4: condition DSL이 false면 비활성화 -->
      <div v-if="!result" class="choices">
        <button
          v-for="(c, i) in currentEvent.choices"
          :key="i"
          class="choice"
          :disabled="!isAvailable(c)"
          :title="c.condition && !isAvailable(c) ? `조건 미달: ${c.condition}` : ''"
          @click="isAvailable(c) && choose(c)"
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
.choice:hover:not(:disabled) { background: rgba(142,237,255,0.1); border-color: rgba(142,237,255,0.4); }
.choice:disabled { opacity: 0.4; cursor: not-allowed; }
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
