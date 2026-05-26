<script setup lang="ts">
/**
 * 그림 프로토타입 모드용 캐릭터 placeholder.
 *
 * - 실제 일러스트가 들어가기 *전*에 자리·움직임·반응을 미리보기로 확인하는 도형.
 * - props: mood(표정·색), side(좌/우 정렬), size(작/중/대).
 * - mood가 바뀌면 도형이 살짝 부풀며 크로스페이드 → 캐릭터가 반응한 느낌.
 * - position: fixed라 호스트 뷰의 레이아웃을 단 1px도 건드리지 않는다.
 * - pointer-events: none이라 클릭·터치·드래그를 절대 가로채지 않는다.
 * - 모든 애니메이션은 CSS keyframe + Vue transition이라 외부 의존성 0.
 *   훗날 실제 그림으로 교체할 땐 이 컴포넌트 내부 <svg>만 <img>나 Spine canvas로
 *   바꾸면 되고, 이 컴포넌트를 사용하는 뷰는 한 줄도 안 바뀐다.
 */
import { computed } from 'vue';

type Mood = 'idle' | 'happy' | 'sad' | 'tense' | 'curious';
type Side = 'left' | 'right';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{ mood?: Mood; side?: Side; size?: Size }>(),
  { mood: 'idle', side: 'right', size: 'md' },
);

interface MoodSpec {
  head: string;
  body: string;
  outline: string;
  eye: 'dot' | 'smile' | 'sad' | 'half' | 'wide';
  mouth: 'dot' | 'smile' | 'sad' | 'flat' | 'open';
}

/** mood별 팔레트 + 표정. 도형만 살짝 다르고 실루엣은 동일 — 실제 그림 자리표시. */
const MOOD_SPECS: Record<Mood, MoodSpec> = {
  idle:    { head: '#c4bcd8', body: '#6b6a78', outline: '#2a2730', eye: 'dot',   mouth: 'dot'   },
  happy:   { head: '#f6d97a', body: '#d49a4a', outline: '#5a3a14', eye: 'smile', mouth: 'smile' },
  sad:     { head: '#8eaedb', body: '#4a6188', outline: '#1c2a44', eye: 'sad',   mouth: 'sad'   },
  tense:   { head: '#ff9978', body: '#b35d4a', outline: '#3a1812', eye: 'half',  mouth: 'flat'  },
  curious: { head: '#a8e8d4', body: '#4a9b88', outline: '#163a30', eye: 'wide',  mouth: 'open'  },
};

const spec = computed<MoodSpec>(() => MOOD_SPECS[props.mood]);
</script>

<template>
  <div
    class="scene-char"
    :class="[`scene-char--${side}`, `scene-char--${size}`]"
    aria-hidden="true"
  >
    <!-- 외곽 호흡(세로 스케일) → 내부 둥실(상하 이동) → 내부 mood 크로스페이드. -->
    <div class="scene-char__breathe">
      <div class="scene-char__bob">
        <transition name="mood-fade" mode="out-in">
          <svg
            :key="mood"
            viewBox="0 0 100 140"
            class="scene-char__svg"
            xmlns="http://www.w3.org/2000/svg"
          >
            <!-- 바닥 그림자 — 둥실거림과 함께 살짝 어긋나면 떠 있는 느낌이 산다. -->
            <ellipse cx="50" cy="132" rx="26" ry="4" fill="rgba(0,0,0,0.32)" />

            <!-- 몸통 (둥근 사각형) -->
            <rect
              x="22" y="64" width="56" height="60" rx="20" ry="22"
              :fill="spec.body"
              :stroke="spec.outline"
              stroke-width="2"
            />

            <!-- 머리 -->
            <circle
              cx="50" cy="40" r="28"
              :fill="spec.head"
              :stroke="spec.outline"
              stroke-width="2"
            />

            <!-- 눈 — mood별 도형. -->
            <g
              :fill="spec.outline"
              :stroke="spec.outline"
              stroke-width="2"
              stroke-linecap="round"
            >
              <template v-if="spec.eye === 'dot'">
                <circle cx="40" cy="40" r="3" />
                <circle cx="60" cy="40" r="3" />
              </template>
              <template v-else-if="spec.eye === 'smile'">
                <path d="M 36 42 Q 40 36 44 42" fill="none" />
                <path d="M 56 42 Q 60 36 64 42" fill="none" />
              </template>
              <template v-else-if="spec.eye === 'sad'">
                <path d="M 36 38 Q 40 44 44 38" fill="none" />
                <path d="M 56 38 Q 60 44 64 38" fill="none" />
              </template>
              <template v-else-if="spec.eye === 'half'">
                <line x1="36" y1="41" x2="44" y2="41" />
                <line x1="56" y1="41" x2="64" y2="41" />
              </template>
              <template v-else>
                <ellipse cx="40" cy="40" rx="4" ry="5" />
                <ellipse cx="60" cy="40" rx="4" ry="5" />
              </template>
            </g>

            <!-- 입 -->
            <g
              :stroke="spec.outline"
              stroke-width="2"
              stroke-linecap="round"
              fill="none"
            >
              <template v-if="spec.mouth === 'dot'">
                <circle :fill="spec.outline" cx="50" cy="54" r="1.6" />
              </template>
              <template v-else-if="spec.mouth === 'smile'">
                <path d="M 44 53 Q 50 58 56 53" />
              </template>
              <template v-else-if="spec.mouth === 'sad'">
                <path d="M 44 56 Q 50 51 56 56" />
              </template>
              <template v-else-if="spec.mouth === 'flat'">
                <line x1="44" y1="55" x2="56" y2="55" />
              </template>
              <template v-else>
                <ellipse :fill="spec.outline" cx="50" cy="55" rx="3" ry="4" />
              </template>
            </g>
          </svg>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  호스트 뷰 레이아웃과 완전히 분리. fixed라 호스트의 position 컨테이너가 필요 없고,
  pointer-events: none이라 카드/버튼/지도를 절대 가리지 않는다.
  z-index는 HUD(--z-fixed)와 모달(--z-modal)·토스트(--z-toast)보다 한참 아래 두어
  씬 콘텐츠 위에만 살짝 떠 있는다.
