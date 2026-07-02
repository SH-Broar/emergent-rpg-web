<script setup lang="ts">
/**
 * 앱 최상위 셸.
 *
 * - 마운트 시 게임 데이터 한 번 로드.
 * - 런 진행 중에는 *고정 HUD*를 상단에 표시 (HP/재화/시간/덱/유물 항상 확인).
 * - 덱 / 유물 모달.
 * - 라우터 뷰 + 전역 토스트.
 */

import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useDataStore } from '@/stores/data';
import { useRunStore } from '@/stores/run';
import GameHUD from '@/components/GameHUD.vue';
import CharacterMenu from '@/components/CharacterMenu.vue';
import InventoryMenu from '@/components/InventoryMenu.vue';
import SettingsMenu from '@/components/SettingsMenu.vue';
import EnhancePickModal from '@/components/EnhancePickModal.vue';
import DayBanner from '@/components/DayBanner.vue';
import LoadingOverlay from '@/components/LoadingOverlay.vue';
import ColorPopOverlay from '@/components/ColorPopOverlay.vue';
import RewardPanel from '@/components/RewardPanel.vue';
// side-effect: 이벤트 customEffect 핸들러 자동 등록.
import '@/systems/event-effects';

const ui = useUiStore();
const data = useDataStore();
const run = useRunStore();
const route = useRoute();

// 스크롤 컨테이너 핸들 — 윈도우 대신 이 요소가 스크롤을 전담한다.
const sceneScroller = ref<HTMLElement | null>(null);

// 라우트가 바뀌면 *새 화면은 항상 맨 위에서* 시작 — 이전 화면의 스크롤 위치가
// 남아 보이거나(클램프) 전환 직후 위치가 튀는 것을 막는다. 다음 tick(새 콘텐츠
// 마운트 후)에 0으로 리셋.
watch(
  () => route.path,
  () => {
    const el = sceneScroller.value;
    if (el) el.scrollTop = 0;
  },
);

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

    <!--
      transition의 직접 자식은 *항상 단일 루트 div*여야 한다.
      CombatView/BossView처럼 v-if/v-else 멀티루트(fragment) 뷰를 component로 직접
      넣으면 mode="out-in"의 leave→enter 핸드오프가 깨져, 한 번 전환 후 router-view가
      영구히 빈 화면이 된다(패배/보스 종료 후 메인 복귀 불가). wrapper div로 감싸
      transition이 보는 자식을 단일 요소로 고정한다.
    -->
    <!--
      스크롤은 이 컨테이너가 전담한다(윈도우/body는 overflow:hidden — style.css).
      키 큰 화면에서 스크롤한 뒤 짧은 화면으로 전환할 때 window.scrollY가 클램프되며
      화면이 튀던 문제를 차단(전환 시 watch가 scrollTop=0으로 리셋).
    -->
    <div ref="sceneScroller" class="scene-scroller">
      <router-view v-slot="{ Component, route: r }">
        <transition name="scene-fade" mode="out-in">
          <div :key="r.path" class="scene-root">
            <component :is="Component" />
          </div>
        </transition>
      </router-view>
    </div>

    <!-- M3: CharacterMenu (6 컬러 + 스탯 + 덱 + 동료) -->
    <CharacterMenu :open="characterOpen" @close="characterOpen = false" />
    <!-- M4: InventoryMenu (Day + 유물탭 + 아이템탭) -->
    <InventoryMenu :open="inventoryOpen" @close="inventoryOpen = false" />
    <!-- M5: SettingsMenu (현재 시대 + 런 포기) -->
    <SettingsMenu :open="settingsOpen" @close="settingsOpen = false" />

    <!-- 레벨업 강화 픽 (XP·각성 시스템) — 전투 승리 레벨업 시 자동, 캐릭터 메뉴에서도 진입. -->
    <EnhancePickModal v-if="run.active" />

    <!-- 하루 경과 배너 (런 중에만 의미) -->
    <DayBanner v-if="run.active" />

    <!-- 글로벌 로딩 — 데이터 fetch·파싱 끝나기 전엔 풀스크린.
         게임 진입 전 buttons가 "눌리지 않는 듯" 보이는 문제 방지. -->
    <LoadingOverlay
      v-if="data.loading || !data.loaded"
      :message="data.error ? `데이터 로드 실패: ${data.error}` : undefined"
    />

    <!-- 컬러 상승 팝 (상단 중앙) — 컬러가 오를 때마다 잠깐 표시. -->
    <ColorPopOverlay />

    <!-- 보상 패널 (전리품/수확/우편) — 큐 앞을 순차 표시. 토스트와 달리 확인해야 닫힌다. -->
    <RewardPanel />

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
  /* 뷰포트 고정 셸 — 윈도우 스크롤 없음. 내부 .scene-scroller만 스크롤. */
  height: 100vh; height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 단일 스크롤 컨테이너 — 모든 화면 스크롤을 이 요소가 흡수한다.
   HUD는 position:fixed로 이 위에 떠 있고(흐름 밖), 각 화면은 :deep(main) padding-top으로
   HUD 높이만큼 비운다. dvh가 이 요소 = 뷰포트 높이라 화면 height:100dvh도 정확히 맞물린다. */
.scene-scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  /* 스크롤 중 인접 화면 콘텐츠 점프(스크롤 앵커) 억제. */
  overflow-anchor: none;
}
.scene-root { min-height: 100%; }
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

/* 순수 페이드 — translateY 제거. 세로 이동(±6px)이 화면 전환마다 수직 튐으로
   보이던 문제 방지(게임 시작/전투 진입 포함 모든 라우트 전환). */
.scene-fade-enter-active, .scene-fade-leave-active {
  transition: opacity 240ms ease-out;
}
.scene-fade-enter-from {
  opacity: 0;
}
.scene-fade-leave-to {
  opacity: 0;
}
.toast-enter-active, .toast-leave-active { transition: all 220ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(8px); }
</style>
