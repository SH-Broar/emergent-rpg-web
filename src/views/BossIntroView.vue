<script setup lang="ts">
/**
 * 보스 인트로 화면 (#4 격자 보스 인트로 복원).
 *
 * 보스/arc 노드 진입 시, *격자 전투 진입 전*에 끼우는 JRPG식 도입부.
 *  - 보스 이름 + 등장 텍스트(intro) 표시.
 *  - arc 보스: dialogue 대사 줄들 → [도전](challenge_label) / [회피](decline_label).
 *      도전 = enterGridBossCombat → /game/combat. 회피 = 맵 복귀(전투 없음·미클리어 유지·재진입 가능).
 *  - 연표 종말 보스: intro 후 [도전]만(회피 없음, 최종 게이트) → 격자 전투.
 *
 * 격자 전투 자체(GridCombatView)·승패 흐름(endGridCombat)은 *전혀 건드리지 않는다*. 이 화면은
 * 순수 도입부일 뿐이며, [도전]을 눌러야만 run.enterGridBossCombat이 호출된다.
 *
 * 씬 전환 소프트락 회귀 방지(project_scene_transition_softlock_fix): 단일 루트 wrapper로 고정.
 * 새로고침 안전: gridCombat 상태에 의존하지 않고 *현재 노드*에서 보스를 직접 해석하므로,
 *   이 화면 직접 진입(노드 kind=boss)도 정상 동작한다. 보스 노드가 아니면 맵으로 안전 복귀.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';
import { effectiveContent } from '@/systems/map';
import SceneCharacter from '@/components/SceneCharacter.vue';
import EnemySpecPanel from '@/components/EnemySpecPanel.vue';
import type { Boss } from '@/data/schemas';

const router = useRouter();
const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();

const timeline = computed(() => data.timelines.get(run.data.timelineId));

/** 현재 노드 — 보스 식별 대상. */
const currentNode = computed(() => {
  const map = data.nodeMaps.get(timeline.value?.nodeMapId ?? '');
  return map?.nodes.find((n) => n.id === run.data.currentNodeId);
});

/**
 * 현재 노드의 보스 정의 — enterGridBossCombat과 *동일한* 해석 순서.
 *   노드 contentRef.boss(권역 재추첨 반영) → effectiveContent.bossId → 연표 종말 보스 폴백.
 */
const boss = computed<Boss | undefined>(() => {
  const node = currentNode.value;
  const nodeBossId = node ? effectiveContent(node, run.data)?.bossId ?? node.contentRef?.bossId : undefined;
  const bossId = nodeBossId ?? timeline.value?.bossId;
  return bossId ? data.bosses.get(bossId) : undefined;
});

/** arc 보스인가 — 회피(다음에) 선택지 토글. */
const isArc = computed<boolean>(() => boss.value?.kind === 'arc');

/**
 * 대사 줄 목록 — arc면 dialogue, 그 외엔 intro 한 줄.
 * 둘 다 비어 있으면 description 한 줄로 폴백(완전 빈 화면 방지).
 */
const lines = computed<string[]>(() => {
  const b = boss.value;
  if (!b) return [];
  if (isArc.value && b.dialogue && b.dialogue.length) return b.dialogue;
  if (b.introText) return [b.introText];
  if (b.description) return [b.description];
  return [];
});

/**
 * 한 줄씩 진행 — 클릭/탭으로 다음 대사. 모든 줄을 다 본 뒤 선택지 노출.
 * 줄이 0개면 처음부터 선택지 노출.
 */
const lineIndex = ref(0);
const allLinesShown = computed(() => lineIndex.value >= lines.value.length - 1);
const shownLines = computed(() => lines.value.slice(0, lineIndex.value + 1));

function advance() {
  if (!allLinesShown.value) lineIndex.value += 1;
}

/** 도전 — 격자 보스 전투 진입. 여기서만 enterGridBossCombat 호출. */
function challenge() {
  if (run.enterGridBossCombat(run.data.currentNodeId)) {
    router.push('/game/combat');
  } else {
    ui.toast('error', '보스 전투를 시작할 수 없습니다.');
  }
}

