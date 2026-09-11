# 카드 포팅 지원 행렬

현재 실행 로더와 CardEffectKind 스키마에서 생성한다. 명령: node scripts/audit-card-port.mjs --write. 재검증: node scripts/audit-card-port.mjs --check.

## 판정 기준

- 카드 데이터 존재, 비슷한 도형 행동 존재, 해당 카드 실행 지원은 서로 다르다. 필드는 장착된 카드의 모든 효과를 처리할 수 있을 때만 실행을 허용한다. 일부 효과만 실행하지 않는다.
- 아래 분류는 이식 경로와 필요한 기획 결정을 나타낸다. 완료/지원 선언이 아니다.
- 하나의 카드가 여러 효과를 가지면 모든 효과·비용·대상·수명 규칙을 처리하기 전에는 지원 완료로 표시하지 않는다.
- 기존 보유 카드와 강화·각성 투자를 보존한다. 상점 카드 판매는 폐지하고 탐험·교류·공방 제작으로 획득한다. 기술 장착형으로 확정했다. 기존 덱·컬렉션과 강화 단계는 보존하고 별도의 도형 슬롯으로 참조한다.

## 실측

| 항목 | 수 |
| --- | ---: |
| 일반 장착 가능 정의 | 509 |
| 변신 중 전용 기술 | 5 |
| 실행 카드 정의 | 699 |
| 스키마 효과 종류 | 67 |
| 실제 사용 효과 종류 | 59 |
| 원본 손패 효과 보유 카드 | 266 |
| 기본 마나 비용 3 초과 | 3 |
| 비수동 발동 | 0 |
| 즉시 발동 | 27 |
| custom 함수 슬롯 | 0 |

강화판·종족 폼·잡카드·빙의 카드·실행 시 합성되는 카드도 포함한다. 손패 의존 수는 손패 효과 또는 on-draw 발동을 포함하는 서로 다른 카드 수다. 분류별 수는 중복될 수 있다.

## 효과별 연결 계획

| 효과 | 포함 카드 수 | 분류 | 원시 효과 연결 | 작업 |
| --- | ---: | --- | --- | --- |
| damage | 227 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| heal | 28 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| block | 110 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| break-armor | 8 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| apply-status | 136 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| ghost-self | 2 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| grant-airborne | 1 | 공통 속성 연산 재사용 | 연결 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| grant-color | 25 | 공통 속성 연산 재사용 | 후속 | 대상·비용·수치 계산 후 influence로 연결. field-skills에서 카드별 전체 효과 지원 여부를 검사. |
| damage-min-color | 8 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-top-color | 21 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-color-count | 23 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| block-top-color | 10 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-per-debuff | 15 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| consume-vulnerable | 12 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-from-hp | 10 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-per-confine | 2 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| block-to-damage | 12 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| adaptive-strike | 4 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| spend-all-energy | 4 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| damage-per-relic | 4 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| consume-burn | 2 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| consume-poison | 0 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| double-block | 2 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| heavy-blade | 3 | 수치 계산 이식 | 연결 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| amplify-debuff | 3 | 수치 계산 이식 | 후속 | 원본 수식과 보너스 중복 여부를 확인한 뒤 공통 연산으로 실행. |
| terrain-water | 1 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| terrain-fire | 1 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| terrain-smoke | 1 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| lure | 1 | 격자·환경 연결 | 후속 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| move-self | 7 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| pull-enemy | 2 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| push-enemy | 3 | 격자·환경 연결 | 연결 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| place-installation | 8 | 격자·환경 연결 | 후속 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| status-spread | 1 | 격자·환경 연결 | 후속 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| chain-explosion | 1 | 격자·환경 연결 | 후속 | 범위·경로·충돌·도착 칸 판정을 보존. 이동과 환경 속성 처리 재사용. |
| draw | 157 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| return-hand-to-deck | 16 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| draw-if-color | 12 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| damage-per-hand | 30 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| exhaust-self | 54 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| return-self-to-hand | 5 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| heal-per-hand | 6 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| next-card-double | 5 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| curse-tick | 2 | 손패 효과의 기술 역할 변환 | 후속 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| damage-per-cards-played | 17 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| buff-card-instance | 0 | 손패 효과의 기술 역할 변환 | 후속 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| refill | 0 | 손패 효과의 기술 역할 변환 | 후속 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| hand-cost-down | 6 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| damage-low-hand | 12 | 손패 효과의 기술 역할 변환 | 연결 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| feel-no-pain | 0 | 손패 효과의 기술 역할 변환 | 후속 | 드로우·버림은 다른 기술 재사용 단축, 소멸·반환은 재사용 시간, 손패 수는 준비된 기술 수로 변환. 나머지 특수 효과는 후속. |
| next-turn-energy | 30 | 발동·지속 범위 확인 | 연결 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| growing-block | 3 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| growing-damage | 13 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| skip-enemy-action | 10 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| slow-enemy | 9 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| delayed-damage | 4 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| random-effect | 6 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| negate-reflect | 0 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| bloom-strength | 6 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| this-turn-amp | 11 | 발동·지속 범위 확인 | 연결 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| metallicize | 4 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| barricade | 0 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| rupture | 0 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| juggernaut | 0 | 발동·지속 범위 확인 | 후속 | 필드의 턴·교전·사용 횟수 수명을 정하고 기존 수치를 연결. |
| damage-per-companion | 4 | 변신 및 이번 버전 제외 효과 | 후속 | 변신은 별도 기술 봉인과 NPC 해제로 연결. 동료·해제 카드 효과는 이번 버전에서 지원하지 않는다. |
| release-transform | 1 | 변신 및 이번 버전 제외 효과 | 후속 | 변신은 별도 기술 봉인과 NPC 해제로 연결. 동료·해제 카드 효과는 이번 버전에서 지원하지 않는다. |
| summon-ally | 2 | 변신 및 이번 버전 제외 효과 | 후속 | 변신은 별도 기술 봉인과 NPC 해제로 연결. 동료·해제 카드 효과는 이번 버전에서 지원하지 않는다. |

## 별도 확인할 규칙

- 손패: 역할 유지 변환을 구현했다. 준비 효과는 4턴, 최근 사용 기록은 3턴으로 한정한다. 상세 규칙은 equipped-skills-port.md.
- 마나: 기본 비용이 최대 마나 3을 넘는 카드는 찰칵! (c-flash-capture, 4), 트립스 (c-tripps-rage, 20), 트립스+ (c-tripps-rage-plus, 20). 자동으로 3에 맞추지 않고 원본 의도와 비용 감소 경로를 확인한다.
- 시간: 모든 기술은 최소 마나 1과 행동 1턴을 사용한다. 빠른 기술도 행동 시간을 생략하지 않는다. 여정 제한시간만 폐지했다.
- 범위: 원본 shape와 perTileMul, aimed/throw, 시야·장애물·안전 칸을 함께 이식한다. 이름만 같은 단일 대상 공격으로 대체하지 않는다.
- 상태: metallicize는 구 카드의 매 턴 방어 획득과 현재 필드의 방어 감소 억제가 다르다. 이름만 매핑하지 않는다.
- 지속: growing 계열의 사본별 성장, 전투 한정 파워, 다음 카드/다음 턴 효과의 수명과 저장 복원을 구별한다.
- 특수: lock-in은 카드 필드만의 문제가 아니며 몬스터 구속·변신·빙의·동료와 함께 검토한다.

