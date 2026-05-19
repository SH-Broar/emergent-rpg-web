/**
 * 카오스 스키마 — *매 런 단위 토글* 가능한 특수 기능 정의.
 *
 * r4 신설. 종전엔 `stores/chaos.ts`에서 인터페이스를 직접 정의했으나,
 * 데이터 파일에서 로딩하기 위해 schemas로 분리.
 *
 * (이전 명칭 "버그" — 실제 코드 결함과 혼동되어 *카오스*로 재명명.)
 *
 * 효과(effects) 표현은 *추후 라운드*에서 modifier kind 기반으로 구체화. 현재는
 * name/description/affectsMeta 토글만 데이터화 — UI 카탈로그 표시까지만 작동.
 */

/** 한 카오스 항목. 사용자가 자유롭게 정의·확장 가능. */
export interface ChaosModifier {
  id: string;
  name: string;
  description: string;
  /** 해금 조건 (영구 연구로 풀린 토큰 등). 없으면 항상 사용 가능. */
  unlockKey?: string;
  /** 메타 진행에 영향을 주는가? (false = 무영향, true = 보너스·페널티 등) */
  affectsMeta: boolean;
}
