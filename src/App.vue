<script setup lang="ts">
/**
 * 앱 최상위 셸.
 *
 * - 마운트 시 게임 데이터 한 번 로드.
 * - 런 진행 중에는 *고정 HUD*를 상단에 표시 (HP/재화/시간/덱/유물 항상 확인).
 * - 덱 / 유물 모달.
 * - 라우터 뷰 + 전역 토스트.
 */

import { onMounted, ref } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import GameHUD from '@/components/GameHUD.vue';
import CharacterMenu from '@/components/CharacterMenu.vue';
import InventoryMenu from '@/components/InventoryMenu.vue';
import SettingsMenu from '@/components/SettingsMenu.vue';
import DayBanner from '@/components/DayBanner.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';

const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();

// 3 메뉴 토글 (캐릭터 / 소지품 / 설정) — 상호 배타.
const characterOpen = ref(false);
const inventoryOpen = ref(false);
const settingsOpen = ref(false);

function toggleCharacter() {
  characterOpen.value = !characterOpen.value;
  if (characterOpen.value) { inventoryOpen.value = false; settingsOpen.value = false; }
}
function toggleInventory() {
  inventoryOpen.value = !inventoryOpen.value;
  if (inventoryOpen.value) { characterOpen.value = false; settingsOpen.value = false; }
}
function toggleSettings() {
  settingsOpen.value = !settingsOpen.value;
  if (settingsOpen.value) { characterOpen.value = false; inventoryOpen.value = false; }
}

onMounted(async () => {
  await data.ensureLoaded();
  if (data.error) {
    ui.toast('error', `데이터 로드 실패: ${data.error}`, 6000);
  }

  // 모든 RunState 변경마다 localStorage에 저장 (사용자 사양: 카드/유물/덱/턴/재화 *전부* 저장).
  // microtask로 합쳐 한 tick에 여러 mutation이 와도 1회 직렬화.
  let pendingSave = false;
  run.$subscribe(() => {
    if (pendingSave) return;
    pendingSave = true;
    queueMicrotask(() => {
      pendingSave = false;
      run.saveActiveRun();
    });
  });
});
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--in-run': run.active }">
    <!-- 고정 HUD (런 중에만) -->
    <GameHUD
      v-if="run.active"
      :character-open="characterOpen"
      :inventory-open="inventoryOpen"
      :settings-open="settingsOpen"
      @toggle-character="toggleCharacter"
      @toggle-inventory="toggleInventory"
      @toggle-settings="toggleSettings"
    />

    <router-view v-slot="{ Component, route }">
      <transition name="scene-fade" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </router-view>

    <!-- M3: CharacterMenu (6 컬러 + 스탯 + 덱 + 동료) -->
    <CharacterMenu :open="characterOpen" @close="characterOpen = false" />
    <!-- M4: InventoryMenu (Day + 유물탭 + 아이템탭) -->
    <InventoryMenu :open="inventoryOpen" @close="inventoryOpen = false" />
    <!-- M5: SettingsMenu (현재 시대 + 런 포기) -->
    <SettingsMenu :open="settingsOpen" @close="settingsOpen = false" />

    <!-- 하루 경과 배너 (런 중에만 의미) -->
    <DayBanner v-if="run.active" />

    <!-- 글로벌 로딩 — 데이터 fetch·파싱 끝나기 전엔 풀스크린.
         게임 진입 전 buttons가 "눌리지 않는 듯" 보이는 문제 방지. -->
    <LoadingOverlay
      v-if="data.loading || !data.loaded"
      :message="data.error ? `데이터 로드 실패: ${data.error}` : undefined"
    />

    <!-- 전역 토스트 -->
    <div class="toast-stack" aria-live="polite">
      <transition-group name="toast">
        <div
          v-for="t in ui.toasts"
          :key="t.id"
          class="toast"
          :class="`toast--${t.kind}`"
        >
          {{ t.message }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  width: 100%;
}
/* HUD 슬림화 (M2) — 1줄 4슬롯+3버튼이므로 padding 축소. */
.app-shell--in-run :deep(main) {
  padding-top: 3.0rem;
}
@media (max-width: 640px) {
  .app-shell--in-run :deep(main) {
    padding-top: 3.6rem;
  }
}

.toast-stack {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  z-index: var(--z-toast);
  pointer-events: none;
}

.toast { padding: 0.6rem 1rem; border-radius: 6px; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4); pointer-events: auto; }
.toast--info { background: #1f2937; color: #cbd5e1; }
.toast--success { background: #064e3b; color: #d1fae5; }
.toast--warning { background: #78350f; color: #fef3c7; }
.toast--error { background: #7f1d1d; color: #fecaca; }

.scene-fade-enter-active, .scene-fade-leave-active {
  transition: opacity 320ms ease-out, transform 320ms ease-out;
}
.scene-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.scene-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.toast-enter-active, .toast-leave-active { transition: all 220ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
