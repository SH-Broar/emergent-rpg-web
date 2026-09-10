<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { GLYPHS, type Gesture } from '@/systems/field-types';
import { recognizeGestureMatch, type StrokePoint } from '@/systems/gestures';
import { gestureDefinition } from '@/systems/gesture-catalog';

const props = withDefaults(defineProps<{ disabled?: boolean; compact?: boolean; guide?: string }>(), { disabled: false });
const emit = defineEmits<{ gesture: [gesture: Gesture, quality: number, drawn: boolean]; unrecognized: []; drawing: [active: boolean] }>();
const pad = ref<SVGSVGElement | null>(null);
const points = ref<StrokePoint[]>([]);
const drawing = ref(false);
const result = ref('');
const candidate = ref('');
const guidePoints = computed(() => gestureDefinition(props.guide ?? '')?.points.map(p=>`${28+p.x*144},${28+p.y*144}`).join(' '));
let pointerId: number | undefined;
let previewAt = 0;
let beganAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function recognize() { const scale=(pad.value?.getBoundingClientRect().width ?? 168)/200; return recognizeGestureMatch(points.value.map(p=>({x:p.x*scale,y:p.y*scale}))); }
function point(event: PointerEvent): StrokePoint {
  const box = pad.value!.getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width * 200, y: (event.clientY - box.top) / box.height * 200 };
}
function begin(event: PointerEvent) {
  if (props.disabled || pointerId !== undefined || !event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  clearTimeout(timer);
  pointerId = event.pointerId;
  beganAt = event.timeStamp;
  points.value = [point(event)]; result.value = ''; candidate.value = ''; drawing.value = true; emit('drawing',true);
  pad.value?.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (event.pointerId !== pointerId || !drawing.value) return;
  event.preventDefault();
  const samples = event.getCoalescedEvents?.() ?? [];
  for(const sample of samples.length?samples:[event]) {
    const p=point(sample),last=points.value.at(-1)!;
    if(Math.hypot(p.x-last.x,p.y-last.y)>=.5) points.value.push(p);
  }
  if(event.timeStamp-previewAt>80) { previewAt=event.timeStamp; candidate.value=GLYPHS[recognize()?.gesture ?? '']??''; }
}
function cancel() { pointerId = undefined; drawing.value = false; points.value = []; result.value = ''; candidate.value=''; emit('drawing',false); }
function submit(gesture: Gesture, quality=1, drawn=false) {
  if (props.disabled) return;
  if(gestureDefinition(gesture)?.drawOnly&&!drawn) return;
  result.value = GLYPHS[gesture];
  emit('gesture', gesture, quality, drawn);
}
function end(event: PointerEvent) {
  if (event.pointerId !== pointerId) return;
  event.preventDefault();
  points.value.push(point(event));
  const recognized = recognize();
  const match = recognized?.gesture==='tap'&&event.timeStamp-beganAt>550 ? undefined : recognized;
  pointerId = undefined; drawing.value = false; candidate.value=''; emit('drawing',false);
  if (pad.value?.hasPointerCapture(event.pointerId)) pad.value.releasePointerCapture(event.pointerId);
  if (!props.disabled && match) submit(match.gesture,match.quality,true);
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
      <polyline v-if="guidePoints" :points="guidePoints" fill="none" stroke="#d3c899" stroke-width="2" stroke-dasharray="4 5" opacity=".35"/>
      <polyline v-if="points.length" :points="points.map(p => `${p.x},${p.y}`).join(' ')" class="stroke" />
      <text v-if="result || candidate" x="100" y="112" text-anchor="middle" class="recognized">{{ result || candidate }}</text>
    </svg>
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
.disabled { opacity: .55; }
.gesture-control--compact .gesture-pad { width: 138px; height: 138px; }
@media (max-height: 710px) { .gesture-pad { width: 138px; height: 138px; } }
</style>
