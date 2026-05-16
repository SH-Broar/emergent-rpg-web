<script setup lang="ts">
/**
 * 풀스크린 로딩 오버레이.
 *
 * 데이터 fetch + 파싱이 끝나기 전까지는 게임 진입 자체가 무의미하다 — 빈
 * timeline·character 화면을 보이느니 *지금 로딩 중*임을 분명히 보여 준다.
 *
 * App.vue가 data.loading || !data.loaded 일 때 띄운다.
 */

defineProps<{
  message?: string;
}>();
</script>

<template>
  <div class="overlay" role="status" aria-live="polite">
    <div class="panel">
      <div class="ring" aria-hidden="true" />
      <p class="label">{{ message ?? '데이터를 불러오는 중…' }}</p>
      <p class="hint">잠시만 기다려 주세요</p>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: rgba(13, 14, 20, 0.96);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.panel {
  display: grid;
  gap: 0.8rem;
  justify-items: center;
  text-align: center;
}

.ring {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 3px solid rgba(192, 142, 255, 0.18);
  border-top-color: #c08eff;
  animation: spin 0.9s linear infinite;
}

.label {
  margin: 0;
  font-size: 1rem;
  color: #f6e8b8;
  letter-spacing: 0.04em;
}
.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #888;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
