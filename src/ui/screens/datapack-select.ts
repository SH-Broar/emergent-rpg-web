// datapack-select.ts — 데이터팩 선택 화면

import type { Screen } from '../screen-manager';
import { getDataPackConfig, saveDataPackConfig, DataPackConfig } from '../../data/loader';

interface PackInfo {
  key: keyof DataPackConfig;
  label: string;
  description: string;
  charCount: number;
}

const PACKS: PackInfo[] = [
  { key: 'first', label: 'Elimes 주민', description: '엘리메스 지역의 고전 캐릭터들', charCount: 22 },
  { key: 'extra', label: '추가 종족', description: '인어, 고블린, 뱀파이어, 라미아, 요정', charCount: 5 },
  { key: 'newrace', label: '신규 종족', description: '아라크네, 슬라임, 리자드, 미노타, 늑대인간, 하프링, 사이렌, 알라우네', charCount: 8 },
];

export function createDataPackScreen(
  onDone: (config: DataPackConfig) => void,
): Screen {
  const config = { ...getDataPackConfig() };

  function render(el: HTMLElement) {
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'screen info-screen datapack-screen';

    let packsHtml = '';
    for (let i = 0; i < PACKS.length; i++) {
      const pack = PACKS[i];
      const enabled = config[pack.key];
      packsHtml += `
        <button class="btn npc-item" data-pack="${pack.key}" style="min-height:50px;border-left:3px solid ${enabled ? 'var(--success)' : 'var(--border)'}">
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

    const totalExtra = PACKS.reduce((sum, p) => sum + (config[p.key] ? p.charCount : 0), 0);

    wrap.innerHTML = `
      <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
      <h2>데이터팩 설정</h2>
      <p style="text-align:center;color:var(--text-dim);font-size:12px">
        기본 캐릭터 38명 + 추가 ${totalExtra}명 = 총 ${38 + totalExtra}명
      </p>
      <div class="npc-list" style="margin:12px 0">
        ${packsHtml}
      </div>
      <button class="btn btn-primary" data-confirm style="margin-top:8px">확인 [Enter]</button>
      <p class="hint">1~3 토글, Enter 확인, Esc 취소</p>
    `;

    wrap.querySelector('[data-back]')?.addEventListener('click', () => {
      onDone(getDataPackConfig()); // 변경 취소, 기존 설정 유지
    });

    wrap.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.pack as keyof DataPackConfig;
        config[key] = !config[key];
        render(el);
      });
    });

    wrap.querySelector('[data-confirm]')?.addEventListener('click', () => {
      saveDataPackConfig(config);
      onDone(config);
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
        saveDataPackConfig(config);
        onDone(config);
        return;
      }
      if (key === '1') { config.first = !config.first; render(container); }
      if (key === '2') { config.extra = !config.extra; render(container); }
      if (key === '3') { config.newrace = !config.newrace; render(container); }
    },
  };
}
