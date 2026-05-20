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
import './style.css';
import App from './App.vue';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.directive('tooltip', vTooltip);
app.mount('#app');