*/
.scene-char {
  position: fixed;
  bottom: calc(clamp(88px, 14vh, 160px) + env(safe-area-inset-bottom, 0px));
  z-index: 3;
  pointer-events: none;
  animation: scene-char-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: transform, opacity;
}
.scene-char--right { right: clamp(12px, 3vw, 36px); }
.scene-char--left  { left:  clamp(12px, 3vw, 36px); }

.scene-char__svg {
  display: block;
  width: 110px;
  height: auto;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
}

.scene-char--sm .scene-char__svg { width: 80px; }
.scene-char--md .scene-char__svg { width: 110px; }
.scene-char--lg .scene-char__svg { width: 150px; }

@media (max-width: 640px) {
  /* 모바일 — 카드 핸드·하단 드로어·HUD를 회피하기 위해 더 위로, 더 작게. */
  .scene-char { bottom: calc(clamp(96px, 18vh, 160px) + env(safe-area-inset-bottom, 0px)); }
  .scene-char--sm .scene-char__svg { width: 60px; }
  .scene-char--md .scene-char__svg { width: 82px; }
  .scene-char--lg .scene-char__svg { width: 108px; }
}

/* idle 둥실거림 — 위아래로 작게. */
.scene-char__bob {
  animation: scene-char-bob 2.4s ease-in-out infinite;
  transform-origin: center bottom;
}
/* 호흡 — bob과 위상이 어긋난 미세 세로 스케일. */
.scene-char__breathe {
  animation: scene-char-breathe 3.6s ease-in-out infinite;
  transform-origin: center bottom;
}

@keyframes scene-char-enter {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes scene-char-bob {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-4px); }
}
@keyframes scene-char-breathe {
  0%, 100% { transform: scaleY(1); }
  50%      { transform: scaleY(1.02); }
}

/*
  mood 크로스페이드 — out-in 동안 새 SVG가 살짝 부풀며 들어오면 표정이 바뀌는
  순간이 "반응"으로 읽힌다. 별도 펄스 트리거 없이 transition 하나로 해결.
*/
.mood-fade-enter-active {
  transition: opacity 200ms ease, transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}
.mood-fade-leave-active {
  transition: opacity 160ms ease;
}
.mood-fade-enter-from { opacity: 0; transform: scale(1.06); }
.mood-fade-leave-to   { opacity: 0; }

/* 모션 민감 사용자 배려 — 모든 자체 애니메이션 정지. */
@media (prefers-reduced-motion: reduce) {
  .scene-char,
  .scene-char__bob,
  .scene-char__breathe {
    animation: none !important;
  }
  .mood-fade-enter-active,
  .mood-fade-leave-active { transition: none; }
}
</style>
