/**
 * Vue Router 설정.
 *
 * spec v2 Round 12: 메인 씬 (게임 시작/연구/버그) ↔ 게임 씬 (런 진행)
 * 분리. 한 라우터에서 다 처리하되 path prefix로 구분.
 */

import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  // === 메인 씬 ===
  {
    path: '/',
    redirect: '/main',
  },
  {
    path: '/main',
    name: 'main',
    component: () => import('@/views/MainView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/research',
    name: 'research',
    component: () => import('@/views/ResearchView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/chaos',
    name: 'chaos',
    component: () => import('@/views/ChaosView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/codex',
    name: 'codex',
    component: () => import('@/views/CodexView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/debug-battle',
    name: 'debug-battle',
    component: () => import('@/views/DebugBattleView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/save-code',
    name: 'save-code',
    component: () => import('@/views/SaveCodeView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/log',
    name: 'log',
    component: () => import('@/views/LogView.vue'),
    meta: { scene: 'main' },
  },
  {
    path: '/save-manage',
    name: 'save-manage',
    component: () => import('@/views/SaveManageView.vue'),
    meta: { scene: 'main' },
  },

  // === 게임 씬 ===
  {
    path: '/game/timeline-select',
    name: 'timeline-select',
    component: () => import('@/views/TimelineSelectView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/race-select',
    name: 'race-select',
    component: () => import('@/views/RaceSelectView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/chaos-select',
    name: 'chaos-select',
    component: () => import('@/views/ChaosSelectView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/map',
    name: 'game-map',
    component: () => import('@/views/MapView.vue'),
    meta: { scene: 'game' },
  },
  {
    // Phase D: 일반/엘리트 전투는 격자 전술 전투(GridCombatView)로 전환.
    //   구 CombatView.vue는 파일 유지(Phase F 제거 예정) — 라우트만 새 뷰로 repoint.
    //   #4: 보스 노드(kind 'boss')도 이 격자 전투로 진입.
    //       단 *인트로(BossIntroView)*를 거친 뒤(도전 선택 시) enterGridBossCombat→/game/combat.
    //   /game/boss(BossView)는 *디버그 전투(DebugBattleView)* 전용으로만 남는다(파일 보존).
    path: '/game/combat',
    name: 'game-combat',
    component: () => import('@/views/GridCombatView.vue'),
    meta: { scene: 'game' },
  },
  {
    // 보스 인트로 — 보스/arc 노드 진입 시 *격자 전투 전*에 끼우는 JRPG식 도입부.
    //   arc=도전/회피 분기, 연표 종말 보스=도전만. 도전 선택 시에만 enterGridBossCombat→/game/combat.
    path: '/game/boss-intro',
    name: 'game-boss-intro',
    component: () => import('@/views/BossIntroView.vue'),
    meta: { scene: 'game' },
  },
  {
    // 인정 게이트(납품 시스템 v1) — 전투/엘리트 노드 진입 시 [전투]/[납품]/[지나치기] 선택.
    //   MapView가 visitNode 후 이 라우트로 보낸다(현 노드 = run.data.currentNodeId).
    //   [전투]는 여기서 bell mark 적용 후 enterGridCombat→/game/combat. 보스는 별개(boss-intro).
    path: '/game/gate',
    name: 'game-gate',
    component: () => import('@/views/GateView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/event',
    name: 'game-event',
    component: () => import('@/views/EventView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/activity',
    name: 'game-activity',
    component: () => import('@/views/ActivityView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/gather',
    name: 'game-gather',
    component: () => import('@/views/GatherView.vue'),
    meta: { scene: 'game' },
  },
  {
    // 생활 활동(8색=8활동) — 채집 노드(kind 'gather')를 이 화면으로 repoint. 권역별 배정 활동을
    // dispatch(지연형=농사 엔진 / 반복형=즉시 산출). 구 FarmingView는 보존(되돌리기·단일 농사용).
    path: '/game/farm',
    name: 'game-farm',
    component: () => import('@/views/LifeActivityView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/boss',
    name: 'game-boss',
    component: () => import('@/views/BossView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/end',
    name: 'game-end',
    component: () => import('@/views/RunEndView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/village',
    name: 'game-village',
    component: () => import('@/views/VillageView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/workshop',
    name: 'game-workshop',
    component: () => import('@/views/WorkshopView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/shop',
    name: 'game-shop',
    component: () => import('@/views/ShopView.vue'),
    meta: { scene: 'game' },
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    redirect: '/main',
  },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
});
