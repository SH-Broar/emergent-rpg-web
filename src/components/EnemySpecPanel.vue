<script setup lang="ts">
/**
 * 전투 노드 스펙 표기 패널(2026-06-21) — 인정 게이트 [싸운다] 옆/보스 인트로에 적 스펙을 미리 보여준다.
 *
 *  - 일반/엘리트: run.previewStageEnemies → summarizeEnemies로 산출한 EnemySpec(적 수·체력·공격력·속도).
 *    프리뷰는 enterGridCombat과 *같은* buildCombatStage를 쓰므로 [싸운다] 시 나오는 적과 일치한다.
 *  - 보스: 미지의 위압 — 모든 항목을 `???`로(spec 없이 unknown=true).
 *
 * 순수 표시 컴포넌트(읽기 전용) — 상태를 바꾸지 않는다.
 */

import type { EnemySpec } from '@/systems/enemy-spec';

const props = defineProps<{
  /** 산출된 적 스펙. unknown=true(보스)면 무시되고 전부 ???로 표기. */
  spec?: EnemySpec | null;
  /** true면 보스(미지) — 모든 수치를 ???로. */
  unknown?: boolean;
}>();

/** 표기 행 정의 — [라벨, 값]. unknown이면 값은 전부 ???. */
function rows(): Array<{ label: string; value: string }> {
  if (props.unknown || !props.spec) {
    return [
      { label: '적', value: '???' },
      { label: '체력', value: '???' },
      { label: '공격', value: '???' },
      { label: '속도', value: '???' },
    ];
  }
  const s = props.spec;
  return [
    { label: '적', value: `${s.count}마리` },
    { label: '체력', value: `${s.hp}` },
    { label: '공격', value: `${s.attack}/턴` },
    { label: '속도', value: s.speed },
  ];
}
</script>

<template>
  <!-- span 기반(phrasing content) — GateView에선 <button> 안에 들어가므로 flow 요소(dl/div) 금지. -->
  <span class="enemy-spec">
    <span v-for="row in rows()" :key="row.label" class="enemy-spec__row">
      <span class="enemy-spec__label">{{ row.label }}</span>
      <span class="enemy-spec__value">{{ row.value }}</span>
    </span>
  </span>
</template>

<style scoped>
.enemy-spec {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
  margin: 0;
  padding: 0.5rem 0.2rem 0;
}
.enemy-spec__row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  text-align: center;
}
.enemy-spec__label {
  font-size: 0.72rem;
  color: #9a9aa8;
  letter-spacing: 0.03em;
}
.enemy-spec__value {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #ffcaca;
}
</style>
