/**
 * 단서 (Clue) — 간접 스토리 아이템.
 *
 * 사용자 사양 (2026-05-19):
 *  - 별도 인벤토리에 누적.
 *  - 사용하면 *본문 텍스트 노출*.
 *  - 사라지지 않음 (소비 X).
 *  - 런 휘발 (codex 등록 X — 연표별 다를 것이기에).
 *  - 조건부 선택지·이벤트의 *핵심 키*: `has-clue:cl-X`로 chain 구현.
 */

import type { NamedEntity } from './base';

export interface Clue extends NamedEntity {
  /** 'cl-' prefix 권장. */
  id: string;
  /** 단서 사용 시 노출되는 본문. */
  body: string;
  /** 어디서·언제 얻었는지 짧은 hint. UI 노출용. */
  source?: string;
}
