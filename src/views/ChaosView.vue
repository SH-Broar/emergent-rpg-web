<script setup lang="ts">
/**
 * 카오스 화면 — 매 런 단위 특수 기능 토글.
 *
 * 사용자 정의 (spec):
 *   - 연구는 *되돌아가지 않는* 영구 해금
 *   - 카오스는 *매 판 열었다 닫았다* 하는 특수 기능
 */

import { useRouter } from 'vue-router';
import { useChaosStore } from '@/stores/chaos';

const router = useRouter();
const chaos = useChaosStore();

function back() {
  router.push('/main');
}
</script>

<template>
  <main class="chaos-view">
    <header class="hdr">
      <button class="back" @click="back">← 메인 메뉴</button>
      <h1>카오스</h1>
    </header>

    <section v-if="chaos.catalog.length === 0" class="empty">
      <p>등록된 카오스가 없습니다.</p>
    </section>

    <section v-else class="modifiers">
      <label v-for="m in chaos.catalog" :key="m.id" class="modifier">
        <input
          type="checkbox"
          :checked="chaos.isActive(m.id)"
          @change="chaos.setActive(m.id, ($event.target as HTMLInputElement).checked)"
        />
        <span class="modifier__body">
          <span class="modifier__name">{{ m.name }}</span>
          <span class="modifier__desc">{{ m.description }}</span>
        </span>
      </label>
    </section>

    <footer v-if="chaos.activeList.length > 0" class="footer">
      <small>활성: {{ chaos.activeList.length }}개</small>
    </footer>
  </main>
</template>

<style scoped>
.chaos-view { max-width: 700px; margin: 0 auto; padding: 2rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
h1 { color: #f6e8b8; margin: 0; }
.empty { padding: 3rem 1rem; color: #6c6c7c; text-align: center; }
.modifiers { display: flex; flex-direction: column; gap: 0.8rem; margin-top: 1.5rem; }
.modifier { display: flex; gap: 0.8rem; padding: 0.8rem 1rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; cursor: pointer; }
.modifier:hover { background: rgba(255,255,255,0.08); }
.modifier__body { display: flex; flex-direction: column; }
.modifier__name { font-weight: 600; color: #f6e8b8; }
.modifier__desc { font-size: 0.85rem; color: #888; }
.footer { margin-top: 1.5rem; text-align: right; color: #6c6c7c; }
</style>
