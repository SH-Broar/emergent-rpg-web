import './styles/global.css';
import { loadAllData } from './data/loader';
import { initAll } from './data/data-init';
import { seedRNG } from './types/rng';
import { ScreenManager } from './ui/screen-manager';
import { InputHandler } from './ui/input-handler';
import { GameSession } from './systems/game-session';
import { processTurn } from './systems/game-loop';
import { createMainMenuScreen } from './ui/screens/main-menu';
import { createCharacterSelectScreen } from './ui/screens/character-select';
import { createGameScreen, createInfoScreen, createMoveScreen } from './ui/screens/game-screen';
import { createDialogueScreen } from './ui/screens/dialogue';
import { createDungeonScreen } from './ui/screens/dungeon';
import { createTradeScreen } from './ui/screens/trade';
import { createQuestBoardScreen } from './ui/screens/quest-board';
import { createBacklogScreen } from './ui/screens/backlog';
import { createLevelUpScreen } from './ui/screens/level-up';
import { createBirthScreen, createCustomCharScreen } from './ui/screens/character-creation';
import { createActivityScreen } from './ui/screens/activity';
import { createGiftScreen } from './ui/screens/gift';
import { createEatScreen } from './ui/screens/eat';
import { createEncyclopediaScreen } from './ui/screens/encyclopedia';
import { createHomeScreen } from './ui/screens/home';
import { createHyperionScreen } from './ui/screens/hyperion';
import { createTitlesScreen } from './ui/screens/titles';
import { createPartyScreen } from './ui/screens/party';
import { createSaveLoadScreen, saveToSlot, loadFromSlot } from './ui/screens/save-load';
import { createWorldMapScreen } from './ui/screens/world-map';
import { fastForwardWorld } from './systems/world-simulation';
import { seasonName } from './types/enums';

const app = document.getElementById('app')!;

