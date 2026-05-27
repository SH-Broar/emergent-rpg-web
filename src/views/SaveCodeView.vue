<script setup lang="ts">
/**
 * 세이브 코드 화면 — 메인 메뉴에서 진입.
 *
 * 두 가지 동작:
 *   ① 저장: 현재 메타+런을 한 문자열로 인코딩해 표시. 복사해 외부에 보관.
 *   ② 불러오기: 코드 문자열을 붙여넣고 진행 → localStorage 교체 + 페이지 새로고침.
 *
 * 디버그 영역에 "전부 초기화" — 메타·런 일괄 삭제 + 새로고침.
 */

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { exportSaveCode, factoryResetAll, importSaveCode } from '@/systems/save-code';

const router = useRouter();
const ui = useUiStore();

/** 저장 영역 — 현재 코드(처음엔 빈 문자열, 버튼 누르면 생성). */
const exportCode = ref('');
/** 불러오기 입력 — 사용자가 붙여넣는 코드. */
const importInput = ref('');
const confirmImport = ref(false);
const confirmReset = ref(false);

function doExport() {
  const code = exportSaveCode();
  if (!code) {
    ui.toast('error', '저장 코드 생성에 실패했다.');
    return;
  }
  exportCode.value = code;
  ui.toast('success', '저장 코드를 생성했다. 복사해 두자.');
}

async function copyToClipboard() {
  if (!exportCode.value) return;
  try {
    await navigator.clipboard.writeText(exportCode.value);
    ui.toast('success', '코드를 클립보드에 복사했다.');
  } catch {
    // navigator.clipboard 비활성 환경(http, 권한 거부) — fallback: 텍스트 영역 선택만.
    ui.toast('warning', '클립보드 접근 실패 — 직접 선택해 복사해야 한다.');
  }
}

function askImport() {
  if (!importInput.value.trim()) {
    ui.toast('warning', '먼저 코드를 붙여넣어야 한다.');
    return;
  }
  confirmImport.value = true;
}
function doImport() {
  confirmImport.value = false;
  const ok = importSaveCode(importInput.value);
  if (!ok) ui.toast('error', '코드가 잘못되었다 — 변경된 것은 없다.');
  // 성공이면 reload되어 이 코드는 더 이상 안 돈다.
}
function cancelImport() { confirmImport.value = false; }

function askReset() { confirmReset.value = true; }
function doReset() {
  confirmReset.value = false;
  factoryResetAll(); // 호출과 동시에 페이지 새로고침.
}
function cancelReset() { confirmReset.value = false; }

function goMain() { router.push('/main'); }
</script>

<template>
  <main class="save-view">
    <header class="head">
      <button class="back-btn" type="button" @click="goMain">‹ 메인</button>
      <h1>세이브 코드</h1>
      <p class="hint">현재 진행(연구·히페리온·카오스·친밀도·도감 + 활성 런)을 한 문자열로 묶어 보관/복원한다. 코드는 한 눈에 알아보기 힘들게 인코딩되어 있다.</p>
    </header>

    <section class="card">
      <header>
        <h2>저장</h2>
        <p class="hint">버튼을 누르면 *지금 이 순간*의 진행이 한 문자열로 만들어진다. 어딘가에 복사해 두면 그대로 복원할 수 있다.</p>
      </header>
      <button class="primary" type="button" @click="doExport">현재 진행을 코드로 만들기</button>
      <textarea
        v-if="exportCode"
        class="code"
        readonly
        rows="6"
        :value="exportCode"
        @focus="($event.target as HTMLTextAreaElement).select()"
      ></textarea>
      <div v-if="exportCode" class="row">
        <button class="secondary" type="button" @click="copyToClipboard">클립보드에 복사</button>
        <span class="muted">텍스트 박스를 누르면 자동 선택된다.</span>
      </div>
    </section>

    <section class="card">
      <header>
        <h2>불러오기</h2>
        <p class="hint">코드를 붙여넣고 진행하면 *현재 진행이 그 코드의 내용으로 교체*되며 페이지가 새로 시작된다.</p>
      </header>
      <textarea
        class="code"
        rows="6"
        placeholder="여기에 저장 코드를 붙여넣어라."
        v-model="importInput"
      ></textarea>
      <div class="row">
        <button class="primary" type="button" @click="askImport">코드로 불러오기</button>
        <button v-if="importInput" class="ghost" type="button" @click="importInput = ''">지우기</button>
      </div>
    </section>

    <section class="debug">
      <header>
        <h2>디버그</h2>
        <p class="hint">아래는 위험한 작업이다. 누르면 *메타·연구·런 등 모든 영구 진행*이 한 번에 비워진다.</p>
      </header>
      <button class="reset-btn" type="button" @click="askReset">전부 초기화</button>
    </section>

    <!-- 불러오기 확인 모달 -->
    <transition name="modal-fade">
      <div v-if="confirmImport" class="backdrop" role="dialog" aria-modal="true" @click.self="cancelImport">
        <div class="modal">
          <h2 class="modal__title">코드로 불러오기</h2>
          <p class="modal__body">
            지금 진행 중인 *모든 것*(메타·연구·런)이 입력한 코드 내용으로 교체된다. 되돌리려면 미리 현재 진행을 코드로 저장해 둬야 한다. 진행할까?
          </p>
          <div class="modal__actions">
            <button class="modal-btn modal-btn--no" type="button" @click="cancelImport">취소</button>
            <button class="modal-btn modal-btn--yes" type="button" @click="doImport">불러온다</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 전부 초기화 확인 모달 -->
    <transition name="modal-fade">
      <div v-if="confirmReset" class="backdrop" role="dialog" aria-modal="true" @click.self="cancelReset">
        <div class="modal modal--danger">
          <h2 class="modal__title">전부 초기화</h2>
          <p class="modal__body">
            메타 진행(연구·히페리온·카오스·친밀도·도감·해금·영혼)과 현재 진행 중인 런이 *전부* 삭제된다. 되돌릴 수 없다. 정말 진행할까?
          </p>
          <div class="modal__actions">
            <button class="modal-btn modal-btn--no" type="button" @click="cancelReset">취소</button>
            <button class="modal-btn modal-btn--yes modal-btn--danger" type="button" @click="doReset">전부 비운다</button>
          </div>
        </div>
      </div>
    </transition>
  </main>
