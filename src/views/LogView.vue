<script setup lang="ts">
/**
 * 기록(로그) 페이지 — 지난 런들의 요약을 다시 들춰 보는 곳.
 *
 * meta.runHistory(최신순, recordRunSummary가 unshift)를 그대로 목록으로 보여준다.
 *   - 행: 결과 배지(색)·연표명·종족명·N일차·카오스 점수·종료 시각.
 *   - 행 클릭 → 아코디언 상세(종료 위치/행적: 동료·권역 수·전투·보스 / 카드·유물 칩 / 메타 획득 3종 / 카오스 목록).
 * 이름 조회는 dataStore 맵(timelines/races/cards/relics/bosses/npcs/monsters/chaosDefs) + 폴백 id.
 * RunSummary는 휘발 데이터가 정리된 *id 위주 슬림 기록*이라, 표시 시점에 데이터에서 이름을 되살린다.
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useMetaStore } from '@/stores/meta';
import { useDataStore } from '@/stores/data';
import { endReasonLabel, endReasonColor } from '@/systems/labels';
import type { RunSummary } from '@/data/schemas';

const router = useRouter();
const meta = useMetaStore();
const data = useDataStore();

/** 최신순 기록 목록 (이미 unshift로 [0]이 최신). */
const history = computed<RunSummary[]>(() => meta.runHistory ?? []);

/** 펼쳐진 행 인덱스 (한 번에 하나). null=모두 접힘. */
const openIndex = ref<number | null>(null);
function toggle(i: number) {
  openIndex.value = openIndex.value === i ? null : i;
}

// === 이름 조회 (폴백 id) ===
function timelineName(id: string): string {
  return data.timelines.get(id)?.name ?? id;
}
function raceName(id: string): string {
  return data.races.get(id)?.name ?? id;
}
function bossName(id: string): string {
  return data.bosses.get(id)?.name ?? id;
}
function relicName(id: string): string {
  return data.relics.get(id)?.name ?? id;
}
function companionName(c: { id: string; src: 'npc' | 'monster' }): string {
  const found = c.src === 'npc' ? data.npcs.get(c.id)?.name : data.monsters.get(c.id)?.name;
  return found ?? c.id;
}
function chaosName(id: string): string {
  return data.chaosDefs.get(id)?.name ?? id;
}

// === 카드 등급 색 (RunEndView와 동일 팔레트) ===
const rankColors: Record<string, string> = {
  basic: '#a4a4b0',
  common: '#8effb8',
  rare: '#8eedff',
  legendary: '#ffe88e',
};
function cardInfo(entry: { id: string; count: number }): { name: string; rank: string; color: string; count: number } {
  const card = data.cards.get(entry.id);
  const rank = card?.rank ?? 'basic';
  return { name: card?.name ?? entry.id, rank, color: rankColors[rank] ?? '#a4a4b0', count: entry.count };
}

