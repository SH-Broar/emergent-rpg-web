<script setup lang="ts">
/**
 * 설정 메뉴 — 글로벌 모달 (M5 + Round2).
 *
 * 섹션:
 *   1) 현재 시대 — timeline.name + era
 *   2) 런 포기 — 인라인 confirm UI → endRun + absorbRunIntoMeta + reset + router /main
 *
 * Round2 ⚠3: native `confirm()` 제거 → InventoryMenu teleport sub-modal과 동일한
 * 인라인 confirm 패턴(`confirmStep` ref + 두 버튼).
 */

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const run = useRunStore();
const data = useDataStore();
const ui = useUiStore();
const router = useRouter();

/** 프로토타입 토글 — 기존 setDebugFlag 패턴을 그대로 사용해 localStorage 영속. */
function togglePortraits(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  ui.setDebugFlag('showPortraits', checked);
}

const timeline = computed(() => data.timelines.get(run.data.timelineId));

// 인라인 confirm 단계
const confirmStep = ref(false);

// 모달이 닫힐 때 confirm 단계도 초기화.
watch(() => props.open, (o) => {
  if (!o) confirmStep.value = false;
});

function askAbandon() {
  confirmStep.value = true;
}
function cancelAbandon() {
  confirmStep.value = false;
}
function doAbandon() {
  confirmStep.value = false;
  emit('close');
  run.endRun('free-end');
  import('@/systems/progression').then(({ absorbRunIntoMeta }) => {
    absorbRunIntoMeta(run.data);
    run.reset();
    router.push('/main');
  });
}
</script>

<template>
  <transition name="set-fade">
    <div v-if="open" class="set-backdrop" @click.self="emit('close')">
      <div class="set-modal" role="dialog" aria-label="설정 메뉴">
        <header class="set-modal__hdr">
          <h2>설정</h2>
          <button class="set-modal__x" aria-label="닫기" @click="emit('close')">×</button>
        </header>

        <div class="set-body">
          <!-- 1) 현재 시대 -->
          <section class="set-sec">
            <h3 class="set-sec__title">현재 시대</h3>
            <div class="set-era">
              <span class="set-era__name">{{ timeline?.name ?? '—' }}</span>
              <span v-if="timeline?.era" class="set-era__sub">{{ timeline.era }}</span>
            </div>
          </section>

          <!-- 2) 프로토타입 — 그림 placeholder 토글 (기본 OFF). -->
          <section class="set-sec">
            <h3 class="set-sec__title">프로토타입</h3>
            <p class="set-hint">캐릭터가 들어갈 자리에 도형이 표시됩니다. 그림 작업용 미리보기로, 게임 진행에는 영향이 없습니다.</p>
            <label class="set-toggle">
              <input
                type="checkbox"
                :checked="ui.debug.showPortraits"
                @change="togglePortraits"
              />
              <span>그림 프로토타입 (도형 placeholder 표시)</span>
            </label>
          </section>

          <!-- 3) 런 포기 -->
          <section class="set-sec">
            <h3 class="set-sec__title">런</h3>
            <p class="set-hint">진행 중인 런을 포기합니다. 진행도(컬러·도감 등)는 메타에 반영되고, 활성 런은 종료됩니다.</p>
            <button
              v-if="!confirmStep"
              class="set-btn set-btn--danger"
              @click="askAbandon"
            >런 포기</button>

            <!-- 인라인 confirm (Round2 ⚠3 — native confirm 제거) -->
            <transition name="set-fade">
              <div v-if="confirmStep" class="set-confirm">
                <p class="set-confirm__q">정말로 이 런을 포기하시겠습니까?</p>
                <div class="set-confirm__actions">
                  <button class="set-btn set-btn--danger" @click="doAbandon">정말 포기</button>
                  <button class="set-btn" @click="cancelAbandon">취소</button>
                </div>
              </div>
            </transition>
          </section>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.set-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: 1rem;
}
.set-modal {
  max-width: 480px;
  width: 100%;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #16171f;
  border: 1px solid rgba(192, 142, 255, 0.4);
  border-radius: 12px;
  padding: 1.1rem 1.2rem 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}
.set-modal__hdr {
  display: flex;
  align-items: center;
  margin-bottom: 0.6rem;
}
.set-modal__hdr h2 { flex: 1; color: #f6e8b8; margin: 0; font-size: 1.2rem; }
.set-modal__x { background: none; border: none; color: #888; cursor: pointer; font-size: 1.4rem; line-height: 1; }
.set-modal__x:hover { color: #f6e8b8; }

.set-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.set-sec__title {
  font-size: 0.78rem;
  color: #c0b693;
  margin: 0 0 0.4rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.set-era {
  background: rgba(255, 255, 255, 0.04);
  padding: 0.55rem 0.8rem;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}
.set-era__name { color: #f6e8b8; font-size: 1.02rem; font-weight: 600; }
.set-era__sub { color: #a4a4b0; font-size: 0.78rem; }

.set-hint { font-size: 0.8rem; color: #888; margin: 0 0 0.5rem; line-height: 1.4; }

.set-btn {
  background: rgba(255, 255, 255, 0.06);
  color: #d6d6e0;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 120ms ease, border-color 120ms ease;
  align-self: flex-start;
}
.set-btn:hover { background: rgba(255, 255, 255, 0.12); }
.set-btn--danger {
  background: rgba(255, 100, 100, 0.15);
  border-color: rgba(255, 100, 100, 0.45);
  color: #ff8e8e;
}
.set-btn--danger:hover {
  background: rgba(255, 100, 100, 0.25);
  border-color: rgba(255, 100, 100, 0.7);
}

/* 인라인 confirm */
.set-confirm {
  margin-top: 0.4rem;
  padding: 0.8rem;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 8px;
  border: 1px solid rgba(255, 100, 100, 0.3);
  display: grid;
  gap: 0.6rem;
}
.set-confirm__q { color: #ff8e8e; margin: 0; font-size: 0.9rem; line-height: 1.4; }
.set-confirm__actions { display: flex; gap: 0.5rem; }

/* 토글 한 줄 — 체크박스 + 라벨. */
.set-toggle {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.85rem;
  color: #d6d6e0;
  cursor: pointer;
  user-select: none;
  padding: 0.35rem 0.1rem;
}
.set-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #c08eff;
  cursor: pointer;
}

.set-fade-enter-active, .set-fade-leave-active { transition: opacity 180ms ease; }
.set-fade-enter-from, .set-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .set-modal { padding: 1rem; }
  .set-modal__hdr h2 { font-size: 1.05rem; }
}
</style>