/**
 * 회피(JRPG식 "다음에") — 전투 없이 맵 복귀, 보상 0, arc 노드는 *클리어 안 됨*.
 * 고정 재진입 노드라 다시 들어올 수 있다(싸워 이겨야 클리어). arc 전용.
 */
function decline() {
  router.push('/game/map');
}

onMounted(() => {
  if (!run.active || !boss.value) {
    ui.toast('warning', '보스 데이터 누락');
    router.push('/main');
  }
});
</script>

<template>
  <!-- 단일 루트 wrapper — transition mode="out-in" 소프트락 회귀 방지. -->
  <div class="boss-intro-root">
    <!-- 그림 프로토타입 placeholder — 도입부는 호기심 표정. -->
    <SceneCharacter v-if="ui.debug.showPortraits" mood="curious" />

    <main v-if="boss" class="boss-intro" @click="advance">
      <section class="intro">
        <h1>{{ boss.name }}</h1>
        <p v-if="boss.description" class="lore">{{ boss.description }}</p>

        <!-- 대사 — 한 줄씩 진행(클릭/탭). 다 보이기 전엔 "계속" 힌트. -->
        <div v-if="shownLines.length" class="dialogue">
          <p v-for="(line, i) in shownLines" :key="i" class="dialogue__line">{{ line }}</p>
        </div>

        <p v-if="!allLinesShown" class="advance-hint">화면을 누르면 이어진다…</p>

        <!-- 대사를 다 본 뒤에만 선택지 노출. -->
        <div v-else class="intro__choices" @click.stop>
          <!-- 보스 스펙은 미지의 위압 — 전부 ???로(unknown). -->
          <EnemySpecPanel class="boss-spec" unknown />
          <!-- arc: 도전/회피 둘 다. 연표 종말 보스: 도전만(최종 게이트). -->
          <button class="begin" @click="challenge">
            {{ isArc ? (boss.challengeLabel || '실력을 시험한다') : '싸움을 시작한다' }} →
          </button>
          <button v-if="isArc" class="decline" @click="decline">
            {{ boss.declineLabel || '다음에' }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.boss-intro-root { position: relative; min-height: 100vh; min-height: 100dvh; }
.boss-intro {
  min-height: 100vh; min-height: 100dvh;
  padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
  cursor: pointer;
}
.intro { max-width: 700px; margin: 4rem auto; text-align: center; }
.intro h1 { font-size: 3rem; color: #ffe88e; margin: 0; }
.lore { color: #b6b6c4; margin: 1rem 0; }
/* 대사 — 한 줄씩 누적. arc면 여러 줄, 연표보스면 intro 한 줄. */
.dialogue { margin: 2rem auto; max-width: 560px; display: flex; flex-direction: column; gap: 0.6rem; }
.dialogue__line { margin: 0; color: #e2dcc4; line-height: 1.5; font-style: italic; }
.advance-hint { color: #8a8a99; font-size: 0.85rem; margin-top: 1.5rem; user-select: none; animation: hint-pulse 1.6s ease-in-out infinite; }
@keyframes hint-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.intro__choices { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-top: 1.5rem; }
/* 보스 스펙(???) — 선택지 위 전폭 한 줄. */
.boss-spec { flex-basis: 100%; max-width: 320px; margin: 0 auto 0.5rem; }
.begin { padding: 0.8rem 1.5rem; background: rgba(255,232,142,0.2); border: 1px solid rgba(255,232,142,0.5); color: #ffe88e; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
.begin:hover { background: rgba(255,232,142,0.32); }
.decline { padding: 0.8rem 1.5rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.25); color: #b6b6c4; border-radius: 6px; cursor: pointer; font-weight: 600; font: inherit; }
.decline:hover { background: rgba(255,255,255,0.12); color: #d6d6e0; }

@media (max-width: 640px) {
  .intro { margin: 2.5rem auto; }
  .intro h1 { font-size: 2.2rem; }
  .boss-intro { padding: 0.6rem 0.6rem calc(0.6rem + env(safe-area-inset-bottom, 0px)); }
}
</style>
