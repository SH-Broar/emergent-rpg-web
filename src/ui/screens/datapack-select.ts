// datapack-select.ts — 데이터팩 설정 화면
// NPC 데이터팩(world population) + RDC 캐릭터팩(playable unlock) 두 섹션으로 구성.

import type { Screen } from '../screen-manager';
import type { Actor } from '../../models/actor';
import { getDataPackConfig, saveDataPackConfig, DataPackConfig } from '../../data/loader';
import { getAllPackProgress } from '../../data/rdc-packs';
import { setRdcPackActive } from '../../data/global-save';

interface NpcPackInfo {
  key: keyof DataPackConfig;
  label: string;
  description: string;
  charCount: number;
}

const NPC_PACKS: NpcPackInfo[] = [
  { key: 'first',   label: 'Elimes 주민',  description: '엘리메스 지역의 고전 캐릭터들',             charCount: 22 },
  { key: 'extra',   label: '추가 종족',    description: '인어, 고블린, 뱀파이어, 라미아, 요정',       charCount: 5  },
  { key: 'newrace', label: '신규 종족',    description: '아라크네, 슬라임, 리자드, 미노타, 늑대인간, 하프링, 사이렌, 알라우네', charCount: 8 },
];

export function createDataPackScreen(
  onDone: (config: DataPackConfig) => void,
  actors: Actor[] = [],
): Screen {
  const npcConfig = { ...getDataPackConfig() };

  function render(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen datapack-screen';

    // ── NPC 팩 HTML ────────────────────────────────────────────
    let npcHtml = '';
    for (let i = 0; i < NPC_PACKS.length; i++) {
      const pack = NPC_PACKS[i];
      const enabled = npcConfig[pack.key];
      npcHtml += `
        <button class="btn npc-item" data-npc-pack="${pack.key}" style="min-height:50px;border-left:3px solid ${enabled ? 'var(--success)' : 'var(--border)'}">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
            <div>
              <span class="npc-num">${i + 1}</span>
              <span style="font-weight:bold">${pack.label}</span>
              <span style="font-size:11px;color:var(--text-dim);margin-left:4px">(${pack.charCount}명)</span>
            </div>
            <span style="font-size:12px;font-weight:bold;color:${enabled ? 'var(--success)' : 'var(--text-dim)'}">${enabled ? 'ON' : 'OFF'}</span>
          </div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;text-align:left">${pack.description}</div>
        </button>
      `;
    }

    // ── RDC 캐릭터팩 HTML ──────────────────────────────────────
    const packProgressList = getAllPackProgress(actors);
    let rdcHtml = '';
    for (const pp of packProgressList) {
      const barFilled = Math.round((pp.done / pp.total) * 8);
      const bar = '█'.repeat(barFilled) + '░'.repeat(8 - barFilled);
      if (pp.unlocked) {
        rdcHtml += `
          <button class="btn npc-item" data-rdc-pack="${pp.pack.id}"
            style="min-height:50px;border-left:3px solid ${pp.active ? 'var(--success)' : 'var(--border)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <div>
                <span style="font-weight:bold">${pp.pack.label}</span>
                <span style="font-size:11px;color:var(--success);margin-left:6px">✦ 해금</span>
              </div>
              <span style="font-size:12px;font-weight:bold;color:${pp.active ? 'var(--success)' : 'var(--text-dim)'}">
                ${pp.active ? 'ON' : 'OFF'}
              </span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px;text-align:left">
              플레이어블: ${pp.pack.playableNames.join(', ')}
            </div>
          </button>
        `;
      } else {
        rdcHtml += `
          <div class="btn npc-item" style="min-height:50px;border-left:3px solid var(--border);opacity:0.55;cursor:default">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <div>
                <span style="font-weight:bold">${pp.pack.label}</span>
                <span style="font-size:11px;color:var(--text-dim);margin-left:6px">잠금</span>
              </div>
              <span style="font-size:12px;color:var(--text-dim)">${pp.done}/${pp.total}</span>
            </div>
            <div style="font-size:11px;color:var(--text-dim);margin-top:2px">
              <span style="font-family:monospace">${bar}</span>
              &nbsp;히페리온 Lv.5 (${pp.done}/${pp.total})
            </div>
          </div>
        `;
      }
    }

    const totalExtra = NPC_PACKS.reduce((sum, p) => sum + (npcConfig[p.key] ? p.charCount : 0), 0);

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>데이터팩 설정</h2>

      <h3 style="font-size:13px;color:var(--text-dim);margin:12px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px">
        NPC 데이터팩
      </h3>
      <p style="text-align:center;color:var(--text-dim);font-size:12px">
        기본 캐릭터 38명 + 추가 ${totalExtra}명 = 총 ${38 + totalExtra}명
      </p>
      <div class="npc-list" style="margin:8px 0">
        ${npcHtml}
      </div>

      <h3 style="font-size:13px;color:var(--text-dim);margin:16px 0 6px;border-bottom:1px solid var(--border);padding-bottom:4px">
        RDC 캐릭터팩
        <span style="font-size:11px;font-weight:normal;margin-left:6px">해금 팩의 캐릭터를 플레이어로 선택 가능</span>
      </h3>
      <div class="npc-list" style="margin:8px 0">
        ${rdcHtml}
      </div>

      <button class="btn btn-primary" data-confirm style="margin-top:8px">확인 [Enter]</button>
      <p class="hint">1~3 NPC팩 토글 · 해금된 RDC팩 클릭으로 ON/OFF · Enter 확인 · Esc 취소</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      onDone(getDataPackConfig());
    });

    // NPC 팩 토글
    wrap.querySelectorAll<HTMLButtonElement>('[data-npc-pack]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.npcPack as keyof DataPackConfig;
        npcConfig[key] = !npcConfig[key];
        render(el);
      });
    });

    // RDC 팩 활성화 토글 (해금된 것만)
    wrap.querySelectorAll<HTMLButtonElement>('[data-rdc-pack]').forEach(btn => {
      btn.addEventListener('click', () => {
        const packId = btn.dataset.rdcPack!;
        const pp = packProgressList.find(p => p.pack.id === packId);
        if (!pp || !pp.unlocked) return;
        setRdcPackActive(packId, !pp.active);
        render(el);
      });
    });

    wrap.querySelector('[data-confirm]')?.addEventListener('click', () => {
      saveDataPackConfig(npcConfig);
      onDone(npcConfig);
    });

    el.appendChild(wrap);
  }

  return {
    id: 'datapack-select',
    render,
    onKey(key) {
      const container = document.querySelector('.datapack-screen')?.parentElement;
      if (!(container instanceof HTMLElement)) return;

      if (key === 'Escape') {
        onDone(getDataPackConfig());
        return;
      }
      if (key === 'Enter') {
        saveDataPackConfig(npcConfig);
        onDone(npcConfig);
        return;
      }
      if (key === '1') { npcConfig.first    = !npcConfig.first;    render(container); }
      if (key === '2') { npcConfig.extra    = !npcConfig.extra;    render(container); }
      if (key === '3') { npcConfig.newrace  = !npcConfig.newrace;  render(container); }
    },
  };
}
