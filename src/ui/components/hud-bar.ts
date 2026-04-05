// hud-bar.ts — 상단 HUD 바 (HP, 기력, 시간, 날씨, 장소)

export interface HudBarData {
  hp: number;
  maxHp: number;
  vigor: number;
  gold: number;
  time: string;
  weather: string;
  season: string;
  location: string;
}

export function createHudBar(data: HudBarData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'hud-bar-component';

  const hpPct = data.maxHp > 0 ? Math.round((data.hp / data.maxHp) * 100) : 0;

  el.innerHTML = `
    <div class="hud-top-row">
      <span class="hud-location">${data.location}</span>
      <span class="hud-time">${data.time}</span>
      <span class="hud-weather">${data.weather} / ${data.season}</span>
    </div>
    <div class="hud-bottom-row">
      <div class="hud-hp-mini">
        <span class="stat-label">HP</span>
        <div class="bar"><div class="bar-fill hp-bar" style="width:${hpPct}%"></div></div>
        <span class="stat-val">${Math.round(data.hp)}/${Math.round(data.maxHp)}</span>
      </div>
      <span class="hud-gold">${data.gold}G</span>
    </div>
  `;
  return el;
}
