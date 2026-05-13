/**
 * 도우미 임페리시아 (Imperisia) — 외부 프레임의 *안내자*.
 *
 * spec v2 Round 9: 임페리시아는 메타 진행 UI를 매개한다.
 * 게이지·해금·도감 화면에서 *대사·안내*로 등장.
 *
 * 이 모듈은 *대사 풀과 트리거 함수*를 제공.
 */

export const IMPERISIA_TITLE = '도우미 임페리시아';
export const IMPERISIA_VOICE = '임페리시아';

/** 상황별 대사 풀 — 화면 헤더 등에서 임의 선택. */
const LINES: Record<string, string[]> = {
  mainGreet: [
    '"어서 오세요, 전생자. 시간의 강이 그대를 기다립니다."',
    '"그분이 부르십니다. 다음은 어느 해입니까?"',
    '"잠시 머무르셔도 됩니다. 시간은 여기서만 멈춥니다."',
  ],
  beforeRun: [
    '"꼭 살아 돌아오세요. 그분의 시선이 약해지기 전에."',
    '"그곳의 사람들에게 너무 깊이 들이지 마세요. 다음 해엔 다른 얼굴이니까요."',
  ],
  afterClear: [
    '"…놀랍습니다. 그분이 또 한 걸음 가까이 닿으시네요."',
    '"이 또한 시간의 변주가 되었습니다."',
  ],
  afterFail: [
    '"괜찮습니다. 그분은 다시 부르실 겁니다."',
    '"실패는 다른 결말의 가능성입니다. 임페리시아의 기록에 남깁니다."',
  ],
  unlockGranted: [
    '"새로운 가능성이 열렸습니다. 보십시오."',
    '"그분의 손길이 닿는 곳이 늘었습니다."',
  ],
};

/** 키에 해당하는 임의 대사. 키 없으면 빈 문자열. */
export function randomLine(key: keyof typeof LINES): string {
  const pool = LINES[key];
  if (!pool || pool.length === 0) return '';
  return pool[Math.floor(Math.random() * pool.length)];
}
