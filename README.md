# emergent-rpg-web (RDC-Roguelike)

**시간의 신 모노가 보내는 전생자**가 되어 RDC 세계관의 시간대를 누비는 **Slay the Spire식 카드 로그라이크**.

## 게임 정체성

- 외부 프레임: **모노 (시간의 신) + 임페리시아 (도우미) + 전생자 (플레이어)**
- 한 런: 연표 선택 → 캐릭터 선택 → 거미줄 노드 맵 → 시간 만료 → 보스 → 메타 진행
- 덱: 10장 → 20장 → 30장 점진 확장, 교체식 정제
- 카드 4등급: 기본 / 일반 / 희귀 / 전설
- 메타 진행: 듀얼 게이지 (히페리온 ×2 + 해석 ×2 + 종합) → 모노의 세계 간섭 강화

## 기술 스택

- **Vite 8** + **Vue 3.5** + **TypeScript 6**
- **Pinia 3** (상태 관리)
- **Vue Router 4** (메인 씬 ↔ 게임 씬 분리)
- **@vueuse/core**, **@vueuse/motion** (반응성·애니메이션)

## 디렉토리 구조 (계획)

```
src/
  frame/       # 외부 프레임 (Mono, Imperisia, Transcendent)
  data/        # 데이터 정의 + INI 파서 + 스키마
  models/      # 핵심 모델 (Timeline, Card, Deck, Event, Relic, Boss, ...)
  systems/     # 게임 시스템 (combat, map, deck, npc-relation, ...)
  stores/      # Pinia 스토어 (run, meta, codex, ui)
  router/      # Vue Router 설정
  views/       # 화면 컴포넌트 (Main / Research / Bug / Game / Combat / ...)
  components/  # 재사용 UI
public/
  data/        # INI .txt 데이터
tools/
  etl/         # legacy → new 변환 스크립트
```

## 명령

```bash
npm install      # 의존성 설치
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드 (vue-tsc + vite build)
npm run preview  # 빌드 결과 미리보기
```

## 브랜치

- **rdc-roguelike-main**: 현재 main. 처음부터 재구축.
- **legacy-emergent**: 이전 패러다임 (NPC 자율 시뮬 + 슬로우 라이프 RPG) 보존. 데이터 ETL 참조용.

## 관련 문서

- **[docs/HARNESS.md](./docs/HARNESS.md)** — 게임 데이터 작성 가이드 (12개 단위 모두 필드·예시·팁)
- `.omc/specs/deep-interview-rdc-roguelike-pivot.md` — 게임 정체성 spec (Ambiguity 5%)
- `.omc/plans/phase-0-etl-plan.md` — 브랜치 분리 + 데이터 ETL 계획서