/** 종료 시각 — 'M월 D일 HH:MM' 단순 표기. */
function formatTime(ms: number): string {
  const d = new Date(ms);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}:${min}`;
}

function goMain() {
  router.push('/save-manage');
}

onMounted(() => {
  data.ensureLoaded();
});
</script>

<template>
  <main class="log-view">
    <header class="hdr">
      <button class="back" @click="goMain">← 세이브 관리</button>
      <h1>기록</h1>
      <p class="sub">지난 여정들. 가장 가까운 것이 위에 있어.</p>
      <p class="totals">전생 {{ meta.totalRuns }} · 보스 클리어 {{ meta.totalBossClears }}</p>
    </header>

    <section v-if="history.length > 0" class="list">
      <article
        v-for="(r, i) in history"
        :key="`${r.endedAt}-${i}`"
        class="row"
        :class="{ 'row--open': openIndex === i }"
      >
        <button class="row__head" @click="toggle(i)">
          <span class="badge" :style="{ color: endReasonColor(r.endReason), borderColor: endReasonColor(r.endReason) }">
            {{ endReasonLabel(r.endReason) }}
          </span>
          <span class="row__title">
            {{ timelineName(r.timelineId) }}
            <span class="row__race">· {{ raceName(r.raceId) }}</span>
          </span>
          <span class="row__day">{{ r.days }}일차</span>
          <span v-if="r.chaosScore > 0" class="row__chaos">
            {{ r.chaosScore }}점<span v-if="r.newRecord" class="row__record"> ★</span>
          </span>
          <span class="row__time">{{ formatTime(r.endedAt) }}</span>
        </button>

        <!-- 상세 (아코디언) -->
        <div v-if="openIndex === i" class="detail">
          <!-- 종료 위치 -->
          <p v-if="r.endNodeLabel" class="detail__loc">
            여기서 끝났어. <strong>{{ r.endNodeLabel }}</strong>
            <span v-if="r.endRegionName" class="detail__region">({{ r.endRegionName }})</span>
          </p>

          <!-- 행적 요약 -->
          <div class="stats">
            <span class="stat">방문 {{ r.turns }}곳</span>
            <span class="stat">권역 {{ r.regions }}곳</span>
            <span class="stat">전투 {{ r.combats }}회</span>
            <span class="stat">보스 {{ r.bossIds.length }}</span>
            <span class="stat">골드 {{ r.gold }}</span>
            <span class="stat">HP {{ r.hp }}/{{ r.maxHp }}</span>
          </div>

          <!-- 메타 획득 -->
          <div class="block">
            <span class="block__label">가져간 것</span>
            <div class="chips">
              <span class="chip chip--hyperion">히페리온 +{{ r.hyperionGain }}</span>
              <span class="chip chip--research">해석 +{{ r.researchGain }}</span>
              <span class="chip chip--soul">영혼 +{{ r.soulGain }}</span>
            </div>
          </div>

          <!-- 카오스 -->
          <div v-if="r.chaos.length > 0" class="block">
            <span class="block__label">카오스 {{ r.chaosScore }}점<span v-if="r.newRecord" class="record-tag"> · 최고 기록</span></span>
            <div class="chips">
              <span v-for="c in r.chaos" :key="c.id" class="chip chip--chaos">
                {{ chaosName(c.id) }}<span v-if="c.intensity > 1" class="chip__x"> {{ c.intensity }}</span>
              </span>
            </div>
          </div>

          <!-- 동료 -->
          <div class="block">
            <span class="block__label">더불은 동료</span>
            <div v-if="r.companions.length > 0" class="chips">
              <span v-for="c in r.companions" :key="c.id" class="chip chip--npc">{{ companionName(c) }}</span>
            </div>
            <span v-else class="block__empty">혼자였어.</span>
          </div>

          <!-- 보스 -->
          <div v-if="r.bossIds.length > 0" class="block">
            <span class="block__label">마주한 보스</span>
            <div class="chips">
              <span v-for="id in r.bossIds" :key="id" class="chip chip--boss">{{ bossName(id) }}</span>
            </div>
          </div>

          <!-- 카드 -->
          <div class="block">
            <span class="block__label">모은 카드 ({{ r.cards.length }})</span>
            <div v-if="r.cards.length > 0" class="chips chips--scroll">
              <span
                v-for="(c, ci) in r.cards"
                :key="`${c.id}-${ci}`"
                class="chip chip--card"
                :style="{ color: cardInfo(c).color, borderColor: cardInfo(c).color }"
              >
                {{ cardInfo(c).name }}<span v-if="c.count > 1" class="chip__x"> ×{{ c.count }}</span>
              </span>
            </div>
            <span v-else class="block__empty">가져온 카드는 없었어.</span>
          </div>

          <!-- 유물 -->
          <div class="block">
            <span class="block__label">모은 유물 ({{ r.relicIds.length }})</span>
            <div v-if="r.relicIds.length > 0" class="chips">
              <span v-for="(id, ri) in r.relicIds" :key="`${id}-${ri}`" class="chip chip--relic">{{ relicName(id) }}</span>
            </div>
            <span v-else class="block__empty">가져온 유물은 없었어.</span>
          </div>
        </div>
      </article>
    </section>

    <section v-else class="empty">
      <p>아직 남은 기록이 없어.</p>
      <p class="empty__hint">한 판을 끝내면 그 여정이 여기 쌓여.</p>
    </section>
  </main>
</template>

<style scoped>
.log-view { max-width: 760px; margin: 0 auto; padding: 2rem; min-height: 100vh; min-height: 100dvh; }
.hdr { margin-bottom: 1.4rem; }
.back { background: none; border: 1px solid rgba(255,255,255,0.2); color: #c0b693; padding: 0.4rem 0.8rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; }
.totals { color: #c0b693; margin: 0.2rem 0 0; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
h1 { color: #f6e8b8; margin: 0; }
.sub { color: #888; margin: 0.4rem 0 0; font-size: 0.92rem; }

.list { display: flex; flex-direction: column; gap: 0.5rem; }
.row {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  overflow: hidden;
}
.row--open { border-color: rgba(192,142,255,0.45); background: rgba(192,142,255,0.06); }
.row__head {
  display: flex; align-items: center; gap: 0.7rem; width: 100%;
  background: none; border: none; color: inherit; cursor: pointer; text-align: left;
  padding: 0.8rem 1rem; flex-wrap: wrap;
}
.badge {
  font-size: 0.78rem; font-weight: 700;
  padding: 0.15rem 0.55rem; border-radius: 12px;
  border: 1px solid; background: rgba(0,0,0,0.35);
  white-space: nowrap;
}
.row__title { flex: 1; min-width: 140px; color: #f6e8b8; font-weight: 600; font-size: 0.95rem; }
.row__race { color: #c08eff; font-weight: 400; }
.row__day { color: #b6b6c4; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.row__chaos { color: #ffe88e; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.row__record { color: #ffe88e; }
.row__time { color: #6c6c7c; font-size: 0.8rem; font-variant-numeric: tabular-nums; white-space: nowrap; }

/* === 상세 === */
.detail {
  padding: 0.4rem 1rem 1rem;
  display: flex; flex-direction: column; gap: 0.8rem;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.detail__loc { color: #b6b6c4; margin: 0.6rem 0 0; font-size: 0.9rem; }
.detail__loc strong { color: #f6e8b8; }
.detail__region { color: #888; margin-left: 0.3rem; }

.stats { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.stat {
  font-size: 0.82rem; color: #d6d6e0;
  padding: 0.2rem 0.6rem; border-radius: 6px;
  background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
  font-variant-numeric: tabular-nums;
}

.block { display: flex; flex-direction: column; gap: 0.35rem; }
.block__label { color: #b6b6c4; font-size: 0.82rem; font-weight: 600; }
.block__empty { color: #6c6c7c; font-style: italic; font-size: 0.88rem; }
.record-tag { color: #ffe88e; font-weight: 700; }

.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chips--scroll { max-height: 180px; overflow-y: auto; }
.chip {
  font-size: 0.78rem;
  padding: 0.18rem 0.55rem;
  border-radius: 12px;
  background: rgba(0,0,0,0.4);
  border: 1px solid rgba(255,255,255,0.14);
  color: #d6d6e0;
  white-space: nowrap;
}
.chip__x { margin-left: 0.1rem; opacity: 0.8; font-weight: 700; }
.chip--npc { color: #8effb8; border-color: rgba(142,255,184,0.35); }
.chip--boss { color: #ff8e8e; border-color: rgba(255,142,142,0.4); }
.chip--relic { color: #ffe88e; border-color: rgba(255,232,142,0.4); }
.chip--chaos { color: #ff9e9e; border-color: rgba(255,120,120,0.35); }
.chip--hyperion { color: #ffb86c; border-color: rgba(255,184,108,0.4); }
.chip--research { color: #8eedff; border-color: rgba(142,237,255,0.4); }
.chip--soul { color: #c08eff; border-color: rgba(192,142,255,0.45); }

.empty { text-align: center; padding: 4rem 2rem; color: #6c6c7c; }
.empty__hint { font-size: 0.88rem; margin-top: 0.4rem; color: #555; }

@media (max-width: 640px) { .log-view { padding: 1.2rem; } }
</style>
