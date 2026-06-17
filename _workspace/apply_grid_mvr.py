"""
cards-mvr.txt 격자(shape/per_tile_mul/cast_speed/target_mode) 테마 재설계 스크립트.
- 효과/name/flavor/cost 값 불변.
- shape 아키타입 다양화: single / line / cross / horizontal / aoe / diagonal / cone 등.
- cast_speed: fast/normal/slow 재조정.
- target_mode 오분류 교정 (pure-self 카드가 pattern으로 잘못 분류된 경우).
"""

import re

# ─────────────────────────────────────────────────────────────────
# 매핑 테이블: card_id → (shape, per_tile_mul, cast_speed, target_mode_override)
#   shape=None → 기존 유지 (self 카드)
#   per_tile_mul=None → per_tile_mul 줄 제거
#   target_mode_override=None → 기존 유지
# ─────────────────────────────────────────────────────────────────

GRID_MAP = {
    # ── 기본 등급 ──
    "c-strike":         ("0,-1",                     None,            "fast",   None),
    "c-strike-plus":    ("0,-1",                     None,            "fast",   None),
    "c-defend":         (None,                       None,            None,     "self"),
    "c-defend-plus":    (None,                       None,            None,     "self"),
    "c-quickdraw":      (None,                       None,            "fast",   "self"),
    "c-quickdraw-plus": (None,                       None,            "fast",   "self"),
    "c-recover":        (None,                       None,            "slow",   "self"),
    "c-recover-plus":   (None,                       None,            "slow",   "self"),

    # ── 일반 등급 ──
    # 결심의 섬광: 공격+방어 동시. 인간 균형 — 단일 전방
    "c-resolve-flash":      ("0,-1",                 None,            "normal", None),
    "c-resolve-flash-plus": ("0,-1",                 None,            "normal", None),
    # 물의 방패: 순수 방어 — self
    "c-gentle-guard":       (None,                   None,            "slow",   "self"),
    "c-gentle-guard-plus":  (None,                   None,            "slow",   "self"),
    # 패기: 손패 기세. 전방+후방 직선(이미 좋음)
    "c-double-strike":      ("0,-1|0,1",             None,            "fast",   None),
    "c-double-strike-plus": ("0,-1|0,1",             None,            "fast",   None),
    # 집중: 순수 드로우 — self
    "c-focused-mind":       (None,                   None,            "slow",   "self"),
    "c-focused-mind-plus":  (None,                   None,            "slow",   "self"),
    # 화염구: 가로 3칸 화염 (이미 좋음)
    "c-burn-mark":          ("-1,-1|0,-1|1,-1",      "0.6,1.0,0.6",  "slow",   None),
    "c-burn-mark-plus":     ("-1,-1|0,-1|1,-1",      "0.6,1.0,0.6",  "slow",   None),

    # ── 희귀 등급 ──
    # 산들바람: 회복+드로우 — self 소멸
    "c-second-wind":        (None,                   None,            "slow",   "self"),
    "c-second-wind-plus":   (None,                   None,            "normal", "self"),
    # 응급 치료: 전방 타격+자가회복 — 단일
    "c-deep-breath":        ("0,-1",                 None,            "fast",   None),
    "c-deep-breath-plus":   ("0,-1",                 None,            "fast",   None),

    # ── 전설 등급 ──
    # 이세계의 검: 직선 관통 3칸 (이미 좋음)
    "c-transcend-strike":      ("0,-1|0,-2|0,-3",    "1.0,0.8,0.5",  "slow",   None),
    "c-transcend-strike-plus": ("0,-1|0,-2|0,-3",    "1.0,0.7,0.4",  "slow",   None),

    # ── 보스 보상 ──
    # 그림자 밟기: 발밑+좌우 십자형 (이미 좋음)
    "c-shadow-rebuke":      ("0,-1|-1,0|1,0",        "1.0,0.5,0.5",  "normal", None),
    "c-shadow-rebuke-plus": ("0,-1|-1,0|1,0",        "1.0,0.6,0.6",  "normal", None),

    # ── 마을 전설 카드 ──
    # 멈춘 시계(일루네온): 정지→단일 집중타
    "c-iluneon-stopped-noon":      ("0,-1",           None,           "slow",   None),
    "c-iluneon-stopped-noon-plus": ("0,-1",           None,           "slow",   None),
    # 꺼지지 않는 불(모스): 직선 관통 — 화로의 불길
    "c-moss-ember-strike":         ("0,-1|0,-2",      "1.0,0.7",     "slow",   None),
    "c-moss-ember-strike-plus":    ("0,-1|0,-2",      "1.0,0.7",     "slow",   None),
    # 홀로매트릭스(타코미): ghost+block — self
    "c-tacomi-hologram-mirror":    (None,             None,           "slow",   "self"),
    "c-tacomi-hologram-mirror-plus":(None,            None,           "slow",   "self"),
    # 안개의 약속(알리메스): 안개 단일 집중+회복 소멸
    "c-alimes-mist-vow":           ("0,-1",           None,           "slow",   None),
    "c-alimes-mist-vow-plus":      ("0,-1",           None,           "slow",   None),
    # 석양의 벽(마노니클라): 방어→반격. 전방+좌우 횡
    "c-manonickla-sunset-wall":    ("0,-1|-1,0|1,0",  "1.0,0.7,0.7", "slow",   None),
    "c-manonickla-sunset-wall-plus":("0,-1|-1,0|1,0", "1.0,0.7,0.7", "slow",   None),

    # ── NPC 영입 카드 ──
    # 상승기류: 드로우+에너지 — self
    "c-swift-step":      (None,  None,  "fast",  "self"),
    "c-swift-step-plus": (None,  None,  "fast",  "self"),
    # 등기 우편: 드로우+에너지 — self 빠름
    "c-fast-mail":       (None,  None,  "fast",  "self"),
    "c-fast-mail-plus":  (None,  None,  "fast",  "self"),
    # 균형검: 단일 전방
    "c-balanced-edge":       ("0,-1", None, "normal", None),
    "c-balanced-edge-plus":  ("0,-1", None, "normal", None),
    # 후회(binding-ward): 약화 디버프 단일
    "c-binding-ward":        ("0,-1", None, "normal", None),
    "c-binding-ward-plus":   ("0,-1", None, "normal", None),
    # 가라앉음: 디버프 2종 — 단일
    "c-quiet-arc":           ("0,-1", None, "slow",   None),
    "c-quiet-arc-plus":      ("0,-1", None, "slow",   None),
    # 찰칵!: 마비 플래시. 전방 넓게 터짐 — 가로 3칸
    "c-flash-capture":       ("-1,-1|0,-1|1,-1",     "0.5,1.0,0.5", "slow",  None),
    "c-flash-capture-plus":  ("-1,-1|0,-1|1,-1",     "0.5,1.0,0.5", "slow",  None),
    # 연속 타격: 단일 연타
    "c-rize-relay":          ("0,-1", None, "fast",   None),
    "c-rize-relay-plus":     ("0,-1", None, "fast",   None),
    "c-rize-relay-echo":     ("0,-1", None, "fast",   None),
    "c-rize-relay-echo-plus":("0,-1", None, "fast",   None),
    # 모인 영혼들: 색 기반 피해+드로우 — 단일
    "c-spirit-call":         ("0,-1", None, "normal", None),
    "c-spirit-call-plus":    ("0,-1", None, "normal", None),
    # 따뜻한 한 잔: 회복+공격 소멸 — 단일
    "c-warm-cup":            ("0,-1", None, "normal", None),
    "c-warm-cup-plus":       ("0,-1", None, "normal", None),
    # 트립스: 거대 단일 폭발
    "c-tripps-rage":         ("0,-1", None, "slow",   None),
    "c-tripps-rage-plus":    ("0,-1", None, "slow",   None),
    # 발자취: 드로우+에너지+손패 — self
    "c-trace-step":          (None,   None, "fast",   "self"),
    "c-trace-step-plus":     (None,   None, "fast",   "self"),
    # 자라나는 잎새: 성장 방어 — self
    "c-growing-leaf":        (None,   None, "slow",   "self"),
    "c-growing-leaf-plus":   (None,   None, "slow",   "self"),
    # 전류 자국: 전기 직선 관통 2칸
    "c-zero-spark":          ("0,-1|0,-2",   "1.0,0.6",  "fast",   None),
    "c-zero-spark-plus":     ("0,-1|0,-2",   "1.0,0.6",  "fast",   None),
    # 알티-알타의 신호: 전파 신호 — 십자(4방향)
    "c-alti-resonance":      ("0,-1|0,1|-1,0|1,0",  "1.0,0.8,0.8,0.8", "normal", None),
    "c-alti-resonance-plus": ("0,-1|0,1|-1,0|1,0",  "1.0,0.8,0.8,0.8", "normal", None),
    # 화염 거미줄: 거미줄=대각 확산
    "c-flame-web":           ("-1,-1|0,-1|1,-1|-1,0|1,0",  "0.7,1.0,0.7,0.7,0.7", "slow",   None),
    "c-flame-web-plus":      ("-1,-1|0,-1|1,-1|-1,0|1,0",  "0.7,1.0,0.7,0.7,0.7", "slow",   None),
    # 범고래의 물결: 물결=직선+측면 부채꼴
    "c-orca-tide":           ("0,-1|-1,-1|1,-1",     "1.0,0.6,0.6",  "normal", None),
    "c-orca-tide-plus":      ("0,-1|-1,-1|1,-1",     "1.0,0.6,0.6",  "normal", None),
    # 꼬리 감기: 옆면에서 감아옴 — 전방+좌우+후방 포위
    "c-trade-coil":          ("0,-1|-1,0|1,0|0,1",   "1.0,0.7,0.7,0.5", "slow",  None),
    "c-trade-coil-plus":     ("0,-1|-1,0|1,0|0,1",   "1.0,0.7,0.7,0.5", "slow",  None),
    # 리포의 신호: 드로우+방어 — self
    "c-lop-sign":            (None,  None,  "normal", "self"),
    "c-lop-sign-plus":       (None,  None,  "normal", "self"),
    # 물의 방패(tide-veil): 치유+방어 — self
    "c-tide-veil":           (None,  None,  "normal", "self"),
    "c-tide-veil-plus":      (None,  None,  "normal", "self"),
    # 곰의 방벽: 방어+전방 단일 반격
    "c-bear-bastion":        ("0,-1", None,  "slow",  None),
    "c-bear-bastion-plus":   ("0,-1", None,  "slow",  None),
    # 빠른 삼연: 연속 3타 직선 2칸
    "c-tiger-rush":          ("0,-1|0,-2",   "1.0,0.8",  "fast",  None),
    "c-tiger-rush-plus":     ("0,-1|0,-2",   "1.0,0.8",  "fast",  None),

    # ── 측정 어려운 1차 ──
    # 오로라: 색 타격 단일
    "c-prism-strike":        ("0,-1", None, "normal", None),
    "c-prism-strike-plus":   ("0,-1", None, "normal", None),
    # 간파: 색 방어 — self
    "c-prism-guard":         (None,   None, "normal", "self"),
    "c-prism-guard-plus":    (None,   None, "normal", "self"),
    # 무지갯빛 칼날: 색 수=광역 3×3 AoE
    "c-spectrum-edge":       ("-1,-1|0,-1|1,-1|-1,0|0,0|1,0|-1,1|0,1|1,1",
                              "0.6,0.8,0.6,0.8,1.0,0.8,0.5,0.7,0.5", "slow", None),
    "c-spectrum-edge-plus":  ("-1,-1|0,-1|1,-1|-1,0|0,0|1,0|-1,1|0,1|1,1",
                              "0.6,0.8,0.6,0.8,1.0,0.8,0.5,0.7,0.5", "slow", None),
    # 피의 계약: HP 기반 단일 집중타
    "c-blood-pact":          ("0,-1", None, "slow",   None),
    "c-blood-pact-plus":     ("0,-1", None, "slow",   None),

    # ── 측정 어려운 2차 (수화/퇴행/디버프) ──
    # 짐승의 가죽: feral 자가부여+전방 — 단일
    "c-beast-skin":          ("0,-1", None, "fast",   None),
    "c-beast-skin-plus":     ("0,-1", None, "fast",   None),
    # 사냥 본능: 사냥=직선 2칸 돌진
    "c-fang-frenzy":         ("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    "c-fang-frenzy-plus":    ("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    # 마지막 힘: 1회용 폭발 단일
    "c-primal-collapse":     ("0,-1", None, "slow",   None),
    "c-primal-collapse-plus":("0,-1", None, "slow",   None),
    # 태고의 저주: 퇴행+피해 — 전방+후방(저주가 사방으로 퍼짐)
    "c-elder-curse":         ("0,-1|0,1",     None,       "slow",   None),
    "c-elder-curse-plus":    ("0,-1|0,1",     None,       "slow",   None),
    # 네메시스: 디버프 착취 단일
    "c-debuff-storm":        ("0,-1", None, "normal", None),
    "c-debuff-storm-plus":   ("0,-1", None, "normal", None),
    # 저주받은 검: 디버프 착취 직선 2칸
    "c-cursed-blade":        ("0,-1|0,-2",   "1.0,0.7",  "slow",   None),
    "c-cursed-blade-plus":   ("0,-1|0,-2",   "1.0,0.7",  "slow",   None),
    # 균열: 취약 폭발 단일
    "c-vuln-detonate":       ("0,-1", None, "fast",   None),
    "c-vuln-detonate-plus":  ("0,-1", None, "fast",   None),
    # 바람 넘침: 드로우 — self
    "c-prism-overflow":      (None,   None, "fast",   "self"),
    "c-prism-overflow-plus": (None,   None, "fast",   "self"),
    # 마지막 버팀: HP 기반 단일 집중타
    "c-last-stand":          ("0,-1", None, "slow",   None),
    "c-last-stand-plus":     ("0,-1", None, "slow",   None),
    # 등껍질의 가시: 방어+손패 반격 — self(방어)+단일? → 효과 block-to-damage, 공격형
    "c-tortoise-thorn":      ("0,-1", None, "slow",   None),
    "c-tortoise-thorn-plus": ("0,-1", None, "slow",   None),
    # 독꽃 피우기: 독+단일
    "c-venom-bloom":         ("0,-1", None, "normal", None),
    "c-venom-bloom-plus":    ("0,-1", None, "normal", None),
    # 가시 돋친 말: 약화+취약 단일
    "c-double-hex":          ("0,-1", None, "normal", None),
    "c-double-hex-plus":     ("0,-1", None, "normal", None),

    # ── 측정 어려운 3차 (소멸/전환/마나/연동/성장) ──
    # 작별의 검: 1회용 거대 단일
    "c-final-blade":         ("0,-1", None, "slow",   None),
    "c-final-blade-plus":    ("0,-1", None, "slow",   None),
    # 마지막 보루: 1회용 거대 방어 — self
    "c-last-bulwark":        (None,   None, "slow",   "self"),
    "c-last-bulwark-plus":   (None,   None, "slow",   "self"),
    # 파멸의 낙인: 디버프 두 종 1회용 — 전방+좌우 확산
    "c-doom-mark":           ("-1,-1|0,-1|1,-1",  "0.7,1.0,0.7",  "normal", None),
    "c-doom-mark-plus":      ("-1,-1|0,-1|1,-1",  "0.7,1.0,0.7",  "fast",   None),
    # 등껍질 후려치기: 이미 횡 3칸 좋음
    "c-shell-slam":          ("0,-1|-1,0|1,0",    "1.0,0.7,0.7",  "normal", None),
    "c-shell-slam-plus":     ("0,-1|-1,0|1,0",    "1.0,0.7,0.7",  "normal", None),
    # 성벽의 반격: 방어+반격 전방 단일
    "c-bastion-counter":     ("0,-1", None, "slow",   None),
    "c-bastion-counter-plus":("0,-1", None, "slow",   None),
    # 전부 쏟기: 마나 몰빵 — 전방+좌우+후방 전방위
    "c-all-in":              ("0,-1|-1,0|1,0|0,1",  "1.0,0.6,0.6,0.4", "fast", None),
    "c-all-in-plus":         ("0,-1|-1,0|1,0|0,1",  "1.0,0.6,0.6,0.4", "fast", None),
    # 과부하 폭발: 전기 폭발 광역
    "c-overdraw-burst":      ("-1,-1|0,-1|1,-1|-1,0|0,0|1,0",
                              "0.5,0.8,0.5,0.6,1.0,0.6",  "fast",   None),
    "c-overdraw-burst-plus": ("-1,-1|0,-1|1,-1|-1,0|0,0|1,0",
                              "0.5,0.8,0.5,0.6,1.0,0.6",  "fast",   None),
    # 동행의 돌격: 동료들=전방 직선 2칸 돌격
    "c-comrades-charge":     ("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    "c-comrades-charge-plus":("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    # 인연의 일격: 동료+방어 — 전방+측면
    "c-bonded-strike":       ("0,-1|-1,0|1,0",  "1.0,0.6,0.6",  "normal", None),
    "c-bonded-strike-plus":  ("0,-1|-1,0|1,0",  "1.0,0.6,0.6",  "normal", None),
    # 수집가의 일격: 유물 수 — 대각 절개 (독특하게)
    "c-collectors-strike":   ("-1,-1|0,-1|1,-1",  "0.7,1.0,0.7",  "normal", None),
    "c-collectors-strike-plus":("-1,-1|0,-1|1,-1","0.7,1.0,0.7",  "normal", None),
    # 보물의 분노: 유물 분노 — 전방 집중 + 측면 폭발
    "c-hoarders-wrath":      ("0,-1|-1,-1|1,-1|-1,0|1,0",
                              "1.0,0.6,0.6,0.5,0.5",  "slow",   None),
    "c-hoarders-wrath-plus": ("0,-1|-1,-1|1,-1|-1,0|1,0",
                              "1.0,0.6,0.6,0.5,0.5",  "slow",   None),
    # 자라나는 송곳니: 성장 단일
    "c-rising-fang":         ("0,-1", None, "normal", None),
    "c-rising-fang-plus":    ("0,-1", None, "normal", None),
    # 부풀어 오르는 폭풍: 십자 광역 (이미 좋음)
    "c-mounting-storm":      ("0,-1|0,1|-1,0|1,0",  "1,1,1,1",  "slow",  None),
    "c-mounting-storm-plus": ("0,-1|0,1|-1,0|1,0",  "1,1,1,1",  "slow",  None),
    # 안정: 손패 기반 회복 — self
    "c-shared-breath":       (None,   None, "normal", "self"),
    "c-shared-breath-plus":  (None,   None, "normal", "self"),
    # 만개의 회복: 드로우+회복 — self
    "c-bloom-recovery":      (None,   None, "slow",   "self"),
    "c-bloom-recovery-plus": (None,   None, "slow",   "self"),
    # 거울의 메아리: 다음 카드 2배 — self
    "c-mirror-echo":         (None,   None, "fast",   "self"),
    "c-mirror-echo-plus":    (None,   None, "fast",   "self"),
    # 독의 첨탑: 독+디버프착취 — 직선 2칸 (탑처럼 높이)
    "c-toxic-spire":         ("0,-1|0,-2",   "1.0,0.6",  "normal", None),
    "c-toxic-spire-plus":    ("0,-1|0,-2",   "1.0,0.6",  "normal", None),
    # 과욕: 색 2종 — 단일
    "c-prism-overload":      ("0,-1", None, "slow",   None),
    "c-prism-overload-plus": ("0,-1", None, "slow",   None),
    # 취약의 균열: 취약 부여+폭발 — 단일
    "c-frail-rupture":       ("0,-1", None, "normal", None),
    "c-frail-rupture-plus":  ("0,-1", None, "normal", None),
    # 희생의 칼날: HP 기반+드로우 — 단일
    "c-sacrifice-edge":      ("0,-1", None, "normal", None),
    "c-sacrifice-edge-plus": ("0,-1", None, "normal", None),

    # ── 상점 평범 카드 ──
    # 무난한 베기: 이미 횡 3칸 좋음
    "c-shop-cut":            ("0,-1|-1,0|1,0",  "1.0,0.7,0.7",  "normal", None),
    "c-shop-cut-plus":       ("0,-1|-1,0|1,0",  "1.0,0.7,0.7",  "normal", None),
    # 무난한 막기: self
    "c-shop-brace":          (None,   None, "normal", "self"),
    "c-shop-brace-plus":     (None,   None, "normal", "self"),
    # 가벼운 손짓: self 빠름
    "c-shop-flick":          (None,   None, "fast",   "self"),
    "c-shop-flick-plus":     (None,   None, "fast",   "self"),
    # 한 모금: self 소멸
    "c-shop-sip":            (None,   None, "normal", "self"),
    "c-shop-sip-plus":       (None,   None, "normal", "self"),
    # 잽: 단일 빠름
    "c-shop-poke":           ("0,-1", None, "fast",   None),
    "c-shop-poke-plus":      ("0,-1", None, "fast",   None),
    # 묵직한 일격: 단일 느림
    "c-shop-heavy":          ("0,-1", None, "slow",   None),
    "c-shop-heavy-plus":     ("0,-1", None, "slow",   None),
    # 든든한 벽: self 느림
    "c-shop-wall":           (None,   None, "slow",   "self"),
    "c-shop-wall-plus":      (None,   None, "slow",   "self"),
    # 잠깐 살핌: 드로우 self
    "c-shop-study":          (None,   None, "normal", "self"),
    "c-shop-study-plus":     (None,   None, "normal", "self"),
    # 응급 처치: 치유+방어 self
    "c-shop-salve":          (None,   None, "normal", "self"),
    "c-shop-salve-plus":     (None,   None, "normal", "self"),

    # ── 미니 마을 전설 ──
    # 잿불 폭풍: 십자 광역 (이미 좋음)
    "c-triflower-emberstorm":      ("0,-1|0,1|-1,0|1,0",  "1,1,1,1",  "slow",  None),
    "c-triflower-emberstorm-plus": ("0,-1|0,1|-1,0|1,0",  "1,1,1,1",  "slow",  None),
    # 급강하: 직선 3칸 (위→아래 급강하)
    "c-falcon-skydive":            ("0,-1|0,-2|0,-3",  "1.0,0.7,0.5",  "fast",  None),
    "c-falcon-skydive-plus":       ("0,-1|0,-2|0,-3",  "1.0,0.7,0.5",  "fast",  None),
    # 정수핵 깨기: 방어→반격 — 단일 묵직
    "c-yusezria-corebreak":        ("0,-1", None, "slow",   None),
    "c-yusezria-corebreak-plus":   ("0,-1", None, "slow",   None),
    # 무늬의 빛: 색 광역 — 가로 3칸
    "c-diropel-totem":             ("-1,-1|0,-1|1,-1",  "0.7,1.0,0.7",  "normal", None),
    "c-diropel-totem-plus":        ("-1,-1|0,-1|1,-1",  "0.7,1.0,0.7",  "normal", None),

    # ── 마무리 조합 ──
    # 영혼 거두기: 디버프착취+독 — 직선 2칸
    "c-soul-harvest":        ("0,-1|0,-2",   "1.0,0.6",  "slow",   None),
    "c-soul-harvest-plus":   ("0,-1|0,-2",   "1.0,0.6",  "slow",   None),
    # 야성의 돌진: feral+손패. 직선 2칸 돌진 (이미 좋음)
    "c-wild-rush":           ("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    "c-wild-rush-plus":      ("0,-1|0,-2",   "1.0,0.7",  "fast",   None),
    # 범람: 색 단일+드로우
    "c-color-surge":         ("0,-1", None, "normal", None),
    "c-color-surge-plus":    ("0,-1", None, "normal", None),

    # ── 유령화 / 버프 카드 ── (모두 self)
    "c-phase-out":           (None,   None, "normal", "self"),
    "c-phase-out-plus":      (None,   None, "slow",   "self"),
    "c-gentle-mend":         (None,   None, "normal", "self"),
    "c-gentle-mend-plus":    (None,   None, "normal", "self"),
    "c-quickstep":           (None,   None, "fast",   "self"),
    "c-quickstep-plus":      (None,   None, "fast",   "self"),
    "c-soft-ward":           (None,   None, "normal", "self"),
    "c-soft-ward-plus":      (None,   None, "normal", "self"),
    "c-prickle-coat":        (None,   None, "normal", "self"),
    "c-prickle-coat-plus":   (None,   None, "normal", "self"),
    "c-clear-focus":         (None,   None, "fast",   "self"),
    "c-clear-focus-plus":    (None,   None, "fast",   "self"),
    "c-steady-heart":        (None,   None, "slow",   "self"),
    "c-steady-heart-plus":   (None,   None, "slow",   "self"),
}


def apply_grid(content, grid_map):
    """카드별로 shape/per_tile_mul/cast_speed/target_mode를 교체."""
    # 카드 섹션 분리 (헤더 앞 주석/공백 포함)
    # 각 섹션을 [card.xxx] 로 시작하는 블록으로 분리
    pattern = re.compile(r'(\[card\.([\w-]+)\][^\[]*)', re.DOTALL)

    def replace_section(m):
        full = m.group(0)
        card_id = m.group(2)
        if card_id not in grid_map:
            return full

        shape, per_tile_mul, cast_speed, target_mode_override = grid_map[card_id]

        lines = full.split('\n')
        new_lines = []
        skip_next = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if skip_next:
                skip_next = False
                continue

            # target_mode 교체
            if stripped.startswith('target_mode') and '=' in stripped and target_mode_override is not None:
                new_lines.append(f'target_mode = {target_mode_override}')
                continue

            # cast_speed 교체
            if stripped.startswith('cast_speed') and '=' in stripped and cast_speed is not None:
                new_lines.append(f'cast_speed = {cast_speed}')
                continue

            # shape 교체 (None=제거도 아니고 유지도 아님: target_mode=self인 카드는 shape 불필요 → 라인 제거)
            if stripped.startswith('shape') and '=' in stripped:
                if shape is None:
                    # target_mode=self로 override 됐으면 shape 제거
                    if target_mode_override == 'self':
                        continue  # 줄 제거
                    else:
                        new_lines.append(line)  # 기존 유지
                else:
                    new_lines.append(f'shape = {shape}')
                continue

            # per_tile_mul 교체
            if stripped.startswith('per_tile_mul') and '=' in stripped:
                if per_tile_mul is None:
                    # target_mode가 self로 override 됐거나 shape이 단일칸이면 제거
                    if target_mode_override == 'self':
                        continue
                    # shape이 단일타일 (쌍 1개)이면 per_tile_mul 불필요
                    elif shape is not None and '|' not in shape:
                        continue
                    else:
                        # per_tile_mul 유지 → 기존값 남김
                        new_lines.append(line)
                else:
                    new_lines.append(f'per_tile_mul = {per_tile_mul}')
                continue

            new_lines.append(line)

        result = '\n'.join(new_lines)

        # shape/cast_speed/target_mode 추가 (기존에 없던 경우)
        # target_mode 추가
        if target_mode_override is not None and not re.search(r'\btarget_mode\s*=', result):
            result = result.rstrip('\n') + f'\ntarget_mode = {target_mode_override}\n'

        # cast_speed 추가
        if cast_speed is not None and not re.search(r'\bcast_speed\s*=', result):
            result = result.rstrip('\n') + f'\ncast_speed = {cast_speed}\n'

        # shape/per_tile_mul 추가 (pattern 카드에만)
        final_tm = target_mode_override
        if final_tm is None:
            # 기존 target_mode 읽기
            tm_m = re.search(r'target_mode\s*=\s*(\S+)', result)
            if tm_m:
                final_tm = tm_m.group(1)

        if final_tm != 'self' and shape is not None:
            if not re.search(r'\bshape\s*=', result):
                result = result.rstrip('\n') + f'\nshape = {shape}\n'
            if per_tile_mul is not None and not re.search(r'\bper_tile_mul\s*=', result):
                result = result.rstrip('\n') + f'\nper_tile_mul = {per_tile_mul}\n'

        return result

    return pattern.sub(replace_section, content)


# ── 메인 실행 ──
INPUT_PATH  = 'public/data/cards/cards-mvr.txt'
OUTPUT_PATH = 'public/data/cards/cards-mvr.txt'

with open(INPUT_PATH, 'r', encoding='utf-8') as f:
    original = f.read()

result = apply_grid(original, GRID_MAP)

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    f.write(result)

# ── 검증: 분포 집계 ──
sections = re.split(r'\n(?=\[card\.)', result)
cards = {}
for sec in sections:
    m = re.match(r'\[card\.([\w-]+)\]', sec)
    if m:
        card_id = m.group(1)
        fields = {}
        for line in sec.split('\n'):
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, _, v = line.partition('=')
                fields[k.strip()] = v.strip()
        cards[card_id] = fields

def classify(tm, sh):
    if tm == 'self':
        return 'self'
    if not sh:
        return '(없음)'
    pairs = sh.split('|')
    if len(pairs) == 1:
        return 'single'
    if sh in ('0,-1|0,-2', '0,-1|0,-2|0,-3'):
        return 'line'
    if '0,-1|0,1|-1,0|1,0' in sh:
        return 'cross'
    if sh in ('-1,-1|0,-1|1,-1', '0,-1|-1,0|1,0', '0,-1|-1,-1|1,-1'):
        return 'horizontal/cone'
    if len(pairs) >= 6:
        return 'aoe'
    return 'other'

from collections import Counter
dist = Counter(classify(f.get('target_mode',''), f.get('shape','')) for f in cards.values())

print("=== 적용 후 shape 분포 ===")
for k, v in sorted(dist.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")
print(f"  총 카드 수: {len(cards)}")

# GRID_MAP에 있는데 파일에 없는 카드 경고
missing = [cid for cid in GRID_MAP if cid not in cards]
if missing:
    print(f"\n[WARNING] GRID_MAP에 있지만 파일에 없는 카드: {missing}")

applied = [cid for cid in GRID_MAP if cid in cards]
print(f"\n총 {len(applied)}개 카드에 격자 적용 완료.")
