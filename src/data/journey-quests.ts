import type { JourneyQuest } from './quest-types';
import { TIME_STORY_QUESTS } from './time-story-quests';
export type { JourneyQuest, JourneyGoal } from './quest-types';

/** Existing quest IDs retain completed progress while the life stories become regional episodes. */
export const REGIONAL_QUESTS: JourneyQuest[] = [
  {
    "id": "home",
    "main": false,
    "chapter": "일루네온",
    "title": "돌아올 곳",
    "npcId": "npc-niayur",
    "offer": [
      "당분간 머물 집은 구했어? 광장 공동 마당에 빈집이 하나 있어. 네가 써도 돼.",
      "이건 가져가. 위험할 때, 다가오는 걸 조금 밀어낼 수 있을 거야."
    ],
    "reminder": "광장에서 공동 마당으로 가면 네 집이 있어. 먼저 들러 봐. 기술도 거기서 준비하면 돼.",
    "finish": "짐 둘 곳이 생겼네. 이제 좀 천천히 둘러봐도 되겠다.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-iluneon-square::player-home",
        "label": "광장의 내 집에 들르기"
      }
    ],
    "lessonCard": "c-field-pulse",
    "reward": {
      "xp": 2
    },
    "series": "일루네온 · 돌아올 곳"
  },
  {
    "id": "first-shape",
    "main": false,
    "chapter": "일루네온",
    "title": "한 번 꺾어서",
    "npcId": "npc-hako",
    "after": [
      "home"
    ],
    "offer": [
      "이유르한테 카드 받았지? 나도 처음엔 선을 너무 크게 그렸어.",
      "길드 앞 연습 말뚝에 한번 써 봐. 한 번만 꺾으면 돼."
    ],
    "reminder": "집에서 꺾인 선에 기술을 장착하고, 연습 말뚝을 골라 그려 봐. 잠깐 기다리면 마나도 돌아와.",
    "finish": "잘됐네! 멀찍이 밀어 놓고 숨 돌릴 틈을 만드는 거야. 그 틈에 도망쳐도 되고.",
    "goals": [
      {
        "kind": "count",
        "key": "skill",
        "label": "장착한 기술 사용하기"
      }
    ],
    "reward": {
      "xp": 2,
      "card": "c-field-step"
    },
    "series": "일루네온 · 돌아올 곳"
  },
  {
    "id": "fibers",
    "main": false,
    "chapter": "일루네온",
    "title": "버리기 아까운 풀",
    "npcId": "npc-echo",
    "after": [
      "first-shape"
    ],
    "offer": [
      "장갑이 또 터졌어. 가시가 안 꺾여, 여기 풀은.",
      "섬유 두 줌만 가져와. 손 덜 다치게 다루는 법도 알려 줄게."
    ],
    "reminder": "풀을 골라 톡 건드려 봐. 한 군데를 다 뜯었으면 옆 군락도 살펴보고.",
    "finish": "이 정도면 됐어. 남은 철편도 가져가. 섬유에 덧대면 제법 튼튼해.",
    "goals": [
      {
        "kind": "deliver",
        "key": "raw-fiber",
        "label": "에코에게 섬유 건네기",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 2,
      "life": 2,
      "stock": {
        "i-life-ore": 2
      }
    },
    "series": "일루네온 · 돌아올 곳"
  },
  {
    "id": "provisions",
    "main": false,
    "chapter": "일루네온",
    "title": "주머니 속 준비",
    "npcId": "npc-echo",
    "after": [
      "fibers"
    ],
    "offer": [
      "모으기만 하면 짐이지. 내 작업대에서 한번 만들어 봐.",
      "붕대든 연고든, 네가 쓸 걸로. 써 보고 불편한 데가 있으면 말하고."
    ],
    "reminder": "내 곁에서 가방의 가공을 열어 봐. 완성한 물건을 손에 고르고, 쓸 대상을 골라 짧게 내려 그으면 돼.",
    "finish": "손에 잘 맞나 보네. 올뤼가 여행 다닐 사람을 찾던데, 시계탑에 가 볼래?",
    "goals": [
      {
        "kind": "count",
        "key": "crafted",
        "label": "소모품 가공하기"
      },
      {
        "kind": "count",
        "key": "used",
        "label": "가공한 소모품 사용하기"
      }
    ],
    "reward": {
      "xp": 2,
      "life": 2,
      "stock": {
        "field-smoke": 2
      }
    },
    "series": "일루네온 · 돌아올 곳"
  },
  {
    "id": "routebook",
    "series": "라르 · 길을 남기는 법",
    "title": "젖은 노선도",
    "npcId": "npc-olyu",
    "turnInNpcId": "npc-maro",
    "after": [
      "provisions"
    ],
    "offer": [
      "비에 젖은 노선도를 새로 그리고 있네. 숲길은 마로의 도움이 필요해.",
      "라르 숲으로 가는 길에 이 말을 전해 주겠나?"
    ],
    "reminder": "라르 숲의 마로에게 숲길 기록을 부탁해 주게.",
    "finish": "올뤼 씨가 새로 그리시는군요. 저도 바뀐 길을 몇 군데 알고 있어요.",
    "goals": [
      {
        "kind": "talk",
        "key": "npc-maro",
        "label": "마로에게 숲길 이야기 듣기"
      }
    ],
    "reward": {
      "xp": 2
    }
  },
  {
    "id": "pool",
    "series": "라르 · 길을 남기는 법",
    "title": "물이 지나간 자리",
    "npcId": "npc-maro",
    "after": [
      "routebook"
    ],
    "offer": [
      "곧은 길은 비가 오면 잠겨요. 작은 종족에게는 얕은 물도 위험하고요.",
      "안쪽 못의 길 표지를 봐 주세요. 오래된 끈은 어디까지 잠겼는지 알려 줘요."
    ],
    "reminder": "안쪽 못의 길 표지를 읽어 주세요. 빛나는 씨앗은 쓰임새를 생각한 뒤 심으세요.",
    "finish": "가장 높은 끈까지 새로 묶여 있었군요. 다음 지도에는 그 위쪽 길을 넣겠어요.",
    "goals": [
      {
        "kind": "read",
        "key": "lar-route-mark",
        "label": "안쪽 못의 길 표지 확인하기"
      }
    ],
    "reward": {
      "xp": 3,
      "card": "c-field-rain"
    }
  },
  {
    "id": "bark",
    "series": "라르 · 길을 남기는 법",
    "title": "못 대신 매듭",
    "npcId": "npc-kurkuma",
    "after": [
      "pool"
    ],
    "offer": [
      "표지판을 나무에 박으려고? 줄기로 만든 것도 아닌데 왜 아프게 해.",
      "섬유 두 줌만 줘. 내가 묶을게. 나무가 크면 풀어 줄 수도 있잖아."
    ],
    "reminder": "세계수로 와. 질긴 섬유 두 줌이면 돼.",
    "finish": "봐, 붙었지? 다음에 끈이 팽팽해지면 내가 다시 묶을게.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-world-tree",
        "label": "세계수에 들르기"
      },
      {
        "kind": "deliver",
        "key": "raw-fiber",
        "label": "쿠르쿠마에게 섬유 전달",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2
    }
  },
  {
    "id": "hinge",
    "series": "마노니클라 · 바람이 감춘 꼬리",
    "title": "바람 탓이 아닌 것",
    "npcId": "npc-cayo",
    "after": [
      "home"
    ],
    "offer": [
      "협곡 표지가 또 반대로 돌아갔네. 경첩은 멀쩡한데 말이야.",
      "클러치 협곡을 보고 시이드에게도 알려 주게. 바람을 탓하기엔 매듭이 너무 단정해."
    ],
    "reminder": "클러치 협곡을 보고 와. 시이드가 사구 쪽을 살피고 있을 걸세.",
    "finish": "역시 사람이 만진 흔적이군. 아니, 손을 쓰는 누군가라고 해야겠지.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-mano-clutch-gulch",
        "label": "클러치 협곡의 길 확인"
      }
    ],
    "reward": {
      "xp": 3,
      "stock": {
        "i-life-ore": 2
      }
    }
  },
  {
    "id": "wind",
    "series": "마노니클라 · 바람이 감춘 꼬리",
    "title": "매듭을 푼 발",
    "npcId": "npc-seed",
    "after": [
      "hinge"
    ],
    "offer": [
      "내가 위에서 봤어. 표지가 혼자 빙글 도는 줄 알았는데 아니더라!",
      "풍속계 사구의 끈 좀 봐 줘. 누가 날 보자마자 절벽 쪽으로 쏙 사라졌거든."
    ],
    "reminder": "풍속계 사구의 바람끈이야. 노을 절벽 쪽 길도 살펴봐 줘.",
    "finish": "발자국만 남았어? 날아간 건 내가 알 텐데. 카요한테 물어보자. 괜히 쫓아갔다가 혼나겠네.",
    "goals": [
      {
        "kind": "read",
        "key": "mano-dune-mark",
        "label": "풍속계 사구의 바람끈 읽기"
      },
      {
        "kind": "visit",
        "key": "n-mano-sunset-cliff",
        "label": "노을 절벽 살펴보기"
      }
    ],
    "reward": {
      "xp": 3
    }
  },
  {
    "id": "char",
    "series": "마노니클라 · 바람이 감춘 꼬리",
    "title": "알아볼 만한 장난",
    "npcId": "npc-cayo",
    "after": [
      "wind"
    ],
    "offer": [
      "그 자국이면 타마모겠군. 쫓아가 볼 생각인가? 몸을 바꿔 놓는 장난을 하니 가볍게 덤비지는 말게.",
      "우선 표지 글부터 되살리자. 숯 한 조각만 가져와."
    ],
    "reminder": "숯 한 조각이면 돼. 타마모를 만나겠다면 로크에게 갈 곳부터 말해 두고.",
    "finish": "길은 다시 읽히겠네. 어느 몸으로 돌아와도 찾을 수 있게 낮은 곳에도 표시해 두지.",
    "goals": [
      {
        "kind": "deliver",
        "key": "i-life-char",
        "label": "카요에게 숯 전달"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2
    }
  },
  {
    "id": "light",
    "series": "에니챰 · 꺼지지 않는 밤",
    "title": "전등 하나쯤",
    "npcId": "npc-zero",
    "after": [
      "home"
    ],
    "offer": [
      "길가 전등을 작게 바꿔 보려고. 발전기가 끊겨도 혼자 켜지게.",
      "전하석 두 개만 가져와 줘. 하나는 비 맞혀 보고 비교하자."
    ],
    "reminder": "전하석 두 개야. 송전탑 근처에 쓸 만한 게 있어.",
    "finish": "켜졌다. 밝기는 이만하면 됐고… 비만 안 새면 되겠네.",
    "goals": [
      {
        "kind": "deliver",
        "key": "i-life-charge",
        "label": "제로에게 전하석 전달",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 3,
      "stock": {
        "field-spark": 2
      }
    }
  },
  {
    "id": "night-route",
    "series": "에니챰 · 꺼지지 않는 밤",
    "title": "불이 꺼진 이유",
    "npcId": "npc-alti-alta",
    "after": [
      "light"
    ],
    "offer": [
      "전등이 또 꺼졌어요. 제로는 전하석을 더 넣겠다고 하지만요.",
      "발전실 점검표부터 봐 주세요. 전기는 부족하지 않았어요."
    ],
    "reminder": "발전실 점검표를 읽어 주세요. 젖은 바닥에서는 전하석을 만지지 마시고요.",
    "finish": "덮개 안으로 물이 샜군요. 이번에는 제로도 부품을 늘리지 않아도 되겠어요.",
    "goals": [
      {
        "kind": "read",
        "key": "enicham-contact-note",
        "label": "발전실 점검표 읽기"
      }
    ],
    "reward": {
      "xp": 3
    }
  },
  {
    "id": "assembly",
    "series": "에니챰 · 꺼지지 않는 밤",
    "title": "남은 틈",
    "npcId": "npc-zero",
    "after": [
      "night-route"
    ],
    "offer": [
      "전하석 문제는 아니었네. 덮개가 딱 맞는 줄 알았는데.",
      "보강 붕대 하나만 줘. 안쪽을 받치면 흔들리는 틈도 잡을 수 있겠어."
    ],
    "reminder": "보강 붕대 하나면 돼. 내 옆에서 만들어도 괜찮아.",
    "finish": "이젠 흔들어도 안 벌어져. 알티 말부터 들을걸. 이 말은 전하지 말아 줘.",
    "goals": [
      {
        "kind": "deliver",
        "key": "field-wrap",
        "label": "제로에게 보강 붕대 전달"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 3
    }
  },
  {
    "id": "local-test",
    "series": "에니챰 · 꺼지지 않는 밤",
    "title": "작은 불빛의 끝",
    "npcId": "npc-alti-alta",
    "after": [
      "assembly"
    ],
    "offer": [
      "송전탑에 시험 전등을 달아 뒀어요. 밤새 꺼지지 않았어요.",
      "직접 보고 와 주실래요? 빛이 충분한지는 제가 정하기 어렵네요."
    ],
    "reminder": "송전탑의 시험 전등을 살펴봐 주세요.",
    "finish": "알려 주셔서 고마워요. 쉬는 곳에도 하나씩 놓을게요. 길만 밝히면 자꾸 지나치게 되니까요.",
    "goals": [
      {
        "kind": "read",
        "key": "enicham-light-note",
        "label": "송전탑 시험 전등 살펴보기"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2,
      "stock": {
        "field-spark": 3
      }
    }
  },
  {
    "id": "road-ready",
    "series": "일루네온 · 돌아온 사람",
    "title": "다음 여행의 짐",
    "npcId": "npc-hako",
    "after": [
      "warm-cup"
    ],
    "offer": [
      "짐이 좀 줄었네. 나도 쓸 것만 챙기려고 하는데 잘 안돼.",
      "네가 만든 것 좀 참고해도 돼? 여행용 물건을 세 번쯤 만들어 보면 손에 맞는 게 생길 거야."
    ],
    "reminder": "가공을 모두 세 번 해 보면 돼. 지금까지 만든 것도 괜찮아.",
    "finish": "난 연막을 더 챙기려고. 위험하면 뛰기부터 하는 버릇은 쉽게 안 고쳐지더라.",
    "goals": [
      {
        "kind": "count",
        "key": "crafted",
        "label": "소모품 가공하기",
        "amount": 3
      }
    ],
    "reward": {
      "xp": 2,
      "stock": {
        "field-smoke": 2,
        "field-salve": 2
      }
    }
  },
  {
    "id": "homecoming",
    "series": "일루네온 · 돌아온 사람",
    "title": "분수 옆 빈자리",
    "npcId": "npc-niayur",
    "after": [
      "road-ready"
    ],
    "offer": [
      "한 바퀴 돌고 왔어? 분수 옆에 잠깐 앉았다 갈래?",
      "여행 다니면 돌아온 날에도 자꾸 나갈 길부터 보게 되더라."
    ],
    "reminder": "분수 옆에서 한숨 돌리고 와. 나는 여기 있을게.",
    "finish": "왔구나. 오늘은 어디까지 갈 건지 안 물을게. 차부터 마시자.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-ilu-fountain-side",
        "label": "분수 옆에 들르기"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 3,
      "stock": {
        "field-wrap": 3
      }
    }
  },
  {
    "id": "warm-cup",
    "series": "일루네온 · 돌아온 사람",
    "title": "식기 전에",
    "npcId": "npc-imperisia",
    "after": [
      "provisions"
    ],
    "offer": [
      "[요청]:: 식당 화로에 쓸 숯이 필요합니다.",
      "[부연]:: 이유르는 식은 차도 괜찮다고 했습니다. 그래도 매번 식은 잔을 드리고 싶지는 않습니다."
    ],
    "reminder": "[요청]:: 숯 하나만 부탁드립니다.",
    "finish": "[감사]:: 제 잔도 놓아 보았습니다. 마시지 않아도 빈자리는 줄어드는군요.",
    "goals": [
      {
        "kind": "deliver",
        "key": "i-life-char",
        "label": "임페리시아에게 숯 전달"
      }
    ],
    "reward": {
      "xp": 2,
      "stock": {
        "i-crop-grain": 2
      }
    }
  },
  {
    "id": "spare-handle",
    "title": "남는 손잡이",
    "npcId": "npc-echo",
    "after": [
      "provisions"
    ],
    "offer": [
      "카요한테 받은 손잡이가 남았어. 네가 쓸래?",
      "대신 연고 하나만. 아침부터 손등이 따가워서 일을 못 하겠네."
    ],
    "reminder": "섬유 둘하고 물 하나면 연고를 만들 수 있어. 내 옆에서 해도 되고.",
    "finish": "살겠네. 고맙다. 손잡이는 집에서 네 기술 손볼 때 같이 써 봐.",
    "goals": [
      {
        "kind": "deliver",
        "key": "field-salve",
        "label": "에코에게 수액 연고 건네기"
      }
    ],
    "reward": {
      "xp": 2,
      "stock": {
        "i-material-common": 3
      }
    },
    "main": false
  },
  {
    "id": "rook-sand",
    "series": "마노니클라 · 바람이 감춘 꼬리",
    "title": "돌아올 이름",
    "npcId": "npc-rok",
    "after": [
      "char"
    ],
    "offer": [
      "노을 절벽 너머로 가실 거예요? 여기에 이름을 남겨 주세요.",
      "타마모 씨가 남긴 붉은 쪽지가 있다던데… 읽더라도 먼저 싸움을 걸지는 마세요."
    ],
    "reminder": "노을 절벽 너머 타마모의 겨룸터에 붉은 쪽지가 있어요. 이겨야 하는 부탁은 아니에요.",
    "finish": "돌아오셨네요. 이름은 지우지 않았어요. 오래 걸렸더라도요.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-mano-arc",
        "label": "타마모의 겨룸터 살펴보기"
      },
      {
        "kind": "read",
        "key": "mano-fox-note",
        "label": "돌 틈의 붉은 쪽지 읽기"
      }
    ],
    "encounter": {
      "bossId": "bs-arc-tamamo",
      "lines": [
        "타마모가 플레이어의 발끝을 훑어본다.",
        "타마모: 그 몸으로 여기까지 왔니. 다른 걸 입어 볼 생각은 없고?"
      ]
    },
    "reward": {
      "xp": 4
    }
  },
  {
    "id": "deep-step",
    "title": "나올 길부터",
    "npcId": "npc-rize",
    "after": [
      "first-shape"
    ],
    "offer": [
      "던전에 들어갈 거야? 그럼 입구를 지나칠 때 한번 돌아봐.",
      "나올 때도 같은 모양으로 보일지는 모르니까. 한 군데 다녀와서 이야기해 줘."
    ],
    "reminder": "어느 던전이든 괜찮아. 끝까지 못 가겠으면 돌아와도 돼. 부탁은 기다릴 테니까.",
    "finish": "돌아왔네. 들어갈 때보다 나올 때 더 잘 봤지? 그걸 잊지 않으면 다음에도 돌아올 수 있어.",
    "goals": [
      {
        "kind": "dungeon",
        "key": "clear",
        "label": "던전 하나를 마치기"
      }
    ],
    "reward": {
      "xp": 3,
      "stock": {
        "field-wrap": 2,
        "field-smoke": 2
      }
    },
    "main": false
  },
  {
    "id": "lar-return",
    "series": "라르 · 길을 남기는 법",
    "title": "다른 발걸음",
    "npcId": "npc-maro",
    "after": [
      "bark"
    ],
    "offer": [
      "쿠르쿠마가 표지를 달았다고 알려 줬어요.",
      "돌아오는 길에 불편한 곳은 없었나요? 제가 걷는 것만으로는 다 알 수 없어서요."
    ],
    "reminder": "세계수 쪽을 걸어 보고, 제게 돌아와 말씀해 주세요.",
    "finish": "그 부분도 적어 둘게요. 지도 한 장에 모두 맞추기는 어렵지만, 돌아갈 길은 고를 수 있게 해야죠.",
    "goals": [
      {
        "kind": "visit",
        "key": "n-world-tree",
        "label": "세계수까지의 길 확인"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2,
      "stock": {
        "field-salve": 2
      }
    }
  },
  {
    "id": "mano-return",
    "series": "마노니클라 · 바람이 감춘 꼬리",
    "title": "접수대는 그대로",
    "npcId": "npc-rok",
    "after": [
      "rook-sand"
    ],
    "offer": [
      "시이드 씨가 발자국 그림을 더 그려 왔어요. 표지 아래에 붙이려고요.",
      "섬유 두 줌만 주실래요? 이번엔 누구나 알아볼 수 있게 묶어 두고 싶어요."
    ],
    "reminder": "섬유 두 줌이면 돼요. 몸이 바뀌어도 접수대에서 하실 일은 달라지지 않아요.",
    "finish": "됐어요. 불편한 게 있으면 또 와 주세요. 몸을 되돌리는 일은 모스의 카시스 씨에게 여쭤보시고요.",
    "goals": [
      {
        "kind": "deliver",
        "key": "raw-fiber",
        "label": "로크에게 표지용 섬유 전달",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 4,
      "life": 3,
      "stock": {
        "field-wrap": 2
      }
    }
  },
  {
    "id": "tacomi-01",
    "series": "타코미 · 함께 쓰는 잔",
    "title": "잔보다 귀한 상자",
    "npcId": "npc-shinsian",
    "after": [
      "home"
    ],
    "offer": [
      "정류장에 공용 잔을 내놨어. 잔은 자꾸 돌아오는데 상자가 안 돌아오네.",
      "짐 쪽지를 읽어 봐 줄래? 내가 말을 헷갈리게 썼나 싶어서."
    ],
    "reminder": "옛 정류장의 짐 쪽지야. 상자 얘기는 아래에 작게 썼어.",
    "finish": "작아서 못 봤겠네. 잔을 가져가는 건 괜찮은데, 포장할 섬유는 모으기가 어렵거든.",
    "goals": [
      {
        "kind": "read",
        "key": "tacomi-parcel-note",
        "label": "옛 정류장의 짐 쪽지 읽기"
      }
    ],
    "reward": {
      "xp": 2
    }
  },
  {
    "id": "tacomi-02",
    "series": "타코미 · 함께 쓰는 잔",
    "title": "힘을 쓸 자리",
    "npcId": "npc-monato",
    "after": [
      "tacomi-01"
    ],
    "offer": [
      "상자는 내가 옮길게. 안에 있는 녀석도 심심하대.",
      "대신 섬유 두 줌만 가져와 줘. 힘껏 들면 안에서 잔끼리 부딪쳐서 말이야."
    ],
    "reminder": "포장에 쓸 섬유 두 줌이면 돼. 무거운 건 괜찮아. 깨지는 게 문제지.",
    "finish": "이제 덜 달그락거리네. 천천히 가자고 전할게. 응, 너한테 한 말 아니야.",
    "goals": [
      {
        "kind": "deliver",
        "key": "raw-fiber",
        "label": "모나토에게 포장용 섬유 전달",
        "amount": 2
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2
    }
  },
  {
    "id": "tacomi-03",
    "series": "타코미 · 함께 쓰는 잔",
    "title": "돌아온 모서리",
    "npcId": "npc-shinsian",
    "after": [
      "tacomi-02"
    ],
    "offer": [
      "모나토가 상자를 가져다줬어. 이번엔 하나도 안 깨졌네.",
      "카페 장부도 봐 줄래? 손잡이가 작은 잔은 따로 표시했거든."
    ],
    "reminder": "카페의 빌림 장부를 봐. 빌리는 사람 이름보다 잔 모양을 먼저 적었어.",
    "finish": "이제 자기 손에 맞는 걸 고르겠지. 다음에 목마르면 하나 가져가. 상자까지 필요하면 말하고.",
    "goals": [
      {
        "kind": "read",
        "key": "tacomi-cup-note",
        "label": "카페의 빌림 장부 읽기"
      }
    ],
    "reward": {
      "xp": 3,
      "life": 2,
      "stock": {
        "field-salve": 2
      }
    }
  }
];

export const JOURNEY_QUESTS: JourneyQuest[] = [...TIME_STORY_QUESTS, ...REGIONAL_QUESTS];
