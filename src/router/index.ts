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
    path: '/game/map',
    name: 'game-map',
    component: () => import('@/views/MapView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/combat',
    name: 'game-combat',
    component: () => import('@/views/CombatView.vue'),
    meta: { scene: 'game' },
  },
  {
    path: '/game/event',
    name: 'game-event',
    component: () => import('@/views/EventView.vue'),
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