## 분포

- source: boss 7, event 56, form 99, hyperion 24, junk 3, npc 80, possession 3, race 385, shop 42
- trigger: manual 699
- targetMode: aimed 82, pattern 378, self 238, throw 1
- castSpeed: fast 247, normal 209, slow 133, 미지정 110

## 카드별 인벤토리

<details>
<summary>전체 699종 펼치기</summary>

| ID | 이름 | 비용 | 효과 | 연결 분류 | 추가 조건 | 현재 장착 |
| --- | --- | ---: | --- | --- | --- | --- |
| c-alimes-mist-vow | 안개의 약속 | 2 | heal, draw, damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-alimes-mist-vow-plus | 안개의 약속+ | 2 | heal, draw, damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-all-in | 전부 쏟기 | 0 | spend-all-energy | 수치 계산 이식 | 없음 | 가능 |
| c-all-in-plus | 전부 쏟기+ | 0 | spend-all-energy | 수치 계산 이식 | 없음 | 가능 |
| c-alti-resonance | 알티-알타의 신호 | 1 | draw, heal, damage, exhaust-self | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-alti-resonance-plus | 알티-알타의 신호+ | 1 | draw, heal, damage, exhaust-self | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arc-dun-quake-paw | 잿불 곰의 앞발 | 2 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arc-tamamo-foxfire | 아홉 꼬리 여우불 | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-arc-tifre-thunderstep | 번개 밟기 | 1 | damage, apply-status, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-attune | 조율 | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-attune-plus | 조율+ | 1 | grant-color, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-arcana-aurora | 백야 | 2 | damage-color-count, block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-aurora-plus | 백야+ | 2 | damage-color-count, block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-beam | 빛줄기 | 0 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-beam-plus | 빛줄기+ | 0 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-clarity | 맑은 빛 | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-clarity-plus | 맑은 빛+ | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-dawndraw | 동틀녘 | 0 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-arcana-dawndraw-plus | 동틀녘+ | 0 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-arcana-facet | 단면 베기 | 1 | damage-color-count, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-facet-plus | 단면 베기+ | 1 | damage-color-count, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-glare | 눈부심 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-glare-plus | 눈부심+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-glean | 물들기 | 1 | grant-color, block | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-glean-plus | 물들기+ | 1 | grant-color, block | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-glimmer | 어슴빛 | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-glimmer-plus | 어슴빛+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-glowfade | 잔광 | 1 | damage-top-color, grant-color | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-glowfade-plus | 잔광+ | 1 | damage-top-color, grant-color | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-hex | 암광 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-hex-plus | 암광+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-infuse | 정령 부름 | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-infuse-plus | 정령 부름+ | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-judgment | 빛의 심판 | 2 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-judgment-plus | 빛의 심판+ | 2 | damage-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-arcana-kindle | 반딧불 | 0 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-kindle-plus | 반딧불+ | 0 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-levee | 편광 | 1 | block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-levee-plus | 편광+ | 1 | block-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-arcana-mantle | 빛의 외투 | 2 | block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-mantle-plus | 빛의 외투+ | 2 | block-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-overflow | 만조 | 2 | grant-color, damage-color-count | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 효과 포팅 중 |
| c-arcana-overflow-plus | 만조+ | 2 | grant-color, damage-color-count | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 효과 포팅 중 |
| c-arcana-prism | 분광 | 1 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-prism-plus | 분광+ | 1 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-purelight | 순백 | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-purelight-plus | 순백+ | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-radiance | 광휘 | 2 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-radiance-plus | 광휘+ | 2 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-rainbow | 무지개 | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-rainbow-plus | 무지개+ | 1 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-refract | 굴절 | 1 | damage-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-refract-plus | 굴절+ | 1 | damage-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-reservoir | 빛 저장고 | 1 | next-turn-energy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-reservoir-plus | 빛 저장고+ | 1 | next-turn-energy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-resonate | 월광포 | 2 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-resonate-plus | 월광포+ | 2 | damage-top-color, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-searbrand | 빛 낙인 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-searbrand-plus | 빛 낙인+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-shimmerwall | 어른거리는 벽 | 1 | block-top-color, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-shimmerwall-plus | 어른거리는 벽+ | 1 | block-top-color, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-spark | 작은 빛 | 0 | damage-color-count, grant-color | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-spark-plus | 작은 빛+ | 0 | damage-color-count, grant-color | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-spectrum | 스펙트럼 | 1 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-spectrum-plus | 스펙트럼+ | 1 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-spire | 빛의 첨탑 | 1 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-arcana-spire-plus | 빛의 첨탑+ | 1 | damage-top-color, grant-color | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-trickle | 스미는 빛 | 0 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-trickle-plus | 스미는 빛+ | 0 | grant-color | 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-arcana-unravel | 매듭 풀기 | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-unravel-plus | 매듭 풀기+ | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-arcana-wellspring | 마나 샘 | 1 | next-turn-energy, draw-if-color | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-wellspring-plus | 마나 샘+ | 1 | next-turn-energy, draw-if-color | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-arcana-welltap | 색의 우물 | 1 | grant-color, next-turn-energy | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-arcana-welltap-plus | 색의 우물+ | 1 | grant-color, next-turn-energy | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-arcana-zenith | 정점의 빛 | 3 | grant-color, damage-top-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 효과 포팅 중 |
| c-arcana-zenith-plus | 정점의 빛+ | 3 | grant-color, damage-top-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 효과 포팅 중 |
| c-balanced-edge | 균형검 | 1 | damage-min-color | 수치 계산 이식 | 없음 | 가능 |
| c-balanced-edge-plus | 균형검+ | 1 | damage-min-color | 수치 계산 이식 | 없음 | 가능 |
| c-bastion-counter | 성벽의 반격 | 2 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-bastion-counter-plus | 성벽의 반격+ | 2 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-bear-bastion | 곰의 방벽 | 2 | block, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-bear-bastion-plus | 곰의 방벽+ | 2 | block, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-beast-skin | 짐승의 가죽 | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-beast-skin-plus | 짐승의 가죽+ | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-binding-ward | 후회 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-binding-ward-plus | 후회+ | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-blessed | 깃든 빛 | 1 | damage, heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 변신·빙의 기술 준비 중 |
| c-blood-pact | 피의 계약 | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-blood-pact-plus | 피의 계약+ | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-bloom-recovery | 만개의 회복 | 2 | heal-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-bloom-recovery-plus | 만개의 회복+ | 2 | heal-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-bonded-strike | 인연의 일격 | 2 | damage-per-companion, block | 변신 및 이번 버전 제외 효과, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-bonded-strike-plus | 인연의 일격+ | 2 | damage-per-companion, block | 변신 및 이번 버전 제외 효과, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-burn-mark | 화염구 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-burn-mark-plus | 화염구+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-collectors-strike | 수집가의 일격 | 1 | damage-per-relic | 수치 계산 이식 | 없음 | 가능 |
| c-collectors-strike-plus | 수집가의 일격+ | 1 | damage-per-relic | 수치 계산 이식 | 없음 | 가능 |
| c-color-surge | 범람 | 1 | damage-top-color, draw-if-color | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-color-surge-plus | 범람+ | 1 | damage-top-color, draw-if-color | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-comrades-charge | 동행의 돌격 | 1 | damage-per-companion | 변신 및 이번 버전 제외 효과 | 없음 | 효과 포팅 중 |
| c-comrades-charge-plus | 동행의 돌격+ | 1 | damage-per-companion | 변신 및 이번 버전 제외 효과 | 없음 | 효과 포팅 중 |
| c-cursed | 들러붙은 그림자 | 1 | curse-tick | 손패 효과의 기술 역할 변환 | 저주 제거 제한 | 변신·빙의 기술 준비 중 |
| c-cursed-blade | 저주받은 검 | 2 | damage-per-debuff | 수치 계산 이식 | 없음 | 가능 |
| c-cursed-blade-plus | 저주받은 검+ | 2 | damage-per-debuff | 수치 계산 이식 | 없음 | 가능 |
| c-debuff-storm | 네메시스 | 1 | damage-per-debuff | 수치 계산 이식 | 없음 | 가능 |
| c-debuff-storm-plus | 네메시스+ | 1 | damage-per-debuff | 수치 계산 이식 | 없음 | 가능 |
| c-deep-breath | 응급 치료 | 0 | draw, heal, damage, exhaust-self | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-deep-breath-plus | 응급 치료+ | 0 | draw, heal, damage, exhaust-self | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-defend | 방어 | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-defend-plus | 방어+ | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-diropel-totem | 무늬의 빛 | 2 | damage-color-count, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-diropel-totem-plus | 무늬의 빛+ | 2 | damage-color-count, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-doom-mark | 파멸의 낙인 | 1 | apply-status, apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-doom-mark-plus | 파멸의 낙인+ | 0 | apply-status, apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-double-hex | 가시 돋친 말 | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-double-hex-plus | 가시 돋친 말+ | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-double-strike | 패기 | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-double-strike-plus | 패기+ | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-elder-curse | 태고의 저주 | 2 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-elder-curse-plus | 태고의 저주+ | 2 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-falcon-skydive | 급강하 | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-falcon-skydive-plus | 급강하+ | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-fang-frenzy | 사냥 본능 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-fang-frenzy-plus | 사냥 본능+ | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-fast-mail | 등기 우편 | 0 | draw, next-turn-energy, heal | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-fast-mail-plus | 등기 우편+ | 0 | draw, next-turn-energy, heal | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-final-blade | 작별의 검 | 2 | damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-final-blade-plus | 작별의 검+ | 2 | damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-flame-web | 화염 거미줄 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-flame-web-plus | 화염 거미줄+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-flash-capture | 찰칵! | 4 | apply-status | 공통 속성 연산 재사용 | 기본 비용 3 초과 | 마나 규칙 준비 중 |
| c-flash-capture-plus | 찰칵!+ | 3 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-focused-mind | 집중 | 1 | draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-focused-mind-plus | 집중+ | 1 | draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-fox-apprentice-charm | 흐린 부적 | 2 | apply-status, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 해당 종족으로 변신 중 |
| c-fox-apprentice-fire | 작은 여우불 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 해당 종족으로 변신 중 |
| c-fox-apprentice-step | 물러서는 걸음 | 1 | move-self | 격자·환경 연결 | 변신 폼 | 해당 종족으로 변신 중 |
| c-fox-apprentice-tails | 두 꼬리 쓸기 | 2 | damage, push-enemy | 공통 속성 연산 재사용, 격자·환경 연결 | 변신 폼 | 해당 종족으로 변신 중 |
| c-fox-apprentice-veil | 수행자의 장막 | 1 | block | 공통 속성 연산 재사용 | 변신 폼 | 해당 종족으로 변신 중 |
| c-fox-beguile | 현혹 | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-beguile-plus | 현혹+ | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-bite | 여우 송곳니 | 1 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-bite-plus | 여우 송곳니+ | 1 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-bloomtail | 꼬리 세우기 | 1 | bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-bloomtail-plus | 꼬리 세우기+ | 1 | bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-blur | 흐릿한 자취 | 1 | slow-enemy, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-blur-plus | 흐릿한 자취+ | 1 | slow-enemy, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-cascade | 잔상 | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-cascade-plus | 잔상+ | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-charm | 홀림 | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-charm-plus | 홀림+ | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-collect | 빈틈 거두기 | 1 | consume-vulnerable | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-collect-plus | 빈틈 거두기+ | 1 | consume-vulnerable | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-dash | 여우걸음 | 0 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-dash-plus | 여우걸음+ | 0 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-devour | 삼키는 불 | 2 | consume-vulnerable, damage | 수치 계산 이식, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-devour-plus | 삼키는 불+ | 2 | consume-vulnerable, damage | 수치 계산 이식, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-dreamhaze | 몽환 | 1 | slow-enemy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-dreamhaze-plus | 몽환+ | 1 | slow-enemy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-emberburst | 불꽃 작렬 | 2 | damage, damage-per-debuff | 공통 속성 연산 재사용, 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-emberburst-plus | 불꽃 작렬+ | 2 | damage, damage-per-debuff | 공통 속성 연산 재사용, 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-emberstoke | 불씨 키우기 | 1 | amplify-debuff | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-emberstoke-plus | 불씨 키우기+ | 1 | amplify-debuff | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-enthrall | 농락 | 1 | break-armor, apply-status, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-enthrall-plus | 농락+ | 1 | break-armor, apply-status, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-eternaltail | 끝없는 꼬리 | 2 | growing-damage, bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-eternaltail-plus | 끝없는 꼬리+ | 2 | growing-damage, bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-fervor | 들뜸 | 1 | this-turn-amp, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-fervor-plus | 들뜸+ | 1 | this-turn-amp, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-finalflame | 마지막 불꽃 | 3 | damage, apply-status, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-finalflame-plus | 마지막 불꽃+ | 3 | damage, apply-status, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-fogwall | 안개 장막 | 1 | block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-fogwall-plus | 안개 장막+ | 1 | block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-foxfire | 여우불 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-foxfire-plus | 여우불+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-foxguard | 여우 도사림 | 1 | block, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-foxguard-plus | 여우 도사림+ | 1 | block, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-frenzy | 광란 | 2 | this-turn-amp | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-frenzy-plus | 광란+ | 2 | this-turn-amp | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-gamble | 도박수 | 1 | random-effect, apply-status | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-gamble-plus | 도박수+ | 1 | random-effect, apply-status | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-gaze | 매혹의 눈빛 | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-gaze-plus | 매혹의 눈빛+ | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-illusion | 환영 너울 | 1 | block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-illusion-plus | 환영 너울+ | 1 | block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-inferno | 화염 폭주 | 2 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-inferno-plus | 화염 폭주+ | 2 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-lick | 상처 핥기 | 1 | heal, block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-lick-plus | 상처 핥기+ | 1 | heal, block | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-maul | 물어뜯기 | 2 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-maul-plus | 물어뜯기+ | 2 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-mirage | 환영 | 1 | skip-enemy-action | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-mirage-plus | 환영+ | 1 | skip-enemy-action, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-nine-tails | 아홉 꼬리 | 2 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-nine-tails-plus | 아홉 꼬리+ | 2 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-ninefold | 꼬리 폭포 | 2 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-ninefold-plus | 꼬리 폭포+ | 2 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-ninetails | 구미호의 춤 | 2 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-ninetails-plus | 구미호의 춤+ | 2 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-phantasm | 허깨비 | 2 | skip-enemy-action, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-phantasm-plus | 허깨비+ | 1 | skip-enemy-action, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pounce | 덮치기 | 1 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pounce-plus | 덮치기+ | 1 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-prowl | 살금걸음 | 0 | draw | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-prowl-plus | 살금걸음+ | 0 | draw | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pyre | 화톳불 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pyre-plus | 화톳불+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pyreburst | 들불 | 2 | damage-per-debuff | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-pyreburst-plus | 들불+ | 2 | damage-per-debuff | 수치 계산 이식 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-rampage | 난동 | 3 | this-turn-amp, damage, apply-status | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-rampage-plus | 난동+ | 3 | this-turn-amp, damage, apply-status | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-reckoning | 홀림 거두기 | 2 | damage-per-debuff, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-reckoning-plus | 홀림 거두기+ | 2 | damage-per-debuff, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-spark | 불씨 흩기 | 0 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-spark-plus | 불씨 흩기+ | 0 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-tailswipe | 꼬리치기 | 1 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-tailswipe-plus | 꼬리치기+ | 1 | growing-damage | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-trick | 속임수 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-trick-plus | 속임수+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-trickery | 변덕 | 1 | random-effect | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-trickery-plus | 변덕+ | 0 | random-effect | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-unravel | 결박 풀기 | 1 | break-armor | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-unravel-plus | 결박 풀기+ | 1 | break-armor | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-veil | 여우 안개 | 1 | slow-enemy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-veil-plus | 여우 안개+ | 1 | slow-enemy, block | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-whim | 변덕 | 0 | random-effect | 발동·지속 범위 확인 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-whim-plus | 변덕+ | 0 | random-effect, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-wisp | 도깨비불 | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-fox-wisp-plus | 도깨비불+ | 1 | apply-status | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-frail-rupture | 취약의 균열 | 1 | apply-status, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-frail-rupture-plus | 취약의 균열+ | 1 | apply-status, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-gentle-guard | 물의 방패 | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-gentle-guard-plus | 물의 방패+ | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-gentle-mend | 보드라운 새살 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-gentle-mend-plus | 보드라운 새살+ | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-growing-leaf | 자라나는 잎새 | 2 | growing-block | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-growing-leaf-plus | 자라나는 잎새+ | 2 | growing-block | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-hoarders-wrath | 보물의 분노 | 2 | damage-per-relic | 수치 계산 이식 | 없음 | 가능 |
| c-hoarders-wrath-plus | 보물의 분노+ | 2 | damage-per-relic | 수치 계산 이식 | 없음 | 가능 |
| c-human-adapt | 적응 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-human-adapt-plus | 적응+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-human-adaptstrike | 임기응변 | 1 | adaptive-strike | 수치 계산 이식 | 없음 | 가능 |
| c-human-adaptstrike-plus | 임기응변+ | 1 | adaptive-strike | 수치 계산 이식 | 없음 | 가능 |
| c-human-allout | 전심전력 | 3 | damage, block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-allout-plus | 전심전력+ | 3 | damage, block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-balance | 균형의 일격 | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-balance-plus | 균형의 일격+ | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-bloodrage | 피의 격노 | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-human-bloodrage-plus | 피의 격노+ | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-human-brace | 참호 | 1 | double-block | 수치 계산 이식 | 없음 | 가능 |
| c-human-brace-plus | 참호+ | 0 | double-block | 수치 계산 이식 | 없음 | 가능 |
| c-human-bulwark | 철벽 | 2 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-bulwark-plus | 철벽+ | 2 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-bulwarkblow | 방패 치기 | 1 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-bulwarkblow-plus | 방패 치기+ | 1 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-cleave | 내려베기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-combo | 단련 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-human-combo-plus | 단련+ | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-human-counterstance | 강철 의지 | 2 | metallicize, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-counterstance-plus | 강철 의지+ | 2 | metallicize, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-decisive | 결정타 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-decisive-plus | 결정타+ | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-emberbrand | 불씨 낙인 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-emberbrand-plus | 불씨 낙인+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-evenblade | 평정의 검 | 1 | damage-min-color | 수치 계산 이식 | 없음 | 가능 |
| c-human-evenblade-plus | 평정의 검+ | 1 | damage-min-color | 수치 계산 이식 | 없음 | 가능 |
| c-human-fairtrade | 등가교환 | 2 | damage, block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-fairtrade-plus | 등가교환+ | 2 | damage, block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-finalblow | 대검 일섬 | 2 | heavy-blade | 수치 계산 이식 | 없음 | 가능 |
| c-human-finalblow-plus | 대검 일섬+ | 2 | heavy-blade | 수치 계산 이식 | 없음 | 가능 |
| c-human-focuspoint | 일점집중 | 2 | next-card-double, damage | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-focuspoint-plus | 일점집중+ | 1 | next-card-double, damage | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-followthrough | 혈투 | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-human-followthrough-plus | 혈투+ | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-human-foresight | 선견 | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-foresight-plus | 선견+ | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-hamstring | 다리 후리기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-hamstring-plus | 다리 후리기+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-improvise | 즉흥 | 2 | adaptive-strike, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-improvise-plus | 즉흥+ | 2 | adaptive-strike, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-jab | 잽 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-jab-plus | 잽+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-laceration | 깊은 자상 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-laceration-plus | 깊은 자상+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-lastline | 최후의 방어선 | 2 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-lastline-plus | 최후의 방어선+ | 2 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-leveler | 고른 손 | 1 | damage-min-color, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-leveler-plus | 고른 손+ | 1 | damage-min-color, block | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-overcome | 극복 | 3 | damage, block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-overcome-plus | 극복+ | 3 | damage, block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-pin | 급소 찌르기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-pin-plus | 급소 찌르기+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-pivot | 버팀세 | 3 | metallicize, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-pivot-plus | 버팀세+ | 2 | metallicize, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-readahead | 앞수 읽기 | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-readahead-plus | 앞수 읽기+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-regroup | 재정비 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-regroup-plus | 재정비+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-resolve | 각오 | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-resolve-plus | 각오+ | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-riposte | 받아넘기기 | 1 | block-to-damage | 수치 계산 이식 | 없음 | 가능 |
| c-human-riposte-plus | 받아넘기기+ | 1 | block-to-damage | 수치 계산 이식 | 없음 | 가능 |
| c-human-shatterguard | 무릎 꺾기 | 1 | break-armor, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-shatterguard-plus | 무릎 꺾기+ | 1 | break-armor, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-shiftguard | 투신 | 2 | bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-shiftguard-plus | 투신+ | 2 | bloom-strength, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-human-steadfast | 굳건함 | 2 | block, damage-min-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-steadfast-plus | 굳건함+ | 2 | block, damage-min-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-step | 발놀림 | 1 | move-self | 격자·환경 연결 | 없음 | 가능 |
| c-human-stockpile | 헌신 | 0 | heal, draw, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-stockpile-plus | 헌신+ | 0 | heal, draw, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-human-tailwind | 순풍 | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-human-tailwind-plus | 순풍+ | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-human-tempo | 완급 조절 | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-human-tempo-plus | 완급 조절+ | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-human-throw | 던지기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-tradeblow | 맞받아치기 | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-tradeblow-plus | 맞받아치기+ | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-human-twohands | 육탄 | 1 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-twohands-plus | 육탄+ | 1 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-human-warcry | 돌격 | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-human-warcry-plus | 돌격+ | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 지속 효과 준비 중 |
| c-iluneon-stopped-noon | 멈춘 시계 | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-iluneon-stopped-noon-plus | 멈춘 시계+ | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-junk-blank | 빈 카드 | 0 | exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 사용할 수 없는 카드 |
| c-junk-curse | 저주 | 1 | curse-tick, exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 사용할 수 없는 카드 |
| c-junk-wound | 상처 | 1 |  |  | 사용 불가 카드 | 사용할 수 없는 카드 |
| c-last-bulwark | 마지막 보루 | 2 | block, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-last-bulwark-plus | 마지막 보루+ | 2 | block, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-last-stand | 마지막 버팀 | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-last-stand-plus | 마지막 버팀+ | 1 | damage-from-hp | 수치 계산 이식 | 없음 | 가능 |
| c-lop-sign | 리포의 신호 | 1 | draw, block | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-lop-sign-plus | 리포의 신호+ | 1 | draw, block | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-magic-ember | 잔화 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-magic-ember-short | 잔화 · 약식 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-magic-ember-star | 잔화 · 성식 | 3 | damage, apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-manonickla-sunset-wall | 석양의 벽 | 2 | block, damage-top-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-manonickla-sunset-wall-plus | 석양의 벽+ | 2 | block, damage-top-color | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-mirror-echo | 거울의 메아리 | 1 | next-card-double | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-mirror-echo-plus | 거울의 메아리+ | 0 | next-card-double | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moss-ember-strike | 꺼지지 않는 불 | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moss-ember-strike-plus | 꺼지지 않는 불+ | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-accel | 순풍 가속 | 0 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-moth-accel-plus | 순풍 가속+ | 0 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-moth-barrage | 난사 | 1 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-barrage-plus | 난사+ | 1 | damage, damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-blitz | 연참 | 2 | damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-blitz-plus | 연참+ | 2 | damage, damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-cadence | 가락 | 1 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-cadence-plus | 가락+ | 1 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-circling | 선회 | 0 | draw, exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-circling-plus | 선회+ | 0 | draw, exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-clearsky | 맑은 하늘 | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-clearsky-plus | 맑은 하늘+ | 1 | draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-combostrike | 연격 | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-combostrike-plus | 연격+ | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-crescendo | 마지막 소절 | 2 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-crescendo-plus | 마지막 소절+ | 2 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-cyclone | 회오리 | 2 | damage, damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-cyclone-plus | 회오리+ | 2 | damage, damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-dive | 급강하 | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-dive-plus | 급강하+ | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-doubletap | 두 발 | 1 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-doubletap-plus | 두 발+ | 1 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-flick | 튕기기 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-flick-plus | 튕기기+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-flight | 날갯짓 | 1 | grant-airborne | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-flit | 깃 스치기 | 1 | move-self | 격자·환경 연결 | 없음 | 가능 |
| c-moth-flurry | 날개 폭풍 | 2 | damage, damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-flurry-plus | 날개 폭풍+ | 2 | damage, damage, damage, damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-flutter | 날갯짓 | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-moth-flutter-plus | 날갯짓+ | 1 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-moth-gale | 돌풍 | 2 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-gale-plus | 돌풍+ | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-glance | 빗겨막기 | 0 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-glance-plus | 빗겨막기+ | 0 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-glide | 활강 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-moth-glide-plus | 활강+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-moth-glidewall | 활강 방벽 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-glidewall-plus | 활강 방벽+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-gust | 질풍 | 1 | hand-cost-down | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-gust-plus | 질풍+ | 0 | hand-cost-down | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-haste | 가벼운 몸 | 2 | hand-cost-down, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-haste-plus | 가벼운 몸+ | 1 | hand-cost-down, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-loop | 맴도는 바람 | 0 | next-turn-energy, return-self-to-hand | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-loop-plus | 맴도는 바람+ | 0 | next-turn-energy, return-self-to-hand | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-momentum | 가속도 | 1 | this-turn-amp, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-momentum-plus | 가속도+ | 1 | this-turn-amp, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-needle | 바늘땀 | 0 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-needle-plus | 바늘땀+ | 0 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-overdrive | 과속 | 1 | this-turn-amp, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-overdrive-plus | 과속+ | 1 | this-turn-amp, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-pinprick | 콕 찌르기 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-pinprick-plus | 콕 찌르기+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-poise | 자세잡기 | 1 | apply-status, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 지속 효과 준비 중 |
| c-moth-poise-plus | 자세잡기+ | 1 | apply-status, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 지속 효과 준비 중 |
| c-moth-quickjab | 속타 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-quickjab-plus | 속타+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-rapidfire | 속사 연발 | 1 | damage, damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-rapidfire-plus | 속사 연발+ | 1 | damage, damage, damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-recall | 되돌아오는 바람 | 0 | draw, return-self-to-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-recall-plus | 되돌아오는 바람+ | 0 | draw, return-self-to-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-scatter | 흩날리기 | 1 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-scatter-plus | 흩날리기+ | 1 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-shiv | 잰단검 | 0 | damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-shiv-plus | 잰단검+ | 0 | damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-skim | 흘긋 | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-skim-plus | 흘긋+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-skyfall | 빛살 낙하 | 2 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-skyfall-plus | 빛살 낙하+ | 2 | damage-per-cards-played, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-slipstream | 바람 길 | 2 | hand-cost-down | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-slipstream-plus | 바람 길+ | 1 | hand-cost-down | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-snipe | 겨눈 화살 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-spark | 잔불 | 0 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-spark-plus | 잔불+ | 0 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-stinger | 연침 | 1 | damage, damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-stinger-plus | 연침+ | 1 | damage, damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-stormcall | 폭풍 부르기 | 3 | damage, damage, damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-stormcall-plus | 폭풍 부르기+ | 3 | damage, damage, damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-tempest | 화살 소나기 | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-tempest-plus | 화살 소나기+ | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-tempocut | 흐름 베기 | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-tempocut-plus | 흐름 베기+ | 1 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-toxinburst | 큰 부채질 | 1 | consume-burn | 수치 계산 이식 | 없음 | 가능 |
| c-moth-toxinburst-plus | 큰 부채질+ | 1 | consume-burn | 수치 계산 이식 | 없음 | 가능 |
| c-moth-triplet | 삼연사 | 1 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-triplet-plus | 삼연사+ | 1 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-updraft | 상승 기류 | 1 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-updraft-plus | 상승 기류+ | 1 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-moth-volley | 속사 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-volley-plus | 속사+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-volleyup | 모아 쏘기 | 2 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-volleyup-plus | 모아 쏘기+ | 2 | damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-windgather | 바람갈무리 | 0 | draw, return-self-to-hand | 손패 효과의 기술 역할 변환 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-moth-windlash | 꼬리잡기 | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-moth-windlash-plus | 꼬리잡기+ | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-mounting-storm | 부풀어 오르는 폭풍 | 1 | growing-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-mounting-storm-plus | 부풀어 오르는 폭풍+ | 1 | growing-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-orca-tide | 범고래의 물결 | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-orca-tide-plus | 범고래의 물결+ | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-overdraw-burst | 과부하 폭발 | 0 | spend-all-energy | 수치 계산 이식 | 없음 | 가능 |
| c-overdraw-burst-plus | 과부하 폭발+ | 0 | spend-all-energy | 수치 계산 이식 | 없음 | 가능 |
| c-phantom-blackout | 암전 | 1 | skip-enemy-action | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-phantom-blackout-plus | 암전+ | 1 | skip-enemy-action, draw | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-phantom-blankblade | 빈손 베기 | 0 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-blankblade-plus | 빈손 베기+ | 0 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-bleedhand | 패의 가시 | 1 | damage-per-hand, apply-status | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-bleedhand-plus | 패의 가시+ | 1 | damage-per-hand, apply-status | 손패 효과의 기술 역할 변환, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-burst | 패의 작렬 | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-burst-plus | 패의 작렬+ | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-cycle | 패 순환 | 1 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-cycle-plus | 패 순환+ | 1 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-darkrend | 카드 날리기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-darkrend-plus | 카드 날리기+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-discharge | 리버 | 2 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-discharge-plus | 리버+ | 2 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-drain | 힘 빼앗기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-drain-plus | 힘 빼앗기+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-empty | 낙장불입 | 2 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-empty-plus | 낙장불입+ | 2 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fanout | 패 펼치기 | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fanout-plus | 패 펼치기+ | 2 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fold | 접기 | 0 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fold-plus | 접기+ | 0 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fullhand | 만패의 칼 | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-fullhand-plus | 만패의 칼+ | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-guard | 버티기 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-guard-plus | 버티기+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-handblade | 부채 | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-handblade-plus | 부채+ | 1 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-handcut | 흘려 베기 | 0 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-handcut-plus | 흘려 베기+ | 0 | damage-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-handguard | 패의 방벽 | 1 | block, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-handguard-plus | 패의 방벽+ | 1 | block, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-holdline | 패 지키기 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-holdline-plus | 패 지키기+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-hollow | 텅 빈 손 | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-hollow-plus | 텅 빈 손+ | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-lastcard | 마지막 패 | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-lastcard-plus | 마지막 패+ | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-overcharge | 에이스 | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-overcharge-plus | 에이스+ | 2 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-overdraw | 폭식 | 1 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-overdraw-plus | 폭식+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-overload | 올인 | 2 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-overload-plus | 올인+ | 2 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-purge | 싹 비우기 | 1 | return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-purge-plus | 싹 비우기+ | 1 | return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-redeal | 다시 돌리기 | 1 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-redeal-plus | 다시 돌리기+ | 1 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-shed | 떨치기 | 0 | return-hand-to-deck, exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-shed-plus | 떨치기+ | 0 | return-hand-to-deck, exhaust-self | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-shock | 손기술 | 0 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-shock-plus | 손기술+ | 0 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-shortcircuit | 폴드 | 2 | skip-enemy-action, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-phantom-shortcircuit-plus | 폴드+ | 2 | skip-enemy-action, damage | 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-phantom-shroud | 장막 | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-shroud-plus | 장막+ | 1 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-shuffle | 패 고르기 | 1 | return-hand-to-deck, draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-phantom-shuffle-plus | 패 고르기+ | 1 | return-hand-to-deck, draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 즉시 발동 | 가능 |
| c-phantom-sleight | 손바꿈 | 0 | return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-sleight-plus | 손바꿈+ | 0 | return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-stash | 패 갈무리 | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-stash-plus | 패 갈무리+ | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-phantom-static | 감전 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-static-plus | 감전+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-thinarmor | 갑옷 삭이기 | 1 | break-armor, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-thinarmor-plus | 갑옷 삭이기+ | 1 | break-armor, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-thunderfist | 피날레 | 3 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-thunderfist-plus | 피날레+ | 3 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-trade | 패 희생 | 1 | heal-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-trade-plus | 패 희생+ | 1 | heal-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-trickhand | 손속임 | 1 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-trickhand-plus | 손속임+ | 1 | damage-per-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-tuck | 슬쩍 넣기 | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-tuck-plus | 슬쩍 넣기+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-veil | 어둠 너울 | 0 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-veil-plus | 어둠 너울+ | 0 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phantom-voidlance | 허세 | 2 | damage-low-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-voidlance-plus | 허세+ | 2 | damage-low-hand, draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-voidstrike | 숨긴 패 | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-voidstrike-plus | 숨긴 패+ | 1 | damage-low-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-wardfield | 포커 페이스 | 2 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phantom-wardfield-plus | 포커 페이스+ | 2 | block, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-phase-out | 흐려지기 | 1 | ghost-self | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-phase-out-plus | 흐려지기+ | 1 | ghost-self | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-place-bomb | 폭발 함정 | 2 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-place-ember | 화염 장판 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-place-ward | 수호진 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-possessed | 들린 마음 | 1 | damage, heal | 공통 속성 연산 재사용 | 빙의 각성 | 변신·빙의 기술 준비 중 |
| c-prickle-coat | 까슬한 가시옷 | 1 | apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-prickle-coat-plus | 까슬한 가시옷+ | 1 | apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-primal-collapse | 배수진 | 1 | damage, damage-per-confine, exhaust-self | 공통 속성 연산 재사용, 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-primal-collapse-plus | 배수진+ | 1 | damage, damage-per-confine, exhaust-self | 공통 속성 연산 재사용, 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-prism-guard | 간파 | 1 | block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-prism-guard-plus | 간파+ | 1 | block-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-prism-overflow | 바람 넘침 | 1 | draw, draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-prism-overflow-plus | 바람 넘침+ | 1 | draw, draw-if-color | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-prism-overload | 과욕 | 2 | damage-color-count, damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-prism-overload-plus | 과욕+ | 2 | damage-color-count, damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-prism-strike | 오로라 | 1 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-prism-strike-plus | 오로라+ | 1 | damage-top-color | 수치 계산 이식 | 없음 | 가능 |
| c-quickdraw | 순발력 | 0 | draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-quickdraw-plus | 순발력+ | 0 | draw | 손패 효과의 기술 역할 변환 | 즉시 발동 | 가능 |
| c-quickstep | 종종걸음 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-quickstep-plus | 종종걸음+ | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-quiet-arc | 가라앉음 | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-quiet-arc-plus | 가라앉음+ | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-recover | 숨 고르기 | 1 | heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-recover-plus | 숨 고르기+ | 1 | heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-release-change | 본모습 | 1 | release-transform | 변신 및 이번 버전 제외 효과 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-resolve-flash | 결심의 섬광 | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-resolve-flash-plus | 결심의 섬광+ | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-rising-fang | 자라나는 송곳니 | 1 | growing-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-rising-fang-plus | 자라나는 송곳니+ | 1 | growing-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-rize-relay | 연속 타격 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-rize-relay-echo | 연속 타격 | 0 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-rize-relay-echo-plus | 연속 타격+ | 0 | damage | 공통 속성 연산 재사용 | 변신 폼 | 변신·빙의 기술 준비 중 |
| c-rize-relay-plus | 연속 타격+ | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sacrifice-edge | 희생의 칼날 | 1 | damage-from-hp, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-sacrifice-edge-plus | 희생의 칼날+ | 1 | damage-from-hp, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-second-wind | 산들바람 | 1 | heal, draw, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-second-wind-plus | 산들바람+ | 1 | heal, draw, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shadow-rebuke | 그림자 밟기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shadow-rebuke-plus | 그��자 밟기+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shared-breath | 안정 | 1 | heal-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shared-breath-plus | 안정+ | 1 | heal-per-hand | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shell-slam | 등껍질 후려치기 | 1 | block-to-damage | 수치 계산 이식 | 없음 | 가능 |
| c-shell-slam-plus | 등껍질 후려치기+ | 1 | block-to-damage | 수치 계산 이식 | 없음 | 가능 |
| c-shop-brace | 무난한 막기 | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-brace-plus | 무난한 막기+ | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-cut | 무난한 베기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-cut-plus | 무난한 베기+ | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-flick | 가벼운 손짓 | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-flick-plus | 가벼운 손짓+ | 0 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-heavy | 묵직한 일격 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-heavy-plus | 묵직한 일격+ | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-poke | 잽 | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-poke-plus | 잽+ | 0 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-salve | 응급 처치 | 1 | heal, block, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-salve-plus | 응급 처치+ | 1 | heal, block, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-sip | 한 모금 | 1 | heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-sip-plus | 한 모금+ | 1 | heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-study | 잠깐 살핌 | 1 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-study-plus | 잠깐 살핌+ | 1 | draw | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-shop-wall | 든든한 벽 | 2 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-shop-wall-plus | 든든한 벽+ | 2 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-bigglob | 큰 한 방울 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-body | 몸으로 막기 | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-bounce | 통통 | 1 | move-self, block | 격자·환경 연결, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-bubble | 불어나는 거품 | 2 | delayed-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-sl-chainburst | 연쇄 폭발 | 2 | chain-explosion | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-sl-chainpop | 연쇄 톡톡 | 2 | damage-per-debuff | 수치 계산 이식 | 없음 | 가능 |
| c-sl-clean | 맑아지기 | 1 | heal | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-corrode | 녹이기 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-glob | 점액 한 방울 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-grow | 점점 크게 | 1 | growing-block | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-sl-hot | 뜨거운 점액 | 1 | apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-puddle | 웅덩이 | 1 | draw, slow-enemy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 즉시 발동 | 효과 포팅 중 |
| c-sl-spit | 뱉기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-splash | 튀기기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-split | 분열! | 2 | summon-ally | 변신 및 이번 버전 제외 효과 | 없음 | 효과 포팅 중 |
| c-sl-spread | 번지기 | 1 | amplify-debuff | 수치 계산 이식 | 없음 | 효과 포팅 중 |
| c-sl-sticky | 끈적 | 1 | apply-status, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-sl-transfer | 옮기기 | 1 | status-spread | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-sl-twobody | 두 몸 | 2 | summon-ally, block | 변신 및 이번 버전 제외 효과, 공통 속성 연산 재사용 | 없음 | 효과 포팅 중 |
| c-smi-bomb | 폭약 설치 | 2 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-smi-firetrap | 화염 깔개 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-smi-forge | 힘의 발판 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-smi-hook | 갈고리 | 1 | damage, pull-enemy | 공통 속성 연산 재사용, 격자·환경 연결 | 없음 | 가능 |
| c-smi-poisontrap | 독 살포기 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-smi-reel | 끌어모으기 | 2 | pull-enemy | 격자·환경 연결 | 없음 | 가능 |
| c-smi-scurry | 잰걸음 | 1 | move-self | 격자·환경 연결 | 없음 | 가능 |
| c-smi-shove | 밀치기 | 1 | damage, push-enemy | 공통 속성 연산 재사용, 격자·환경 연결 | 없음 | 가능 |
| c-smi-slam | 내려찍기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-smi-spiketrap | 가시 깔개 | 1 | place-installation | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-smi-throw | 공구 던지기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-smi-wrench | 렌치질 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-soft-ward | 포근한 보호막 | 1 | block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-soft-ward-plus | 포근한 보호막+ | 1 | block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-soul-harvest | 영혼 거두기 | 2 | damage-per-debuff, apply-status | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-soul-harvest-plus | 영혼 거두기+ | 2 | damage-per-debuff, apply-status | 수치 계산 이식, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-spectrum-edge | 무지갯빛 칼날 | 2 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-spectrum-edge-plus | 무지갯빛 칼날+ | 2 | damage-color-count | 수치 계산 이식 | 없음 | 가능 |
| c-spirit-call | 모인 영혼들 | 1 | damage-color-count, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-spirit-call-plus | 모인 영혼들+ | 1 | damage-color-count, draw | 수치 계산 이식, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-steady-heart | 단단한 마음 | 1 | apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-steady-heart-plus | 단단한 마음+ | 1 | apply-status, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-strike | 일격 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-strike-plus | 일격+ | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-swift-step | 상승기류 | 1 | draw, next-turn-energy, heal | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인, 공통 속성 연산 재사용 | 없음 | 가능 |
| c-swift-step-plus | 상승기류+ | 0 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-tacomi-hologram-mirror | 홀로매트릭스 | 3 | block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tacomi-hologram-mirror-plus | 홀로매트릭스+ | 2 | block, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tactic-fire | 흩뿌린 잿불 | 1 | terrain-fire | 격자·환경 연결 | 없음 | 가능 |
| c-tactic-lure | 메아리 미끼 | 0 | lure | 격자·환경 연결 | 없음 | 효과 포팅 중 |
| c-tactic-shove | 경로 바꾸기 | 1 | damage, push-enemy | 공통 속성 연산 재사용, 격자·환경 연결 | 없음 | 가능 |
| c-tactic-smoke | 연막 가루 | 1 | terrain-smoke | 격자·환경 연결 | 없음 | 가능 |
| c-tactic-spark | 도전성 섬광 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tactic-water | 물길 열기 | 1 | terrain-water | 격자·환경 연결 | 없음 | 가능 |
| c-tide-veil | 물의 방패 | 1 | block, heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-tide-veil-plus | 물의 방패+ | 1 | block, heal, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-tiger-rush | 빠른 삼연 | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tiger-rush-plus | 빠른 삼연+ | 2 | damage, damage, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tm-advance | 가불 | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 즉시 발동 | 가능 |
| c-tm-flicker | 찰나 | 0 | damage, draw | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-tm-full-stop | 마침표 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tm-slow-noon | 느린 오후 | 2 | damage, slow-enemy | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-tm-written-end | 미리 쓴 결말 | 1 | delayed-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-tmx-blink-step | 사이 찌르기 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tmx-eon-edge | 영겁의 날 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tmx-hourfold | 오늘 접기 | 1 | draw, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 즉시 발동 | 가능 |
| c-tortoise-thorn | 등껍질의 가시 | 2 | block, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-tortoise-thorn-plus | 등껍질의 가시+ | 2 | block, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-toxic-spire | 독의 첨탑 | 1 | apply-status, damage-per-debuff | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-toxic-spire-plus | 독의 첨탑+ | 1 | apply-status, damage-per-debuff | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-trace-step | 발자취 | 1 | draw, return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-trace-step-plus | 발자취+ | 0 | draw, return-hand-to-deck, next-turn-energy | 손패 효과의 기술 역할 변환, 발동·지속 범위 확인 | 없음 | 가능 |
| c-trade-coil | 꼬리 감기 | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-trade-coil-plus | 꼬리 감기+ | 1 | damage, block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-transcend-strike | 이세계의 검 | 2 | damage, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-transcend-strike-plus | 이세계의 검+ | 2 | damage, consume-vulnerable | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-triflower-emberstorm | 잿불 폭풍 | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-triflower-emberstorm-plus | 잿불 폭풍+ | 2 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-tripps-rage | 트립스 | 20 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 기본 비용 3 초과 | 마나 규칙 준비 중 |
| c-tripps-rage-plus | 트립스+ | 20 | damage, apply-status, apply-status | 공통 속성 연산 재사용 | 기본 비용 3 초과 | 마나 규칙 준비 중 |
| c-venom-bloom | 독꽃 피우기 | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-venom-bloom-plus | 독꽃 피우기+ | 1 | apply-status, damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-vuln-detonate | 균열 | 1 | consume-vulnerable | 수치 계산 이식 | 없음 | 가능 |
| c-vuln-detonate-plus | 균열+ | 1 | consume-vulnerable | 수치 계산 이식 | 없음 | 가능 |
| c-warm-cup | 따뜻한 한 잔 | 1 | heal, draw, damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-warm-cup-plus | 따뜻한 한 잔+ | 1 | heal, draw, damage, exhaust-self | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-wf-afterguard | 잔상 방패 | 1 | block, delayed-damage | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-wf-afterimage | 잔상 | 1 | damage, delayed-damage | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-wf-blink | 차원보 | 1 | damage, move-self | 공통 속성 연산 재사용, 격자·환경 연결 | 없음 | 가능 |
| c-wf-chain | 연각 | 2 | damage-per-cards-played | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-wf-cross | 십자 베기 | 2 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wf-cuttime | 시간 끊기 | 1 | skip-enemy-action | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-wf-doublecast | 겹수 | 1 | next-card-double | 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-wf-edgewave | 검기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wf-finisher | 마지막 수 | 2 | heavy-blade | 수치 계산 이식 | 없음 | 가능 |
| c-wf-grow | 벼린 검 | 1 | growing-damage | 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-wf-haste | 가속 | 1 | next-turn-energy | 발동·지속 범위 확인 | 없음 | 가능 |
| c-wf-parry | 흘리기 | 1 | block | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wf-reach | 긴 베기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wf-retreat | 물러 베기 | 1 | damage, move-self | 공통 속성 연산 재사용, 격자·환경 연결 | 없음 | 가능 |
| c-wf-slash | 베기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wf-slow-cut | 느림 베기 | 1 | damage, slow-enemy | 공통 속성 연산 재사용, 발동·지속 범위 확인 | 없음 | 효과 포팅 중 |
| c-wf-stillness | 정지 | 2 | skip-enemy-action, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 효과 포팅 중 |
| c-wf-throw | 검 던지기 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 투척 기술 준비 중 |
| c-wf-timeedge | 시간의 칼날 | 2 | this-turn-amp, exhaust-self | 발동·지속 범위 확인, 손패 효과의 기술 역할 변환 | 없음 | 가능 |
| c-wf-twin | 쌍각 | 1 | damage | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-wild-rush | 야성의 돌진 | 1 | apply-status, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 지속 효과 준비 중 |
| c-wild-rush-plus | 야성의 돌진+ | 1 | apply-status, damage-per-hand | 공통 속성 연산 재사용, 손패 효과의 기술 역할 변환 | 없음 | 지속 효과 준비 중 |
| c-yusezria-corebreak | 정수핵 깨기 | 2 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-yusezria-corebreak-plus | 정수핵 깨기+ | 2 | block, block-to-damage | 공통 속성 연산 재사용, 수치 계산 이식 | 없음 | 가능 |
| c-zero-spark | 전류 자국 | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |
| c-zero-spark-plus | 전류 자국+ | 1 | damage, apply-status | 공통 속성 연산 재사용 | 없음 | 가능 |

</details>
