<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { GESTURES, GLYPHS, type Gesture } from '@/systems/field-types';
import { recognizeGesture, type StrokePoint } from '@/systems/gestures';

const props = withDefaults(defineProps<{ disabled?: boolean; available?: Gesture[]; compact?: boolean }>(), { disabled: false, available: () => [...GESTURES] });
const emit = defineEmits<{ gesture: [gesture: Gesture]; unrecognized: [] }>();
const pad = ref<SVGSVGElement | null>(null);
const points = ref<StrokePoint[]>([]);
const drawing = ref(false);
const result = ref('');
let pointerId: number | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const names: Record<Gesture, string> = { up: '위 선', down: '아래 선', left: '왼쪽 선', right: '오른쪽 선', triangle: '정삼각형', inverted: '역삼각형', circle: '원' };
function point(event: PointerEvent): StrokePoint {
  const box = pad.value!.getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width * 200, y: (event.clientY - box.top) / box.height * 200 };
}
function begin(event: PointerEvent) {
  if (props.disabled || pointerId !== undefined || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  clearTimeout(timer);
  pointerId = event.pointerId;
  points.value = [point(event)]; result.value = ''; drawing.value = true;
  pad.value?.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (event.pointerId !== pointerId || !drawing.value) return;
  event.preventDefault();
  const p = point(event), last = points.value.at(-1)!;
  if (Math.hypot(p.x - last.x, p.y - last.y) >= 1) points.value.push(p);
}
function cancel() { pointerId = undefined; drawing.value = false; points.value = []; result.value = ''; }
function submit(gesture: Gesture) {
  if (props.disabled) return;
  result.value = GLYPHS[gesture];
  emit('gesture', gesture);
}
function end(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  event.preventDefault();
  points.value.push(point(event));
  const gesture = recognizeGesture(points.value);
  pointerId = undefined; drawing.value = false;
  if (pad.value?.hasPointerCapture(event.pointerId)) pad.value.releasePointerCapture(event.pointerId);
  if (!props.disabled && gesture) submit(gesture);
  else if (!props.disabled) { result.value = '·'; emit('unrecognized'); }
  timer = setTimeout(() => { points.value = []; result.value = ''; }, 700);
}
watch(() => props.disabled, value => { if (value) cancel(); });
onBeforeUnmount(() => { clearTimeout(timer); cancel(); });
</script>

<template>
  <div class="gesture-control" :class="{ 'gesture-control--compact': compact, disabled }">
    <svg ref="pad" class="gesture-pad" viewBox="0 0 200 200" role="application" aria-label="도형 입력 패드" :aria-disabled="disabled" @pointerdown="begin" @pointermove="move" @pointerup="end" @pointercancel="cancel" @lostpointercapture="() => { if (drawing) cancel(); }" @contextmenu.prevent>
      <path d="M100 16V184M16 100H184" class="guides" />
      <path d="M18 30V18H30M170 18H182V30M182 170V182H170M30 182H18V170" class="corners" />
      <circle cx="100" cy="100" r="3" class="center" />
      <polyline v-if="points.length" :points="points.map(p => `${p.x},${p.y}`).join(' ')" class="stroke" />
      <text v-if="result" x="100" y="112" text-anchor="middle" class="recognized">{{ result }}</text>
    </svg>
    <div class="glyph-keys" aria-label="도형 선택">
      <button v-for="gesture in GESTURES" :key="gesture" :aria-label="names[gesture]" :disabled="disabled" :class="{ possible: available.includes(gesture) }" @click="submit(gesture)">{{ GLYPHS[gesture] }}</button>
    </div>
  </div>
</template>

<style scoped>
.gesture-control { display: flex; align-items: center; justify-content: center; gap: 14px; min-width: 0; }
.gesture-pad { width: 168px; height: 168px; flex: none; border: 1px solid #59645e; border-radius: 16px; background: radial-gradient(ellipse at 50% 50%, #25332e, #151f1b); touch-action: none; user-select: none; -webkit-user-select: none; overscroll-behavior: contain; cursor: crosshair; }
.guides { stroke: #a0bea013; stroke-dasharray: 2 6; fill: none; }
.corners { fill: none; stroke: #a8b9a15c; stroke-width: 1.5; }
.center { fill: #d3d8b5; opacity: .35; }
.stroke { fill: none; stroke: #eee3b4; stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; filter: drop-shadow(0 0 5px #f5d69677); }
.recognized { fill: #ffe8ae; font: 42px sans-serif; paint-order: stroke; stroke: #1b2822; stroke-width: 5px; }
.glyph-keys { display: grid; grid-template-columns: repeat(2, 44px); gap: 6px; }
.glyph-keys button { height: 38px; border: 1px solid #414d43; border-radius: 8px; color: #738077; background: #19211d; font: 23px system-ui; cursor: pointer; }
.glyph-keys button.possible { color: #f1e1b6; border-color: #82775b; background: #34372c; }
.glyph-keys button:last-child { grid-column: 1 / -1; }
.glyph-keys button:focus-visible { outline: 2px solid #f6dca2; outline-offset: 2px; }
.disabled { opacity: .55; }
.gesture-control--compact .gesture-pad { width: 138px; height: 138px; }
.gesture-control--compact .glyph-keys button { height: 30px; }
@media (max-height: 710px) { .gesture-pad { width: 138px; height: 138px; } .glyph-keys button { height: 30px; } }
</style>
