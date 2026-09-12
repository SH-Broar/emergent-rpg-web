import type { WorldEntity } from '@/systems/world/types';
export interface FieldRecord {
  id: string;
  nodeId: string;
  name: string;
  lines: string[];
  hint?: string;
  min?: Record<string, number>;
  properties?: Record<string, number>;
  colors?: WorldEntity['colors'];
}
export const FIELD_RECORD_VERSION = 2;
export const FIELD_RECORDS: FieldRecord[] = [
  {
    "id": "time-clock-board",
    "nodeId": "n-iluneon-clocktower",
    "name": "시계탑 점검판",
    "lines": [
      "미유의 글씨. ‘종을 고정함. 아래에서 두 번째 종소리를 들었다는 연락이 옴.’",
      "그 아래에 ‘고정쇠를 뺌. 오늘 첫 타종.’이라고 적혀 있다. 고친 자국은 없다."
    ]
  },
  {
    "id": "time-diner-log",
    "nodeId": "n-iluneon-diner",
    "name": "식당 배식 기록",
    "lines": [
      "‘주전자 가열 시작. 종소리 두 번. 찻물 끓음. 시계탑 첫 타종 연락.’",
      "옆에는 짧은 주석이 있다. ‘측정 장치 독립. 탑의 시각은 참조하지 않음.’"
    ]
  },
  {
    "id": "time-lar-overlay",
    "nodeId": "n-lar-inner-pool",
    "name": "덧칠한 수위판",
    "hint": "벗겨진 덧칠 사이로 깊이 파 둔 글을 읽을 수 있다.",
    "properties": {
      "moisture": 0,
      "flammability": 1
    },
    "lines": [
      "덧칠 밑의 홈. ‘마로, 물이 빠질 때까지 못 안쪽에서 기다림.’",
      "그 위의 새 글. ‘물이 차오르기 전에 마로가 돌아와 수위를 알림.’ 같은 필체다."
    ]
  },
  {
    "id": "time-luna-envelope",
    "nodeId": "n-luna-academy",
    "name": "교정의 보관 봉투",
    "lines": [
      "마로의 쪽지. ‘겉모습으로는 얼마나 기다렸는지 알 수 없어요. 날짜 말고, 기억하는 일부터 물어봐 주세요.’",
      "페비엘이 덧붙였다. ‘제게는 어제였어요. 그 말까지 틀렸다고 하지는 말아 주세요.’"
    ]
  },
  {
    "id": "time-mine-tag",
    "nodeId": "n-emberforge-vein",
    "name": "광맥 갱도의 작업 표찰",
    "lines": [
      "‘전원 신전 쪽으로 대피. 마지막 인원 확인 — 티프레.’",
      "이름을 세는 칸 맨 끝에, 지운 적 없는 빈칸이 하나 남아 있다."
    ]
  },
  {
    "id": "time-dun-plate",
    "nodeId": "n-emberforge-lair",
    "name": "검댕 낀 철판",
    "hint": "검댕이 벗겨진 가장자리에서 겹친 손자국을 비교할 수 있다.",
    "properties": {
      "moisture": 0,
      "hardness": 12
    },
    "colors": {
      "iron": 60
    },
    "lines": [
      "움켜쥔 손자국이, 손을 떼며 남긴 긁힘 위를 누르고 있다.",
      "철판 가장자리의 짧은 글. ‘놓지 않았음 — 던.’"
    ]
  },
  {
    "id": "time-rescue-roll",
    "nodeId": "n-emberforge-deep",
    "name": "광산 심부의 구조 명부",
    "lines": [
      "‘던이 붙잡은 사람은 바깥에서 발견됨. 양손의 상처가 굳어 있었음.’",
      "다음 줄은 비어 있다. 종이 뒷면에만 ‘그는 누구를 기다렸나’라는 눌린 글씨가 남았다."
    ]
  },
  {
    "id": "time-shrine-tracks",
    "nodeId": "n-oldshrine-hall",
    "name": "신전 회랑의 탄 돌판",
    "lines": [
      "신전 밖으로 난 발자국이 먼저 돌을 팠다. 그 위를, 안으로 향한 번개가 태웠다.",
      "두 자국 모두 티프레의 것이다. 돌판은 뒤집히거나 옮겨진 흔적이 없다."
    ]
  },
  {
    "id": "time-shrine-flash",
    "nodeId": "n-oldshrine-altar",
    "name": "제단의 번개 흔적",
    "lines": [
      "‘모두 나왔다. 이제 던을 부르러 간다 — 티프레.’",
      "글 옆에 타 버린 철가루가 박혀 있다. 던의 손자국이 남은 철판과 같은 빛이다."
    ]
  },
  {
    "id": "time-station-passage",
    "nodeId": "n-tacomi-old-station",
    "name": "옛 정류장의 통행판",
    "lines": [
      "‘신전에서 온 무리, 부상자 한 명. 잠시 쉰 뒤 출발.’",
      "그 아래에 ‘갱도 사고 소식. 티프레가 구조하러 지나감.’이라고 적혀 있다."
    ]
  },
  {
    "id": "time-shrine-letter",
    "nodeId": "n-oldshrine-inner",
    "name": "이름 없는 쪽지",
    "lines": [
      "‘내 손이 왜 다쳤는지 모르겠습니다. 다들 돌아왔다고 하니, 돌아온 거겠지요.’",
      "‘기다리던 사람이 있었던 것 같은데, 얼굴이 생각나지 않습니다.’"
    ]
  },
  {
    "id": "time-grid-strip",
    "nodeId": "n-enicham-wire-spire",
    "name": "닳은 검침띠",
    "hint": "종이 끝이 닳았지만 가운데 눈금과 글씨는 읽을 수 있다.",
    "properties": {
      "moisture": 0,
      "hardness": 5
    },
    "lines": [
      "눈금은 한 시간 동안 끊임없이 찍혔다. 작업자의 서명은 그 구간 앞뒤에만 있다.",
      "제로의 메모. ‘공회전 아님. 바깥으로 전력을 보냈음.’"
    ]
  },
  {
    "id": "time-battery-log",
    "nodeId": "n-enicham-alti-bay",
    "name": "충전실의 배터리 기록",
    "lines": [
      "‘같은 구간에서 배터리 잔량 감소. 충전과 사용이 모두 있었음.’",
      "알티의 덧붙임. ‘그 한 시간을 기억하는 작업자는 없습니다. 그렇다고 잔량이 돌아오지는 않습니다.’"
    ]
  },
  {
    "id": "time-clock-comparison",
    "nodeId": "n-iluneon-clocktower",
    "name": "시계탑의 대조표",
    "lines": [
      "‘던의 손은 계속 기둥을 받침. 티프레는 이미 전원을 꺼냄. 전력은 그 사이에도 소모됨.’",
      "미유가 맨 아래에 적었다. ‘둘 중 하나를 지우면 계산은 맞는다. 사람 얘기는 안 맞는다.’"
    ]
  },
  {
    "id": "time-child-stones",
    "nodeId": "n-windfall-rise",
    "name": "줄지은 작은 돌",
    "lines": [
      "돌 일곱 개가 허공에 떠 있다. 여덟 번째 돌이 오를 때마다 첫 번째가 바닥으로 돌아온다.",
      "바람 사이로 작은 목소리가 겹친다. ‘다 오면… 다 오면 내려갈 거야.’"
    ]
  },
  {
    "id": "time-last-stone",
    "nodeId": "n-windfall-outskirts",
    "name": "마지막 작은 돌",
    "lines": [
      "닻 아래에 돌 하나가 떨어져 있다. 누군가 놓칠 때마다, 위에서는 다시 처음부터 센다.",
      "돌 밑의 서툰 글씨. ‘늦어도 괜찮아. 기다릴게.’"
    ]
  },
  {
    "id": "lar-route-mark",
    "nodeId": "n-lar-inner-pool",
    "name": "물가의 길 표지",
    "lines": [
      "물이 닿은 높이마다 오래된 끈이 묶여 있다. 낮은 끈은 해지고, 가장 높은 끈은 아직 새것이다.",
      "마로의 메모. ‘곧은 길이 잠기면 뿌리 쪽으로. 발이 작은 분은 혼자 건너지 마세요.’"
    ]
  },
  {
    "id": "mano-dune-mark",
    "nodeId": "n-mano-windgauge",
    "name": "반대로 묶인 바람끈",
    "lines": [
      "매듭이 바람을 받는 쪽에 묶여 있다. 끈이 끊어진 게 아니라 누군가 풀어 뒤집었다.",
      "받침돌에는 작은 발자국이 있다. 돌아가는 자국은 보이지 않는다."
    ]
  },
  {
    "id": "mano-fox-note",
    "nodeId": "n-mano-arc",
    "name": "돌 틈의 붉은 쪽지",
    "lines": [
      "‘그렇게 바삐 다니면 꼬리가 걸리겠구나. 걸을 몸부터 고르는 게 어떠니.’",
      "접힌 안쪽에 이름이 있다. 타마모."
    ]
  },
  {
    "id": "enicham-contact-note",
    "nodeId": "n-enicham-gen-room",
    "name": "발전실 점검표",
    "lines": [
      "‘비가 올 때만 등불 꺼짐. 발전량 정상. 덮개 안쪽에서 물방울 발견.’",
      "제로의 글씨. ‘전하석을 더 넣기 전에 틈부터 막을 것.’"
    ]
  },
  {
    "id": "enicham-light-note",
    "nodeId": "n-enicham-wire-spire",
    "name": "송전탑 시험 전등",
    "lines": [
      "바람이 불면 덮개가 조금 흔들린다. 안쪽 전등은 꺼지지 않는다.",
      "알티의 표찰. ‘빛이 닿지 않는 곳에도 길은 이어집니다. 서두르지 마세요.’"
    ]
  },
  {
    "id": "tacomi-parcel-note",
    "nodeId": "n-tacomi-old-station",
    "name": "정류장의 짐 쪽지",
    "lines": [
      "‘카페에서 함께 쓰는 잔입니다. 필요하면 가져다 쓰세요.’",
      "작은 글씨가 덧붙어 있다. ‘빈 상자도 돌려주세요. 잔보다 포장할 섬유가 모자랍니다.’"
    ]
  },
  {
    "id": "tacomi-cup-note",
    "nodeId": "n-tacomi-cafe",
    "name": "카페의 빌림 장부",
    "lines": [
      "잔과 받침의 이름 옆으로 여러 필체가 이어진다. 금액을 적는 칸은 없다.",
      "‘돌려줄 때 모서리를 확인해 주세요. 종족마다 손에 걸리는 자리가 달라요.’"
    ]
  }
];
