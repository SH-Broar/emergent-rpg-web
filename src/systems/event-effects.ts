/**
 * 이벤트 customEffectId 핸들러 등록 — *데이터 드리븐 분기*를 위한 코드 슬롯.
 *
 * 데이터의 `custom = <id>`가 여기에 등록된 id를 부르면 핸들러가 실행된다.
 * 새 효과가 필요하면 이 파일에 한 줄 추가 + 데이터에 id 지정.
 *
 * 등록 시점: App.vue에서 본 모듈을 import — top-level side-effect로 자동 등록.
 */

import { registerEventEffect } from '@/systems/event-runner';
import type { ColorKey } from '@/systems/colors';

// === 회복 / 자원 ===
registerEventEffect('heal-full', (ctx) => {
  const r = ctx.run;
  const healed = r.maxHp - r.hp;
  r.hp = r.maxHp;
  ctx.lines.push(`체력 +${healed} (완전 회복)`);
});

registerEventEffect('gift-time-shards-3', (ctx) => {
  ctx.run.timeShards += 3;
  ctx.lines.push('시간의 조각 +3');
});

registerEventEffect('gift-time-shards-5', (ctx) => {
  ctx.run.timeShards += 5;
  ctx.lines.push('시간의 조각 +5');
});

// === 컬러 일괄 부스트 — 한 이벤트에서 8 컬러 모두 누적 ===
registerEventEffect('pulse-all-colors-3', (ctx) => {
  const c = ctx.run.colors as unknown as Record<string, number>;
  for (const k of ['fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark']) {
    c[k] = (c[k] ?? 0) + 3;
  }
  ctx.lines.push('컬러: 모든 컬러 +3');
});

// === 시드 단일 컬러 강화 — element는 customEffectId로 분기 ===
// 스케일 정합 (보스 클리어 = +5와 동급. 이벤트 1회 부스트의 *공식 수치*).
const colorPushers: Record<string, number> = {
  'push-fire-5': 5,
  'push-water-5': 5,
  'push-electric-5': 5,
  'push-iron-5': 5,
  'push-earth-5': 5,
  'push-wind-5': 5,
  'push-light-5': 5,
  'push-dark-5': 5,
};
for (const [id, amount] of Object.entries(colorPushers)) {
  const color = id.split('-')[1];
  registerEventEffect(id, (ctx) => {
    void import('@/systems/colors').then(({ applyColorBoost }) => {
      applyColorBoost(color as Parameters<typeof applyColorBoost>[0], amount, ctx.lines);
    });
  });
}

// === 시간 만료 직전에만 의미 있는 효과 — 남은 시간 +10 ===
registerEventEffect('time-extend-10', (ctx) => {
  ctx.run.remainingTime += 10;
  ctx.lines.push('남은 시간 +10');
});

// === 약한 단계 컬러 부스트 (+1) — 단서/잡 보상용. push-*-5보다 한 단계 약함.
// random  : 8 컬러 중 무작위.
// atk/def/mag : stats.ts 매핑 쌍 중 무작위 1개. (ATK=fire/electric, DEF=earth/iron, MAG=water/wind)
const COLOR_PAIRS_FOR_TAG: Record<string, ColorKey[]> = {
  atk: ['fire', 'electric'],
  def: ['earth', 'iron'],
  mag: ['water', 'wind'],
};
const ALL_8_COLORS: ColorKey[] = [
  'fire', 'water', 'electric', 'iron', 'earth', 'wind', 'light', 'dark',
];

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

registerEventEffect('random-color-1', (ctx) => {
  const color = pickRandom(ALL_8_COLORS);
  void import('@/systems/colors').then(({ applyColorBoost }) => {
    applyColorBoost(color, 1, ctx.lines);
  });
});

for (const tag of ['atk', 'def', 'mag'] as const) {
  registerEventEffect(`${tag}-color-1`, (ctx) => {
    const color = pickRandom(COLOR_PAIRS_FOR_TAG[tag]);
    void import('@/systems/colors').then(({ applyColorBoost }) => {
      applyColorBoost(color, 1, ctx.lines);
    });
  });
}

// === 재료 — 현재 노드의 권역 특산물 1개 ===
registerEventEffect('grant-region-specialty', (ctx) => {
  const run = ctx.run;
  const data = ctx.data;
  const map = data.nodeMaps.get(data.timelines.get(run.timelineId)?.nodeMapId ?? '');
  const node = map?.nodes.find((n) => n.id === run.currentNodeId);
  const region = node?.region
    ? map?.regions.find((rg) => rg.id === node.region)
    : undefined;
  if (!region?.specialtyItemId) {
    ctx.lines.push('(이 권역에 특산물 정의가 없다.)');
    return;
  }
  const itm = data.items.get(region.specialtyItemId);
  if (!itm) return;
  // run.addItem 호출이 필요하지만 ctx에는 store가 없음 — useRunStore 직접 호출.
  void import('@/stores/run').then(({ useRunStore }) => {
    useRunStore().addItem(itm);
  });
  ctx.lines.push(`특산물: ${itm.name}`);
});

// === 재료 — 희소 재료 1개 (Act 1 범용) ===
registerEventEffect('grant-rare-material', (ctx) => {
  const data = ctx.data;
  const rare = data.items.get('i-time-answer');
  if (!rare) return;
  void import('@/stores/run').then(({ useRunStore }) => {
    useRunStore().addItem(rare);
  });
  ctx.lines.push(`재료: ${rare.name}`);
});

// === 지속 요소(2일차+ 사건 노드 전용) — 전투 후 다른 노드에 영향. ===
// 축복: 앞으로 N번의 전투까지 보상 +25%.
registerEventEffect('grant-blessing', (ctx) => {
  ctx.run.blessingCombats = (ctx.run.blessingCombats ?? 0) + 4;
  ctx.lines.push('축복 — 앞으로 네 번의 전투까지 보상이 늘어난다');
});
// 방울 표식: 다음 일반 전투가 엘리트로 격상.
registerEventEffect('grant-bell-mark', (ctx) => {
  ctx.run.bellMarked = 1;
  ctx.lines.push('방울 표식 — 다음 일반 전투가 엘리트가 된다');
});
// 드래곤화: 모든 컬러가 일시 상승(3번의 전투 동안), 이후 원복.
registerEventEffect('grant-dragonform', (ctx) => {
  const boost = 8;
  const cols = ctx.run.colors as unknown as Record<string, number>;
  for (const k of Object.keys(cols)) cols[k] = (cols[k] ?? 0) + boost;
  ctx.run.dragonBoost = (ctx.run.dragonBoost ?? 0) + boost;
  ctx.run.dragonCombats = Math.max(ctx.run.dragonCombats ?? 0, 3);
  ctx.lines.push('드래곤화 — 모든 컬러가 일시적으로 솟구친다');
});
