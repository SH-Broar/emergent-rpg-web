import type { JourneyQuest } from './quest-types';

export const TIME_STORY_QUESTS: JourneyQuest[] = [
  {
    "id": "time-01",
    "chapter": "어긋난 아침",
    "title": "종을 치기 전에",
    "npcId": "npc-miyu",
    "offer": [
      "나 아직 종 안 쳤어. 그런데 아래에서는 두 번이나 들었대.",
      "점검판 좀 같이 봐 줄래? 내가 적은 순서가 이상해."
    ],
    "reminder": "시계탑에 둔 점검판이야. 종을 멈춘 줄 바로 아래를 봐.",
    "finish": "틀린 숫자만 지우려 했는데… 그러면 내가 뭘 했는지도 달라지네.",
    "goals": [
      {
        "kind": "read",
        "key": "time-clock-board",
        "label": "시계탑의 점검판 읽기"
      }
    ],
    "reward": {
      "xp": 3
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "provisions"
    ]
  },
  {
    "id": "time-02",
    "chapter": "어긋난 아침",
    "title": "따로 잰 아침",
    "npcId": "npc-olyu",
    "offer": [
      "탑의 시계를 보고 적었다면 같이 틀릴 수도 있지.",
      "식당의 임페리시아는 별도로 시간을 잰다네. 그쪽 기록도 확인해 주겠나?"
    ],
    "reminder": "식당의 배식 기록을 보고 임페리시아와 이야기해 보게.",
    "finish": "찻물이 끓은 순서까지 뒤집혔군. 시계추를 고칠 일은 아닌 것 같아.",
    "goals": [
      {
        "kind": "read",
        "key": "time-diner-log",
        "label": "식당 배식 기록 읽기"
      },
      {
        "kind": "talk",
        "key": "npc-imperisia",
        "label": "임페리시아와 대화하기"
      }
    ],
    "reward": {
      "xp": 3
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-01"
    ]
  },
  {
    "id": "time-03",
    "chapter": "어긋난 아침",
    "title": "지우지 못한 글",
    "npcId": "npc-echo",
    "turnInNpcId": "npc-maro",
    "offer": [
      "라르 숲에서도 날짜를 덧쓴다더라. 위에 쓴 게 꼭 맞는 건 아니지.",
      "안쪽 못의 수위판을 봐. 덧칠이 벗겨진 데에 옛 글이 남아 있어."
    ],
    "reminder": "라르 숲 안쪽 못의 수위판을 읽어 봐. 마로가 사정을 알 거야.",
    "finish": "못이 넘친 건 한 번이에요. 그런데 물이 빠지기 전에, 제가 이미 돌아왔다고 쓰여 있네요.",
    "goals": [
      {
        "kind": "read",
        "key": "time-lar-overlay",
        "label": "수위판의 옛 글 읽기"
      }
    ],
    "reward": {
      "xp": 4,
      "stock": {
        "water": 2
      }
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-02"
    ]
  },
  {
    "id": "time-04",
    "chapter": "어긋난 아침",
    "title": "얼마나 오래",
    "npcId": "npc-maro",
    "offer": [
      "오래 살았다는 말과 나이를 먹었다는 말은, 제게는 조금 달라요.",
      "루나의 페비엘 씨에게도 물어봐 주세요. 다만 고향 얘기는 재촉하지 말아 주세요."
    ],
    "reminder": "루나에서 페비엘 씨를 만나고, 교정의 보관 봉투를 확인해 주세요.",
    "finish": "같은 날짜를 기억한다고 같은 시간을 산 건 아니겠죠. 어느 쪽도 없던 일로 만들고 싶지 않아요.",
    "goals": [
      {
        "kind": "talk",
        "key": "npc-febiel",
        "label": "페비엘과 대화하기"
      },
      {
        "kind": "read",
        "key": "time-luna-envelope",
        "label": "루나 교정의 보관 봉투 읽기"
      }
    ],
    "reward": {
      "xp": 4
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-03"
    ]
  },
  {
    "id": "time-05",
    "chapter": "불이 머문 자리",
    "title": "던이 놓지 않은 것",
    "npcId": "npc-kumamimi",
    "offer": [
      "갱도가 무너졌다. 내가 받치는 동안 티프레가 사람들을 빼냈지.",
      "광맥 갱도에 흔적이 남아 있다. 말보다 그걸 먼저 봐라."
    ],
    "reminder": "광맥 갱도에 남은 작업 표찰을 봐라. 꺼낸 사람 수가 적혀 있다.",
    "finish": "나는 마지막 사람의 손을 잡고 있었다. 티프레가 돌아오기 전부터. 그런데 그 녀석은 전부 꺼냈다고 한다.",
    "goals": [
      {
        "kind": "read",
        "key": "time-mine-tag",
        "label": "광맥 갱도의 작업 표찰 읽기"
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-04"
    ]
  },
  {
    "id": "time-06",
    "chapter": "불이 머문 자리",
    "title": "손자국 아래",
    "npcId": "npc-kumamimi",
    "offer": [
      "이 판은 그때 받치던 기둥에서 떼어 왔다. 재 때문에 잘 안 보일 거다.",
      "가까이 살펴 봐라. 손자국 안쪽에도 무언가 새겨져 있다."
    ],
    "reminder": "대장간 철판에 겹쳐 남은 손자국을 살펴봐라.",
    "finish": "손을 놓은 자국이 먼저 생겼군. 나는 놓은 적이 없는데. …그렇다고 지금 놓을 수는 없다.",
    "goals": [
      {
        "kind": "read",
        "key": "time-dun-plate",
        "label": "철판에 겹친 손자국 확인하기"
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-05"
    ]
  },
  {
    "id": "time-07",
    "chapter": "불이 머문 자리",
    "title": "버티는 쪽",
    "npcId": "npc-kumamimi",
    "offer": [
      "무너지는 걸 막으려면 버틸 힘이 있어야 한다.",
      "나를 밀어내 봐라. 내 앞에만 서 있을 생각은 말고."
    ],
    "reminder": "대장간 너머 겨룸터의 안쪽, 세 번째 층에서 기다리겠다. 위험한 바닥을 봐라.",
    "finish": "…밀어냈군. 힘을 풀어도 모든 게 무너지지는 않는다는 건가.",
    "goals": [
      {
        "kind": "boss",
        "key": "bs-arc-dun",
        "label": "던의 겨룸터 3층에서 승리하기"
      }
    ],
    "encounter": {
      "bossId": "bs-arc-dun",
      "lines": [
        "던이 망치 끝으로 바닥을 짚는다.",
        "던: 버텨 봐라. 피할 자리는 남겨 두겠다."
      ]
    },
    "reward": {
      "xp": 12,
      "stock": {
        "field-wrap": 2
      }
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-06"
    ]
  },
  {
    "id": "time-08",
    "chapter": "불이 머문 자리",
    "title": "남겨 둔 이름",
    "npcId": "npc-kumamimi",
    "offer": [
      "표찰의 마지막 칸. 내가 비워 뒀다.",
      "돌아온 얼굴은 기억한다. 이름을 물었던 순간만 없어. 갱도 심부의 명부에도 같은 빈칸이 있을 거다."
    ],
    "reminder": "광산 심부의 구조 명부를 봐라. 티프레에게는 아직 말하지 않았다.",
    "finish": "그 녀석은 앞으로 가면 낫는다고 한다. 나는 남겨 둔 게 무엇인지도 모른 채 갈 수 없다.",
    "goals": [
      {
        "kind": "read",
        "key": "time-rescue-roll",
        "label": "광산 심부의 구조 명부 읽기"
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-07"
    ]
  },
  {
    "id": "time-09",
    "chapter": "번개가 지난 자리",
    "title": "티프레가 돌아온 길",
    "npcId": "npc-toramimi",
    "offer": [
      "던한테서 왔어? 그 녀석, 아직도 그때 얘기야?",
      "신전 회랑을 봐. 난 분명 사람들을 밖에 데려다 놓고 돌아갔어. 발자국까지 남았거든."
    ],
    "reminder": "구 신전 회랑의 탄 돌판이야. 안으로 간 자국과 나온 자국을 비교해 봐.",
    "finish": "나올 때 난 흠집 위에 들어갈 때의 그을음이 있어? …잠깐. 그럼 나는 언제 들어간 거지?",
    "goals": [
      {
        "kind": "read",
        "key": "time-shrine-tracks",
        "label": "신전 회랑의 탄 돌판 읽기"
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-08"
    ]
  },
  {
    "id": "time-10",
    "chapter": "번개가 지난 자리",
    "title": "돌아오기 전의 나",
    "npcId": "npc-toramimi",
    "offer": [
      "제단에도 번개 자국이 있어. 던이 기둥을 받쳤다는 때에 내가 찍은 거야.",
      "하나만 잘못됐으면 부수고 말지. 둘 다 남아 있으니 짜증 나네."
    ],
    "reminder": "제단의 번개 자국과 옛 정류장의 통행판을 함께 봐.",
    "finish": "떠난 적 없는 내가, 돌아왔다는 나보다 늦게 도착했어. 던한테 거짓말했다고 따질 수가 없겠네.",
    "goals": [
      {
        "kind": "read",
        "key": "time-shrine-flash",
        "label": "신전 제단의 번개 흔적 읽기"
      },
      {
        "kind": "read",
        "key": "time-station-passage",
        "label": "옛 정류장의 통행판 읽기"
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-09"
    ]
  },
  {
    "id": "time-11",
    "chapter": "번개가 지난 자리",
    "title": "먼저 가는 쪽",
    "npcId": "npc-toramimi",
    "offer": [
      "그래도 여기서 멈춰 있을 순 없잖아. 날 따라잡아 봐.",
      "던을 밀어냈다며? 이번엔 비켜서기만 해서는 안 될걸."
    ],
    "reminder": "제단 너머 겨룸터로 와. 세 번째 층에서 기다릴게. 번개가 지나간 자리도 조심하고.",
    "finish": "하, 잡혔네. 먼저 달린다고 혼자 빠져나갈 수 있는 건 아니구나.",
    "goals": [
      {
        "kind": "boss",
        "key": "bs-arc-tifre",
        "label": "티프레의 겨룸터 3층에서 승리하기"
      }
    ],
    "encounter": {
      "bossId": "bs-arc-tifre",
      "lines": [
        "티프레의 발끝에서 가는 불꽃이 튄다.",
        "티프레: 보고 따라와. 늦으면 나도 못 멈춘다!"
      ]
    },
    "reward": {
      "xp": 12,
      "stock": {
        "field-spark": 2
      }
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-10"
    ]
  },
  {
    "id": "time-12",
    "chapter": "번개가 지난 자리",
    "title": "다 세어 본 뒤",
    "npcId": "npc-toramimi",
    "offer": [
      "내가 숨긴 것도 있어. 밖으로 나온 사람 수는 맞아.",
      "그런데 마지막 한 명은 나를 보고도 누가 구했냐고 묻더라. 안쪽 신전에 그 사람이 남긴 쪽지가 있어."
    ],
    "reminder": "신전 안쪽의 이름 없는 쪽지를 읽어 봐. 던의 빈칸과 같은 사람인지는 아직 몰라.",
    "finish": "사람을 꺼냈다고 다 끝난 줄 알았어. 그 사람한테 무슨 시간이 빠졌는지는 묻지도 않았고.",
    "goals": [
      {
        "kind": "read",
        "key": "time-shrine-letter",
        "label": "신전 안쪽의 이름 없는 쪽지 읽기"
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-11"
    ]
  },
  {
    "id": "time-13",
    "chapter": "같은 현재",
    "title": "어느 쪽을 믿을까",
    "npcId": "npc-imperisia",
    "offer": [
      "[보고]:: 두 증언은 각자의 흔적과 일치합니다. 한쪽을 오기로 처리할 수 없습니다.",
      "[질문]:: 던은 남은 것을 먼저 지키려 합니다. 티프레는 멈춘 시간을 먼저 풀려 합니다. 어느 쪽부터 시도하시겠습니까?"
    ],
    "reminder": "[확인]:: 어느 쪽을 택해도 나머지 기록은 보관하겠습니다.",
    "finish": "[기록]:: 선택은 남겼습니다. 아직 설명되지 않은 빈칸도 남겨 두겠습니다.",
    "goals": [
      {
        "kind": "boss",
        "key": "bs-arc-dun",
        "label": "던의 겨룸과 증언 확인"
      },
      {
        "kind": "boss",
        "key": "bs-arc-tifre",
        "label": "티프레의 겨룸과 증언 확인"
      }
    ],
    "choices": [
      {
        "id": "dun",
        "label": "던처럼, 남은 것을 먼저 지킨다",
        "reply": "[확인]:: 더 잃지 않도록 멈춰 세우는 방법부터 찾겠습니다."
      },
      {
        "id": "tifre",
        "label": "티프레처럼, 멈춘 시간을 먼저 푼다",
        "reply": "[확인]:: 빠져나갈 길을 먼저 열겠습니다. 풀려나는 순간 무엇이 사라지는지도 살펴보겠습니다."
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-12"
    ]
  },
  {
    "id": "time-14",
    "chapter": "같은 현재",
    "title": "아무도 쓰지 않은 전력",
    "npcId": "npc-zero",
    "offer": [
      "기록을 보니 한 시간치 전력이 사라졌어. 그런데 발전기는 그만큼 돌았거든.",
      "송전탑 검침띠를 읽어 봐. 남은 숫자하고 알티의 기록을 맞춰 보자."
    ],
    "reminder": "송전탑의 검침띠와 충전실의 배터리 기록을 읽어 줘.",
    "finish": "시간은 지나갔고, 전기는 쓰였어. 그 사이를 산 사람이 없는 게 문제네. 멈춘다 해도 그 몫이 없어지진 않겠어.",
    "goals": [
      {
        "kind": "read",
        "key": "time-grid-strip",
        "label": "송전탑 검침띠 읽기"
      },
      {
        "kind": "read",
        "key": "time-battery-log",
        "label": "충전실의 배터리 기록 읽기"
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-13"
    ]
  },
  {
    "id": "time-15",
    "chapter": "같은 현재",
    "title": "지우개 없는 정리",
    "npcId": "npc-olyu",
    "offer": [
      "미유가 점검판을 새로 쓰겠다고 하더군. 이제 빈칸을 보기가 싫은 모양이야.",
      "하지만 숫자를 맞추려고 겪은 일을 지울 수는 없지. 탑에 두 기록을 나란히 걸어 뒀네."
    ],
    "reminder": "시계탑의 대조표를 봐 주게. 미유에게도 기록을 남겨 달라고 말해 주고.",
    "finish": "옳은 순서를 정하는 데 급했군. 누구에게 일어난 일인지부터 남겨야 했는데.",
    "goals": [
      {
        "kind": "read",
        "key": "time-clock-comparison",
        "label": "시계탑의 대조표 읽기"
      },
      {
        "kind": "talk",
        "key": "npc-miyu",
        "label": "미유와 대화하기"
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-14"
    ]
  },
  {
    "id": "time-16",
    "chapter": "시간의 닻",
    "title": "기다리는 아이",
    "npcId": "npc-tsuyosai",
    "offer": [
      "상승로에서 같은 목소리가 들린다. 기다려 달라는 말뿐이지.",
      "닻 가까이 놓인 작은 돌을 봐라. 누군가 끝내지 못한 놀이처럼 보인다."
    ],
    "reminder": "풍혈 상승로의 줄지은 돌을 살펴봐라. 꼭대기로 서둘러 오를 필요는 없다.",
    "finish": "아이는 누가 늦는지도 모른다. 기다림을 끝내면 다시는 만나지 못할까 두려운 거겠지.",
    "goals": [
      {
        "kind": "read",
        "key": "time-child-stones",
        "label": "풍혈 상승로의 줄지은 돌 살펴보기"
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-15"
    ]
  },
  {
    "id": "time-17",
    "chapter": "시간의 닻",
    "title": "놓을 것과 잡을 것",
    "npcId": "npc-tsuyosai",
    "offer": [
      "닻에 묶인 시간들이 서로 다른 쪽으로 당긴다. 한쪽만 남기면 잠잠해지겠지.",
      "모두 남기려면 그 당김을 견디며 하나씩 풀어야 한다. 네가 모은 기록을 보고 결정해라."
    ],
    "reminder": "던의 손자국과 티프레의 번개는 함께 남아 있다. 지금 감당할 수 있는 방법을 골라라.",
    "finish": "그 선택대로 준비하자. 닻 앞에서는 말만으로 버틸 수 없다.",
    "goals": [
      {
        "kind": "read",
        "key": "time-dun-plate",
        "label": "던의 흔적 보관"
      },
      {
        "kind": "read",
        "key": "time-shrine-flash",
        "label": "티프레의 흔적 보관"
      },
      {
        "kind": "read",
        "key": "time-battery-log",
        "label": "빠진 시간의 흔적 보관"
      }
    ],
    "choices": [
      {
        "id": "dun",
        "label": "던의 방법으로, 닻을 고정한다",
        "reply": "움직임은 막을 수 있다. 멈춰 있는 동안에도, 안에 있는 이가 기다린다는 것을 잊지 마라."
      },
      {
        "id": "tifre",
        "label": "티프레의 방법으로, 닻을 끊는다",
        "reply": "길은 열릴 것이다. 어느 시간이 먼저 쏟아질지는 네 힘만으로 정할 수 없다."
      },
      {
        "id": "both",
        "label": "두 방법을 엮어, 매듭을 하나씩 푼다",
        "reply": "둘의 방법을 네 손으로 이어 보겠다는 거구나. 도움을 청해도 좋다. 혼자 간다면 받치고 푸는 일을 모두 감당해야 할 것이다.",
        "requiresChaos": true
      }
    ],
    "reward": {
      "xp": 6
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-16"
    ]
  },
  {
    "id": "time-18",
    "chapter": "시간의 닻",
    "title": "돌아올 힘",
    "npcId": "npc-tsuyosai",
    "offer": [
      "오래 버텨야 하는 싸움이다. 보강 붕대를 두 개 가져와라.",
      "두 사람에게 동행을 청할 수는 있다. 함께하지 못해도 길은 열린다. 그만큼 네가 준비할 몫이 늘 뿐이다."
    ],
    "reminder": "던전 하나를 마치고 보강 붕대 두 개를 준비해라. 동행이 필요하면 던과 티프레를 찾아가도 좋다.",
    "finish": "준비는 됐다. 남은 힘으로 끝까지 가는 일만 생각해라.",
    "goals": [
      {
        "kind": "dungeon",
        "key": "clear",
        "label": "던전 하나를 마치기"
      },
      {
        "kind": "deliver",
        "key": "field-wrap",
        "label": "보강 붕대 전달",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 8,
      "stock": {
        "field-salve": 3,
        "field-wrap": 3
      }
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-17"
    ]
  },
  {
    "id": "time-19",
    "chapter": "시간의 닻",
    "title": "다 못 센 돌",
    "npcId": "npc-tsuyosai",
    "offer": [
      "아이가 돌을 다시 세기 시작했다. 어긋날 때마다 처음부터 센다.",
      "풍혈 외곽의 마지막 돌을 봐라. 이번에는 네가 먼저 말을 걸 차례다."
    ],
    "reminder": "풍혈 외곽의 마지막 돌을 읽고 돌아와라. 아이에게 서둘러 끝내라고 하지는 마라.",
    "finish": "기다리는 게 잘못이었다고 말할 필요는 없다. 이제 내려가도 된다는 것을 보여 줘라.",
    "goals": [
      {
        "kind": "read",
        "key": "time-last-stone",
        "label": "풍혈 외곽의 마지막 돌 살펴보기"
      }
    ],
    "reward": {
      "xp": 5
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-18"
    ]
  },
  {
    "id": "time-20",
    "chapter": "시간의 닻",
    "title": "다음 종소리",
    "npcId": "npc-tsuyosai",
    "offer": [
      "준비한 대로 해라. 아이가 놀라면 닻은 더 세게 당길 것이다.",
      "나는 돌아오는 길을 살피겠다. 네가 겪은 시간을 그대로 가져와라."
    ],
    "reminder": "시간의 닻 상공으로 가라. 닻 안쪽의 세 번째 층에 정령이 있다.",
    "finish": "닻이 흔들린다. 오래 멎었던 종소리가, 서로 다른 속도로 돌아온다.",
    "goals": [
      {
        "kind": "boss",
        "key": "bs-act-1-anchor",
        "label": "시간의 닻 3층에서 정령과의 전투 마치기"
      }
    ],
    "completeOnBoss": "bs-act-1-anchor",
    "encounter": {
      "bossId": "bs-act-1-anchor",
      "lines": [
        "작은 손이 허공의 돌 하나를 놓지 못한다.",
        "시간의 정령: …아직. 하나 남았어.",
        "시간의 정령: 기다려 줘."
      ]
    },
    "reward": {
      "xp": 15
    },
    "main": true,
    "series": "시간의 닻",
    "after": [
      "time-19"
    ]
  }
];
