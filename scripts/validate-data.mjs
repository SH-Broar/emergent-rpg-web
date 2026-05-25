#!/usr/bin/env node
/**
 * 데이터 검증 CLI — `npm run validate`.
 *
 * public/data 의 INI 데이터를 검사한다(scripts/validate-core.mjs 규칙).
 *   - 에러 발견 시 *비0 종료* → main push 게이트 / RPGEditor 저장 게이트에서 차단.
 *   - 경고는 0 종료 (밸런스 sanity 등 — 차단하지 않음).
 *
 * 출력: 규칙 그룹별 에러/경고 + 요약(파일·라인). 규칙 카탈로그도 함께 표기(에디터 미러 참고).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateData } from './validate-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'public', 'data');

const result = validateData(dataDir);

const c = {
  reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m', green: '\x1b[32m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

function groupByRule(list) {
  const map = new Map();
  for (const d of list) {
    if (!map.has(d.rule)) map.set(d.rule, []);
    map.get(d.rule).push(d);
  }
  return map;
}

console.log(`${c.bold}${c.cyan}데이터 검증${c.reset} — ${result.counts.files} 파일`);
console.log(
  `${c.dim}카드 ${result.counts.cards} · 유물 ${result.counts.relics} · 아이템 ${result.counts.items} · ` +
  `몬스터 ${result.counts.monsters} · 보스 ${result.counts.bosses} · race ${result.counts.races} · ` +
  `NPC ${result.counts.npcs} · 이벤트 ${result.counts.events} · 장비 ${result.counts.equipments} · 단서 ${result.counts.clues}${c.reset}`,
);
console.log('');

// 에러 그룹.
if (result.errors.length > 0) {
  console.log(`${c.bold}${c.red}에러 (${result.errors.length})${c.reset}`);
  for (const [rule, list] of groupByRule(result.errors)) {
    console.log(`  ${c.red}● ${rule}${c.reset} ${c.dim}(${list.length})${c.reset}`);
    for (const d of list) {
      console.log(`    ${c.red}✗${c.reset} ${d.message}`);
      console.log(`      ${c.dim}${d.where ?? ''}${c.reset}`);
    }
  }
  console.log('');
}

// 경고 그룹.
if (result.warnings.length > 0) {
  console.log(`${c.bold}${c.yellow}경고 (${result.warnings.length})${c.reset} ${c.dim}— 종료코드 무관${c.reset}`);
  for (const [rule, list] of groupByRule(result.warnings)) {
    console.log(`  ${c.yellow}● ${rule}${c.reset} ${c.dim}(${list.length})${c.reset}`);
    for (const d of list) {
      console.log(`    ${c.yellow}!${c.reset} ${d.message} ${c.dim}${d.where ?? ''}${c.reset}`);
    }
  }
  console.log('');
}

// 규칙 카탈로그 — 에디터 미러용.
console.log(`${c.dim}검증 규칙(에디터 미러용):${c.reset}`);
for (const [id, desc] of result.ruleCatalog) {
  console.log(`  ${c.dim}- ${id}: ${desc}${c.reset}`);
}
console.log('');

// 요약 + 종료코드.
if (result.errors.length === 0) {
  console.log(`${c.bold}${c.green}PASS${c.reset} — 에러 0${result.warnings.length > 0 ? `, 경고 ${result.warnings.length}` : ''}`);
  process.exit(0);
} else {
  console.log(`${c.bold}${c.red}FAIL${c.reset} — 에러 ${result.errors.length}, 경고 ${result.warnings.length}`);
  process.exit(1);
}
