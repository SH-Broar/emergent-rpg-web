/**
 * 세이브 코드 — 메타 진행도(연구·히페리온·카오스·친밀도·도감·해금·영혼)와
 * 활성 런(현재 시드 + 노드/덱/카드/유물/HP/상태) 전체를 한 문자열로 인코딩/복원.
 *
 * 보안이 아니라 "한 눈에 알아보기 힘들게"를 목표로 한다: JSON → UTF-8 → 고정 키와
 * 반복 XOR → base64. 키는 코드에 박혀 있으니 누구나 풀 수 있지만, 손으로 값을 읽고
 * 고치는 것은 봉쇄된다.
 *
 * 복원은 ① localStorage의 메타/런 키를 직접 갈아끼우고 ② window.location.reload()
 * 로 Pinia 스토어를 새로 hydrate한다. 메모리상 store 상태와 localStorage 사이의
 * 불일치를 피하는 가장 단순하고 안전한 경로.
 */

import type { MetaProgress, RunState } from '@/data/schemas';

/** 기존 persistent 키(코드 발행/복원 / 전부 초기화 양쪽에서 참조). */
const META_KEY = 'rdc-meta-v1';
const RUN_KEY_V2 = 'rdc-active-run-v2';
const RUN_KEY_V1 = 'rdc-active-run-v1';

/** XOR 키 — 고정 상수. 보안 X, 가독성 차단용. */
const XOR_KEY = 'rdc-fragara-code-v1';

/** 코드 블롭 포맷 — v1. */
interface SaveBlob {
  v: 1;
  ts: number;
  meta: MetaProgress | null;
  run: RunState | null;
}

// ---------------------------------------------------------------------------
// 인코딩 / 디코딩
// ---------------------------------------------------------------------------

function xorBytes(input: Uint8Array): Uint8Array {
  const k = new TextEncoder().encode(XOR_KEY);
  const out = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] ^ k[i % k.length];
  }
  return out;
}

/** Uint8Array → base64 — chunked로 큰 페이로드도 안전. */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function encodeBlob(json: string): string {
  const enc = new TextEncoder().encode(json);
  return bytesToBase64(xorBytes(enc));
}
function decodeBlob(b64: string): string {
  return new TextDecoder().decode(xorBytes(base64ToBytes(b64)));
}

// ---------------------------------------------------------------------------
// 텍스트 입출력
// ---------------------------------------------------------------------------

/**
 * 현재 진행을 한 문자열로 직렬화 — 복사해 두면 그대로 코드로 복원할 수 있다.
 * 실패하면 빈 문자열(원인 콘솔 경고).
 */
export function exportSaveCode(): string {
  try {
    const meta = readMeta();
    const run = readRun();
    const blob: SaveBlob = { v: 1, ts: Date.now(), meta, run };
    return encodeBlob(JSON.stringify(blob));
  } catch (err) {
    console.warn('[save-code] export 실패:', err);
    return '';
  }
}

/**
 * 텍스트 코드를 복호화하여 localStorage 메타/런 키를 *교체*한 뒤 페이지를 새로
 * 고친다. 형식이 깨진 코드는 false 반환(현재 진행은 건드리지 않음).
 */
export function importSaveCode(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  try {
    const blob = JSON.parse(decodeBlob(trimmed)) as SaveBlob;
    if (!blob || blob.v !== 1) return false;
    // 메타 — 비어 있으면 키 제거(다음 init에서 fresh meta).
    if (blob.meta) safeSet(META_KEY, JSON.stringify(blob.meta));
    else safeRemove(META_KEY);
    // 런 — 비어 있으면 양쪽 키 제거.
    if (blob.run) safeSet(RUN_KEY_V2, JSON.stringify(blob.run));
    else { safeRemove(RUN_KEY_V2); safeRemove(RUN_KEY_V1); }
    // 옛 v1 키는 항상 정리(v2 박은 직후 v1이 남아 마이그레이션 경로로 빠지지 않도록).
    safeRemove(RUN_KEY_V1);
    // Pinia hydrate는 페이지 재시작이 가장 깨끗.
    window.location.reload();
    return true;
  } catch (err) {
    console.warn('[save-code] import 실패:', err);
    return false;
  }
}

/**
 * 디버그 — 전부 초기화. 메타·런·옛 키까지 싹 비우고 페이지를 새로 고쳐
 * 깨끗한 상태로 재시작한다. 사용자가 명시적으로 확인한 후에만 호출할 것.
 */
export function factoryResetAll(): void {
  try {
    safeRemove(META_KEY);
    safeRemove(RUN_KEY_V1);
    safeRemove(RUN_KEY_V2);
  } finally {
    window.location.reload();
  }
}

// ---------------------------------------------------------------------------
// localStorage 접근 — 비활성 환경(시크릿 모드/스토리지 차단)에서 throw 방지.
// ---------------------------------------------------------------------------

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readMeta(): MetaProgress | null {
  const raw = safeGet(META_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as MetaProgress; }
  catch { return null; }
}

function readRun(): RunState | null {
  const raw = safeGet(RUN_KEY_V2) ?? safeGet(RUN_KEY_V1);
  if (!raw) return null;
  try { return JSON.parse(raw) as RunState; }
  catch { return null; }
}
