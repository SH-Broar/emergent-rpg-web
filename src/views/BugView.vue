<script setup lang="ts">
/**
 * 버그 화면 — 특수 효과 토글 (개발자 모드).
 *
 * spec v2 Round 12: "버그" 창 = 디버그/치트 토글.
 */

import { useRouter } from 'vue-router';
import { useUiStore, type DebugFlags } from '@/stores/ui';
import { useMetaStore } from '@/stores/meta';

const router = useRouter();
const ui = useUiStore();
const meta = useMetaStore();

interface FlagDef {
  key: keyof DebugFlags;
  label: string;
  description: string;
}

const flags: FlagDef[] = [
  { key: 'infiniteMana', label: '무한 마나', description: '카드 비용 0으로 사용 가능' },
  { key: 'freezeEnemies', label: '적 동결', description: '적 행동 비활성화' },
  { key: 'fastMeta', label: '게이지 가속', description: '게이지 누적 ×10' },
  { key: 'unlockAll', label: '전체 해금', description: '모든 캐릭터·시간대·유물 사용 가능' },
  { key: 'verboseLog', label: '상세 로그', description: '콘솔에 모든 게임 이벤트 출력' },
];

function back() {
  router.push('/main');
}

function resetMeta() {
  if (confirm('정말 메타 진행을 모두 초기화하시겠습니까? 되돌릴 수 없습니다.')) {
    meta.resetAll();
    ui.toast('warning', '메타 진행이 초기화되었습니다');
  }
}
</script>

<template>
  <main class="bug-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>버그 — 특수 효과</h1>
      <p>개발자/QA 용도. 일반 플레이 시 끄세요.</p>
    </header>

    <section class="flags">
      <label v-for="f in flags" :key="f.key" class="flag">
        <input
          type="checkbox"
          :checked="ui.debug[f.key]"
          @change="ui.setDebugFlag(f.key, ($event.target as HTMLInputElement).checked)"
        />
        <span class="flag__body">
          <span class="flag__label">{{ f.label }}</span>
          <span class="flag__desc">{{ f.description }}</span>
        </span>
      </label>
    </section>

    <section class="danger">
      <h2>위험한 작업</h2>
      <button class="danger-btn" @click="resetMeta">메타 진행 전체 초기화</button>
    </section>
  </main>
</template>

<style scoped>
.bug-view {
  max-width: 700px;
  margin: 0 auto;
  padding: 2rem;
}
.hdr h1 {
  color: #ff8e8e;
}
.back {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c0b693;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}
.flags {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-top: 1.5rem;
}
.flag {
  display: flex;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  background: rgba(255, 100, 100, 0.05);
  border: 1px solid rgba(255, 100, 100, 0.2);
  border-radius: 6px;
  cursor: pointer;
}
.flag:hover {
  background: rgba(255, 100, 100, 0.1);
}
.flag__body {
  display: flex;
  flex-direction: column;
}
.flag__label {
  font-weight: 600;
  color: #ffcdcd;
}
.flag__desc {
  font-size: 0.85rem;
  color: #888;
}
.danger {
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 100, 100, 0.3);
}
.danger h2 {
  color: #ff8e8e;
}
.danger-btn {
  background: #7f1d1d;
  color: #fecaca;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 6px;
  cursor: pointer;
}
.danger-btn:hover {
  background: #991b1b;
}
</style>
