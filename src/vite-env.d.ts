/// <reference types="vite/client" />

/**
 * 빌드 시 vite.config.ts의 define으로 주입되는 상수.
 * git rev-list --count HEAD 결과 (정수 문자열) 또는 'dev'.
 */
declare const __APP_VERSION__: string;