async function boot() {
  app.innerHTML = '<div class="screen menu-screen"><p>데이터 로딩 중...</p></div>';
  seedRNG(Date.now());

  const data = await loadAllData();
  const initResult = initAll(data);

  const session = new GameSession();
  session.actors = initResult.actors;
  session.world = initResult.world;
  session.events = initResult.events;
  session.dungeonSystem = initResult.dungeonSystem;
  session.activitySystem = initResult.activitySystem;
  session.world.seasonSchedule.init(1);
  session.world.updateWeatherAndTemp();

  const sm = new ScreenManager(app);
  const input = new InputHandler(sm);

  // 오토세이브 존재 여부 확인
  const hasAutosave = localStorage.getItem('emergent_save_0') !== null;

  // --- 주민 수 지정 ---
  function showPopulationSelect(afterDone: () => void) {
    sm.push({
      id: 'population',
      render(el) {
        const totalNpcs = session.actors.filter(a => !a.playable).length;
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center">
            <h2>마을 인구 밀도</h2>
            <p style="text-align:center;color:var(--text-dim)">NPC가 얼마나 활동할지 결정합니다.</p>
            <div class="menu-buttons" style="margin-top:12px">
              <button class="btn" data-pop="low">한적함 — NPC ${Math.floor(totalNpcs * 0.3)}명 활성</button>
              <button class="btn btn-primary" data-pop="normal">보통 — NPC ${Math.floor(totalNpcs * 0.6)}명 활성</button>
              <button class="btn" data-pop="high">붐빔 — NPC ${totalNpcs}명 전부 활성</button>
            </div>
            <p class="hint">1=한적함, 2=보통, 3=붐빔</p>
          </div>`;
        el.querySelectorAll<HTMLButtonElement>('[data-pop]').forEach(btn => {
          btn.addEventListener('click', () => {
            const pop = btn.dataset.pop!;
            const ratio = pop === 'low' ? 0.3 : pop === 'normal' ? 0.6 : 1.0;
            // 비플레이어블 NPC 중 일부만 활성 위치에 배치
            const npcs = session.actors.filter(a => !a.playable);
            const activeCount = Math.floor(npcs.length * ratio);
            npcs.forEach((npc, i) => {
              if (i >= activeCount) {
                npc.stationary = true; // 비활성 NPC는 고정
              }
            });
            sm.pop();
            afterDone();
          });
        });
      },
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === '2' || key === '3') {
          const btn = c.querySelector(`[data-pop="${key === '1' ? 'low' : key === '2' ? 'normal' : 'high'}"]`) as HTMLButtonElement | null;
          btn?.click();
        }
      },
    });
  }

  // --- 배경 스토리 화면 → 게임 시작 ---
  function showBackgroundThenGame() {
    const p = session.player;
    const bg = p.background;
    if (bg) {
      const lines = bg.split('|').map((l: string) => l.trim()).filter((l: string) => l);
      sm.push({
        id: 'background',
        render(el) {
          el.innerHTML = `
            <div class="screen info-screen" style="justify-content:center;text-align:center">
              <h2>${p.name}</h2>
              <div class="text-display" style="text-align:left;line-height:1.8">
                ${lines.map((l: string) => `<p>${l}</p>`).join('')}
              </div>
              <button class="btn btn-primary" data-start>시작하기 [Enter]</button>
              <p class="hint">Enter 또는 터치로 계속</p>
            </div>`;
          el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); enterGame(); });
        },
        onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); enterGame(); } },
      });
    } else {
      enterGame();
    }
  }

  function autosave() {
    if (session.isValid) saveToSlot(0, session);
  }

  function enterGame() {
    session.knowledge.addKnownName(session.player.name);
    session.knowledge.trackVisit(session.player.currentLocation);
    // Give starter items
    const starterItems = ['wheat_bread', 'wheat_bread', 'wheat_bread', 'fresh_water', 'fresh_water', 'common_herb'];
    for (const id of starterItems) {
      session.player.addItemById(id, 1);
      session.knowledge.discoverItem(id);
    }
    session.backlog.add(session.gameTime, `${session.player.name}의 이야기가 시작된다.`, '시스템');
    autosave();
    showGame();
  }

  // --- 게임 메인 화면 ---
  function showGame() {
    sm.replace(createGameScreen(session, (target) => {
      switch (target) {
        case 'move':
          sm.push(createMoveScreen(session, () => sm.pop()));
          break;
        case 'talk':
          sm.push(createDialogueScreen(session, {
            onTalk() { /* backlog에 이미 기록됨 */ },
            onRecruit(npcName) {
              session.knowledge.recruitCompanion(npcName);
              session.backlog.add(session.gameTime, `${npcName}이(가) 동료가 되었다!`, '행동');
              sm.pop();
            },
            onInfo() {
              sm.push(createInfoScreen(session, 'info_status', () => sm.pop()));
            },
            onBack() { sm.pop(); },
          }));
          break;
        case 'eat':
          sm.push(createEatScreen(session, (_statusMsg) => { sm.pop(); }));
          break;
        case 'trade':
          sm.push(createTradeScreen(session, () => { session.gameTime.advance(15); sm.pop(); }));
          break;
        case 'dungeon':
          sm.push(createDungeonScreen(session, () => sm.pop()));
          break;
        case 'quest':
          sm.push(createQuestBoardScreen(session, () => sm.pop()));
          break;
        case 'activity':
          sm.push(createActivityScreen(session, () => sm.pop()));
          break;
        case 'gift':
          sm.push(createGiftScreen(session, () => sm.pop()));
          break;
        case 'home':
          sm.push(createHomeScreen(session, () => sm.pop()));
          break;
        case 'memory_spring':
          // 기억의 샘 — 간소화 버전
          sm.push(createInfoScreen(session, 'info_status', () => sm.pop()));
          break;
        case 'info_backlog':
          sm.push(createBacklogScreen(session, () => sm.pop()));
          break;
        case 'info_hyperion':
          sm.push(createHyperionScreen(session, () => sm.pop()));
          break;
        case 'info_party':
          sm.push(createPartyScreen(session, () => sm.pop()));
          break;
        case 'info_titles':
          sm.push(createTitlesScreen(session, () => sm.pop()));
          break;
        case 'info_map':
          sm.push(createWorldMapScreen(session, () => sm.pop()));
          break;
        case 'info_encyclopedia':
          sm.push(createEncyclopediaScreen(session, () => sm.pop()));
          break;
        case 'save':
          sm.push(createSaveLoadScreen(session, true, () => sm.pop()));
          break;
        case 'level_up':
          sm.push(createLevelUpScreen(session, () => sm.pop()));
          break;
        default:
          if (target.startsWith('info_')) {
            sm.push(createInfoScreen(session, target, () => sm.pop()));
          }
          break;
      }
    }, autosave));
    input.setIdleCallback(() => {
      processTurn(session, 'idle');
      autosave();
      sm.render();
    }, 10000);
  }

  // --- 캐릭터 선택 ---
  function showCharSelect() {
    sm.replace(createCharacterSelectScreen(
      session.actors,
      (idx) => { session.playerIdx = idx; showPopulationSelect(() => showBackgroundThenGame()); },
      () => {
        // 탄생
        sm.push(createBirthScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => {
        // 커스텀
        sm.push(createCustomCharScreen(session.actors, (idx) => {
          session.playerIdx = idx;
          enterGame();
        }, () => sm.pop()));
      },
      () => showMainMenu(),
    ));
  }

  // --- 로어 화면 (트리 구조) ---
  function showLore() {
    const loreData = data.lore;
    let openIdx = -1; // 열린 섹션 인덱스 (-1 = 목차)

    function renderLore(el: HTMLElement) {
      if (openIdx === -1) {
        // 목차 (섹션 제목 목록)
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
            <h2>로어</h2>
            <div class="npc-list">
              ${loreData.map((s, i) => `
                <button class="btn npc-item" data-lore="${i}">
                  <span class="npc-num">${i + 1}</span>
                  <span class="npc-name">${s.name}</span>
                </button>
              `).join('')}
            </div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => sm.pop());
        el.querySelectorAll<HTMLButtonElement>('[data-lore]').forEach(btn => {
          btn.addEventListener('click', () => { openIdx = parseInt(btn.dataset.lore!, 10); renderLore(el); });
        });
      } else {
        // 개별 섹션 내용
        const s = loreData[openIdx];
        const content = s.rawLines.length > 0
          ? s.rawLines.map((l: string) => `<p>${l}</p>`).join('')
          : [...s.values.values()].map(v => `<p>${v.replace(/\|/g, '<br>')}</p>`).join('');
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 목차로 [Esc]</button>
            <h2>${s.name}</h2>
            <div class="text-display">${content}</div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => { openIdx = -1; renderLore(el); });
      }
    }

    sm.push({
      id: 'lore',
      render: renderLore,
      onKey(key) {
        if (key === 'Escape') {
          if (openIdx === -1) sm.pop();
          else { openIdx = -1; const c = document.querySelector('.info-screen')?.parentElement; if (c instanceof HTMLElement) renderLore(c); }
        }
        if (openIdx === -1 && /^[1-9]$/.test(key)) {
          const i = parseInt(key, 10) - 1;
          if (i < loreData.length) { openIdx = i; const c = document.querySelector('.info-screen')?.parentElement; if (c instanceof HTMLElement) renderLore(c); }
        }
      },
    });
  }

  // --- 튜토리얼 화면 ---
  function showTutorial() {
    sm.push({
      id: 'tutorial',
      render(el) {
        el.innerHTML = `
          <div class="screen info-screen">
            <button class="btn back-btn" data-back>← 뒤로 [Esc]</button>
            <h2>튜토리얼</h2>
            <div class="text-display">
              <p><b>기본 조작</b></p>
              <p>• 1~9, 0, a, g 키 또는 버튼 터치로 행동 선택</p>
              <p>• i=상태, c=컬러, r=관계, w=월드, b=백로그</p>
              <p>• S=세이브/로드, Esc=뒤로</p>
              <p></p>
              <p><b>게임 흐름</b></p>
              <p>• 행동마다 시간이 경과하고 기력이 소모됩니다</p>
              <p>• NPC와 대화하여 관계를 쌓으세요</p>
              <p>• 던전에서 전투하고 자원을 모으세요</p>
              <p>• 10초간 입력이 없으면 자동으로 대기합니다</p>
              <p></p>
              <p><b>컬러 시스템</b></p>
              <p>• 8속성 (불/물/전기/철/흙/바람/빛/어둠)이 캐릭터 성향을 결정</p>
              <p>• 이벤트와 행동에 따라 컬러가 변화합니다</p>
              <p></p>
              <p><b>히페리온</b></p>
              <p>• 5단계 성장 시스템, NPC별 조건 달성으로 레벨업</p>
            </div>
          </div>`;
        el.querySelector('[data-back]')?.addEventListener('click', () => sm.pop());
      },
      onKey(key) { if (key === 'Escape') sm.pop(); },
    });
  }

  // --- 코어 매트릭스 진단 ---
  function showCoreMatrix() {
    const questions = [
      { text: '낯선 사람이 도움을 구한다', a: '즉시 돕는다', b: '상황을 먼저 파악한다', elements: [0, 6] as const, dir: [0.05, 0.03] },
      { text: '중요한 약속과 하고 싶은 일이 겹쳤다', a: '약속을 지킨다', b: '하고 싶은 일을 한다', elements: [4, 5] as const, dir: [0.05, -0.03] },
      { text: '팀에서 의견이 갈릴 때', a: '다수 의견을 따른다', b: '내 의견을 끝까지 주장한다', elements: [1, 3] as const, dir: [0.04, 0.04] },
      { text: '실패했을 때', a: '원인을 분석한다', b: '빠르게 다음으로 넘어간다', elements: [2, 5] as const, dir: [0.04, 0.03] },
      { text: '비밀을 알게 되었을 때', a: '신뢰할 수 있는 사람에게 말한다', b: '혼자만 알고 있는다', elements: [6, 7] as const, dir: [-0.03, 0.05] },
      { text: '위험한 상황에서', a: '정면 돌파한다', b: '우회로를 찾는다', elements: [0, 7] as const, dir: [0.05, 0.03] },
      { text: '누군가 부당한 대우를 받고 있다', a: '나서서 항의한다', b: '조용히 도울 방법을 찾는다', elements: [6, 1] as const, dir: [0.04, 0.04] },
      { text: '여유 시간이 생겼을 때', a: '사람들과 어울린다', b: '혼자만의 시간을 보낸다', elements: [0, 5] as const, dir: [0.04, -0.03] },
    ];
    let qIdx = 0;
    const colorResult = new Array(8).fill(0.5);

    function renderQ(el: HTMLElement) {
      if (qIdx >= questions.length) {
        // 완료 — 결과 표시
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center;text-align:center">
            <h2>진단 완료</h2>
            <div class="hud-colors" style="justify-content:center;margin:12px 0">
              ${colorResult.map((v, i) => `<span class="hud-color-pip"><span class="hud-color-dot" style="background:var(--el-${i})"></span>${Math.round(v * 100)}</span>`).join('')}
            </div>
            <p>이 결과는 탄생 시 캐릭터에 적용됩니다.</p>
            <button class="btn btn-primary" data-done>확인 [Enter]</button>
          </div>`;
        el.querySelector('[data-done]')?.addEventListener('click', () => sm.pop());
        return;
      }
      const q = questions[qIdx];
      el.innerHTML = `
        <div class="screen info-screen" style="justify-content:center">
          <h2>코어 매트릭스 진단 (${qIdx + 1}/${questions.length})</h2>
          <p style="font-size:16px;text-align:center;margin:16px 0">${q.text}</p>
          <div class="menu-buttons" style="width:100%">
            <button class="btn" data-choice="a">A. ${q.a}</button>
            <button class="btn" data-choice="b">B. ${q.b}</button>
          </div>
          <button class="btn back-btn" data-cancel style="margin-top:12px">취소하고 나가기 [Esc]</button>
          <p class="hint">1=A, 2=B, Esc=취소</p>
        </div>`;
      el.querySelector('[data-choice="a"]')?.addEventListener('click', () => { applyChoice('a'); renderQ(el); });
      el.querySelector('[data-choice="b"]')?.addEventListener('click', () => { applyChoice('b'); renderQ(el); });
      el.querySelector('[data-cancel]')?.addEventListener('click', () => sm.pop());
    }

    function applyChoice(choice: 'a' | 'b') {
      const q = questions[qIdx];
      const sign = choice === 'a' ? 1 : -1;
      colorResult[q.elements[0]] = Math.max(0, Math.min(1, colorResult[q.elements[0]] + q.dir[0] * sign));
      colorResult[q.elements[1]] = Math.max(0, Math.min(1, colorResult[q.elements[1]] + q.dir[1] * sign));
      qIdx++;
    }

    sm.push({
      id: 'corematrix',
      render: renderQ,
      onKey(key) {
        const c = document.querySelector('.info-screen')?.parentElement;
        if (!(c instanceof HTMLElement)) return;
        if (key === '1' || key === 'a') { applyChoice('a'); renderQ(c); }
        else if (key === '2' || key === 'b') { applyChoice('b'); renderQ(c); }
        else if (key === 'Enter' && qIdx >= questions.length) sm.pop();
        else if (key === 'Escape') sm.pop();
      },
    });
  }

  // --- 천도제 (세계 전환) ---
  function showTransition() {
    sm.push({
      id: 'transition',
      render(el) {
        const customCount = session.actors.filter(a => a.isCustom).length;
        el.innerHTML = `
          <div class="screen info-screen" style="justify-content:center">
            <h2>천도제 — 세계 전환</h2>
            <div class="text-display" style="text-align:center">
              <p>세계를 새로 시작합니다.</p>
              <p>모든 NPC의 상태, 관계, 히페리온 진행도가 초기화됩니다.</p>
              <p>수동 세이브 데이터는 유지됩니다.</p>
              <p style="color:var(--warning)">커스텀 캐릭터 ${customCount}명은 보존됩니다.</p>
            </div>
            <div class="menu-buttons" style="margin-top:16px;width:100%">
              <button class="btn btn-primary" data-confirm>전환 실행</button>
              <button class="btn" data-cancel>취소 [Esc]</button>
            </div>
          </div>`;
        el.querySelector('[data-cancel]')?.addEventListener('click', () => sm.pop());
        el.querySelector('[data-confirm]')?.addEventListener('click', () => {
          // 커스텀 캐릭터 보존, 나머지 재초기화
          const customActors = session.actors.filter(a => a.isCustom);
          const freshResult = initAll(data);
          session.actors = freshResult.actors;
          session.world = freshResult.world;
          session.events = freshResult.events;
          session.dungeonSystem = freshResult.dungeonSystem;
          session.activitySystem = freshResult.activitySystem;
          session.gameTime.day = 1;
          session.gameTime.hour = 6;
          session.gameTime.minute = 0;
          session.world.seasonSchedule.init(1);
          session.world.updateWeatherAndTemp();
          session.backlog = new (session.backlog.constructor as new () => typeof session.backlog)();
          session.knowledge = new (session.knowledge.constructor as new () => typeof session.knowledge)();
          // 커스텀 캐릭터 복원
          for (const c of customActors) {
            c.playable = true;
            session.actors.push(c);
          }
          // 오토세이브 삭제
          localStorage.removeItem('emergent_save_0');
          sm.pop();
          showCharSelect();
        });
      },
      onKey(key) { if (key === 'Escape') sm.pop(); },
    });
  }

  // --- 메인 메뉴 ---
  function showMainMenu() {
    const menu = createMainMenuScreen(hasAutosave, (choice) => {
      switch (choice) {
        case 'new': showCharSelect(); break;
        case 'connect': {
          if (!loadFromSlot(0, session)) { showCharSelect(); break; }
          if (!session.isValid) { showCharSelect(); break; }

          // 경과 시간 계산 (세이브 시각 → 현재)
          const raw = localStorage.getItem('emergent_save_0');
          let elapsedMinutes = 0;
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              const savedAt = parsed?.meta?.savedAt as string | undefined;
              if (savedAt) {
                const savedDate = new Date(savedAt);
                if (!isNaN(savedDate.getTime())) {
                  elapsedMinutes = Math.floor((Date.now() - savedDate.getTime()) / 60000);
                }
              }
            } catch { /* ignore */ }
          }

          // 최소 5분 경과 시 오프라인 시뮬레이션 실행
          if (elapsedMinutes >= 5) {
            const prevDay = session.gameTime.day;
            const prevLevel = session.player.base.level;
            const prevSeason = session.world.getCurrentSeason();

            fastForwardWorld(
              elapsedMinutes, session.gameTime, session.world,
              session.events, session.actors, session.social,
              session.backlog, session.knowledge,
            );

            const daysPassed = session.gameTime.day - prevDay;
            const levelsGained = session.player.base.level - prevLevel;
            const newSeason = session.world.getCurrentSeason();
            const seasonChanged = newSeason !== prevSeason;

            // 요약 화면 표시
            sm.push({
              id: 'offline-summary',
              render(el) {
                let summary = '';
                summary += `<p>부재 시간: 약 ${elapsedMinutes >= 60 ? Math.floor(elapsedMinutes / 60) + '시간 ' + (elapsedMinutes % 60) + '분' : elapsedMinutes + '분'}</p>`;
                if (daysPassed > 0) summary += `<p>${daysPassed}일이 흘렀다.</p>`;
                if (levelsGained > 0) summary += `<p>레벨이 ${levelsGained} 올랐다! (Lv.${session.player.base.level})</p>`;
                if (seasonChanged) summary += `<p>계절이 ${seasonName(newSeason)}(으)로 바뀌었다.</p>`;
                summary += `<p>현재: ${session.gameTime.toString()}</p>`;
                summary += `<p>HP: ${Math.round(session.player.base.hp)}/${Math.round(session.player.getEffectiveMaxHp())} · 기력: ${Math.round(session.player.base.vigor)}/${Math.round(session.player.getEffectiveMaxVigor())}</p>`;

                el.innerHTML = `
                  <div class="screen info-screen" style="justify-content:center;text-align:center">
                    <h2>재접속</h2>
                    <div class="text-display" style="line-height:1.8">${summary}</div>
                    <button class="btn btn-primary" data-start>계속하기 [Enter]</button>
                  </div>`;
                el.querySelector('[data-start]')?.addEventListener('click', () => { sm.pop(); autosave(); showGame(); });
              },
              onKey(key) { if (key === 'Enter' || key === ' ') { sm.pop(); autosave(); showGame(); } },
            });
          } else {
            showGame();
          }
          break;
        }
        case 'lore': showLore(); break;
        case 'tutorial': showTutorial(); break;
        case 'corematrix':
          showCoreMatrix();
          break;
        case 'transition': showTransition(); break;
      }
    });
    sm.replace(menu);
  }

  showMainMenu();
}

boot().catch(err => {
  app.innerHTML = `<div class="screen menu-screen"><p style="color:#e94560">에러: ${err}</p></div>`;
});
