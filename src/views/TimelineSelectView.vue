<script setup lang="ts">
/**
 * 시간대 선택 화면 (게임 시작 1단계).
 *
 * spec v2 Round 12: 게임 시작 = 연표 선택 → 캐릭터 선택.
 * Phase 2c 스텁: 하드코딩 더미 연표 1~3개 표시. Phase 2d에서 실제 연표 로드.
 */

import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';

const router = useRouter();
const ui = useUiStore();

interface TimelineStub {
  id: string;
  name: string;
  year: number;
  era: string;
  locked: boolean;
  tagline: string;
}

const timelines: TimelineStub[] = [
  {
    id: 'tl-peace-310',
    name: '평화의 310년',
    year: 310,
    era: '평온',
    locked: false,
    tagline: '겉으로는 잔잔하나, 봉인된 그림자가 꿈틀거리는 해.',
  },
  {
    id: 'tl-demon-rise',
    name: '마왕 부활 직전',
    year: 415,
    era: '위기',
    locked: true,
    tagline: '검은 별이 떠오르는 해. 어떤 영웅도 이 해를 외면할 수 없다.',
  },
  {
    id: 'tl-famine',
    name: '대기근의 해',
    year: 380,
    era: '결핍',
    locked: true,
    tagline: '땅이 거부한 해. 사람들은 서로의 식탁을 들여다본다.',
  },
];

function selectTimeline(t: TimelineStub) {
  if (t.locked) {
    ui.toast('warning', '아직 모노의 간섭이 닿지 않는 시대입니다.');
    return;
  }
  // Phase 2d: 실제 timeline 선택을 store에 저장
  router.push('/game/character-select');
}

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="tl-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>시간대 선택</h1>
      <p>임페리시아: "어느 해로 가시겠습니까? 그분의 시선이 닿는 곳까지만 갈 수 있습니다."</p>
    </header>

    <section class="grid">
      <button
        v-for="t in timelines"
        :key="t.id"
        class="card"
        :class="{ 'card--locked': t.locked }"
        :disabled="t.locked"
        @click="selectTimeline(t)"
      >
        <div class="card__year">{{ t.year }}년</div>
        <div class="card__name">{{ t.name }}</div>
        <div class="card__era">— {{ t.era }} —</div>
        <p class="card__tagline">{{ t.tagline }}</p>
        <span v-if="t.locked" class="card__lock">🔒 잠김</span>
      </button>
    </section>
  </main>
</template>

<style scoped>
.tl-view { max-width: 1000px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
.hdr h1 { color: #f6e8b8; }
.hdr p { color: #a4a4b0; font-style: italic; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.2rem; margin-top: 1.5rem; }
.card { display: flex; flex-direction: column; gap: 0.3rem; padding: 1.4rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: inherit; cursor: pointer; text-align: left; position: relative; transition: transform 120ms ease, background 120ms ease; }
.card:hover:not(.card--locked) { transform: translateY(-2px); background: rgba(255,255,255,0.08); }
.card--locked { opacity: 0.4; cursor: not-allowed; }
.card__year { font-size: 0.85rem; color: #888; }
.card__name { font-size: 1.4rem; font-weight: 600; color: #f6e8b8; }
.card__era { font-size: 0.9rem; color: #c08eff; }
.card__tagline { font-size: 0.9rem; color: #b6b6c4; margin: 0.5rem 0 0; }
.card__lock { position: absolute; top: 0.8rem; right: 0.8rem; color: #888; }
</style>