</template>

<style scoped>
.save-view {
  max-width: 880px;
  margin: 0 auto;
  padding: 2.4rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
}

.head { display: flex; flex-direction: column; gap: 0.4rem; }
.head h1 { margin: 0; font-size: 1.6rem; color: #f6e8b8; }
.head .hint { margin: 0; color: #9a94ab; font-size: 0.86rem; line-height: 1.5; }
.back-btn {
  align-self: flex-start;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.14);
  color: #c9c3da;
  padding: 0.35rem 0.7rem;
  border-radius: 6px;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}
.back-btn:hover { background: rgba(255,255,255,0.08); }

.card {
  padding: 1rem 1.2rem;
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.04);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.card header { display: flex; flex-direction: column; gap: 0.3rem; }
.card h2 { margin: 0; font-size: 1.1rem; color: #f6e8b8; }
.card .hint { margin: 0; font-size: 0.82rem; color: #9a94ab; line-height: 1.5; }

.code {
  width: 100%;
  background: #0e0f16;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  padding: 0.7rem 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.78rem;
  color: #c9c3da;
  line-height: 1.45;
  resize: vertical;
  word-break: break-all;
}
.code:focus { outline: 2px solid #c08eff; outline-offset: 1px; }

.row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.muted { color: #6c6c7c; font-size: 0.78rem; }

.primary, .secondary, .ghost {
  padding: 0.55rem 0.95rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}
.primary {
  background: linear-gradient(180deg, #c0b693 0%, #a39872 100%);
  color: #1a1a26;
}
.secondary {
  background: rgba(192,142,255,0.16);
  color: #d8c4ff;
  border-color: rgba(192,142,255,0.32);
}
.ghost {
  background: transparent;
  color: #9a94ab;
  border-color: rgba(255,255,255,0.18);
}
.primary:hover, .secondary:hover, .ghost:hover { filter: brightness(1.08); }

.debug {
  margin-top: 0.4rem;
  padding: 1rem 1.2rem;
  border-radius: 10px;
  border: 1px dashed rgba(120,200,255,0.32);
  background: rgba(120,200,255,0.05);
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.debug h2 { margin: 0; font-size: 1.1rem; color: #cfe4ff; }
.debug .hint { margin: 0; font-size: 0.82rem; color: #9a94ab; line-height: 1.5; }
.reset-btn {
  align-self: flex-start;
  padding: 0.5rem 0.9rem;
  border-radius: 6px;
  border: 1px solid rgba(255,140,140,0.45);
  background: rgba(255,80,80,0.1);
  color: #ffc4c4;
  font: inherit;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
}
.reset-btn:hover { background: rgba(255,80,80,0.18); }

/* 모달 */
.backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-overlay);
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.modal {
  max-width: 480px;
  width: 100%;
  background: #16171f;
  border: 1px solid rgba(192,142,255,0.4);
  border-radius: 12px;
  padding: 1.4rem 1.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  display: grid;
  gap: 0.9rem;
}
.modal--danger { border-color: rgba(255,140,140,0.5); }
.modal__title { margin: 0; color: #f6e8b8; font-size: 1.15rem; }
.modal__body { margin: 0; color: #c9c3da; line-height: 1.55; font-size: 0.9rem; }
.modal__actions { display: flex; gap: 0.6rem; margin-top: 0.2rem; }
.modal-btn {
  flex: 1;
  padding: 0.6rem 0.9rem;
  border-radius: 6px;
  border: 1px solid transparent;
  font: inherit;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
}
.modal-btn--no {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.18);
  color: #c9c3da;
}
.modal-btn--yes {
  background: linear-gradient(180deg, #c0b693 0%, #a39872 100%);
  color: #1a1a26;
}
.modal-btn--danger {
  background: linear-gradient(180deg, #c08e8e 0%, #a37272 100%);
  color: #1a1a26;
}
.modal-btn:hover { filter: brightness(1.08); }

.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 180ms ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }
</style>
