/**
 * 보스 클리어 보상 적용 — r4에서 분리.
 *
 * 종전: BossView.onVictory가 `run.data.gold += 30`만 하드코딩, 데이터의 rewards 무시.
 * 신규: Boss.rewards.{unlockKeys, soulGain, grantCodexEntries, procContext}를 모두 적용.
 *
 * 골드(+30)는 스키마에 별도 필드가 없어 r4에서는 기본값 유지. 미래에 Boss.rewards.gold?를
 * 추가하면 그 값을, 없으면 30 폴백 — 이 정책은 다음 데이터 라운드에서 결정.
 */

import type { Boss } from '@/data/schemas';
import { useRunStore } from '@/stores/run';
import { useDataStore } from '@/stores/data';
import { useMetaStore } from '@/stores/meta';
import { useCodexStore } from '@/stores/codex';
import { useUiStore } from '@/stores/ui';
import { applyColorBoost } from '@/systems/colors';
import { revealNextTierOnClear, recordBestChaos } from '@/systems/chaos';

const DEFAULT_BOSS_GOLD = 30;
const BOSS_COLOR_BOOST = 5;
const BOSS_RARE_MATERIAL_ID = 'i-time-answer';

export function applyBossRewards(boss: Boss): void {
  const run = useRunStore();
  const data = useDataStore();
  const meta = useMetaStore();
  const codex = useCodexStore();
  const ui = useUiStore();
  const r = run.data;
  const rw = boss.rewards;

  // 1) 골드 — 스키마에 별도 필드가 없으므로 기본 +30 유지.
  r.gold += DEFAULT_BOSS_GOLD;

  // === 사용자 사양: 보스 클리어 시 *희소 재료 1개* + *권역 컬러 부스트 +5*. ===
  // bossesCleared로 *첫 클리어 여부* 추적 — 중복 호출 시 재드롭 X.
  if (!r.bossesCleared.includes(boss.id)) {
    // (a) 희소 재료 1개 무조건 드롭.
    const rareMat = data.items.get(BOSS_RARE_MATERIAL_ID);
    if (rareMat) {
      run.addItem(rareMat);
      ui.toast('success', `보스 보상 — *희소 재료* '${rareMat.name}'`);
    }
    // (b) 보스가 위치한 노드의 권역 컬러에 +5.
    const map = data.nodeMaps.get(data.timelines.get(r.timelineId)?.nodeMapId ?? '');
    const node = map?.nodes.find((n) => n.id === r.currentNodeId);
    const region = node?.region
      ? map?.regions.find((rg) => rg.id === node.region)
      : undefined;
    if (region?.primaryColor) {
      const delta = applyColorBoost(region.primaryColor, BOSS_COLOR_BOOST);
      if (delta > 0) {
        ui.toast('success', `보스 권역 컬러 — ${region.primaryColor} +${delta}`);
      }
    }
  }

  // === 카오스 도전-점수 (Phase A, Round 9) — *런 클리어/승리* 처리. ===
  //  ① 진열 게이트: 활성 카오스 ≥1개로 클리어하면 다음 티어 1칸 진열(min 4).
  //  ② 연표별 최고 점수 갱신.
  //  *매 클리어* 평가 — first-clear 블록 밖에 둔다(보스-보상은 승리 시에만 호출됨).
  revealNextTierOnClear(r);
  recordBestChaos(r);

  // rewards 자체가 누락된 보스 데이터 호환 (TypeError 방지).
  if (!rw) return;

  // 2) unlockKeys → meta.unlockedKeys + 콘텐츠 ID push (패턴 매칭)
  if (rw.unlockKeys) {
    for (const k of rw.unlockKeys) {
      if (!meta.unlockedKeys.some((u) => u.key === k)) {
        const newKey = { key: k, source: 'composite' as const, grantedAt: Date.now() };
        meta.unlockedKeys.push(newKey);
        // 같은 패턴 해석을 게이지 임계 push와 공유.
        meta._applyUnlockKey(newKey);
        ui.toast('success', `해금: ${k}`);
      }
    }
    meta.persist();
  }

  // 3) soulGain → 메타 영혼 자원
  if (rw.soulGain) {
    meta.addSoul(rw.soulGain);
  }

  // 4) grantCodexEntries → codex 'boss' 슬롯에 강제 등록 (id별)
  if (rw.grantCodexEntries) {
    for (const id of rw.grantCodexEntries) {
      codex.register('boss', id);
    }
  }

  // 5) procContext → meta.procInputs 머지 (다음 런용 절차적 입력)
  if (rw.procContext) {
    meta.procInputs = { ...meta.procInputs, ...rw.procContext };
    meta.persist();
  }
}
