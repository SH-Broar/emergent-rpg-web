/**
 * 앱 부트.
 *
 * 순서: createPinia → createRouter → createApp → use → mount.
 * (실제로 import 순서가 곧 plugin 등록 순서)
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { vTooltip } from '@/directives/tooltip';
import { setColorGainHook } from '@/systems/colors';
import { fireColorGain } from '@/systems/relic';
import './style.css';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('tooltip', vTooltip);
// 컬러 상승 시 on-color-gain 유물 발동 — colors↔relic 순환 회피용 콜백 주입.
setColorGainHook(fireColorGain);
app.mount('#app');
