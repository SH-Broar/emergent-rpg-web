export type TimeEndingId = 'stillness' | 'severance' | 'together';
export interface TimeEndingPage { speaker?: string; text: string }
export interface TimeEndingWitness { state: 'present' | 'absent' | 'recovering' | 'dead' | 'unknown'; joined: boolean }
export interface TimeEndingWitnesses { dun: TimeEndingWitness; tifre: TimeEndingWitness }
interface TimeEnding { title: string; pages: TimeEndingPage[] }

/** Neutral editions also serve old saves that never recorded who was at the anchor. */
export const TIME_ENDINGS: Record<TimeEndingId, TimeEnding> = {
  stillness: {
    title: '끝나지 않는 저녁',
    pages: [
      { text: '당신은 닻을 받쳐 무너지는 것을 막았다. 멎었던 바람이 불었고, 아이는 그 바람을 따라 한 걸음 걸었다.' },
      { speaker: '시간의 정령', text: '……저녁은 아직이야?' },
      { text: '일루네온의 종은 다시 울렸다. 하지만 붙잡힌 한 시간은 돌아오지 않았다. 그 안에 남은 사람들은 문밖의 목소리를 들을 수 없었다.' },
      { text: '문고리는 움직이지 않았다. 무너지는 것을 막는 일과, 갇힌 사람을 꺼내는 일은 달랐다.' },
      { text: '닻이 식어 가는 동안, 문 안쪽에서는 같은 저녁이 되풀이됐다.' },
    ],
  },
  severance: {
    title: '돌아오지 않는 아침',
    pages: [
      { text: '당신은 닻의 연결을 끊었다. 밀려 있던 시간이 한꺼번에 흘렀다. 아이가 귀를 막았다. 누군가 종을 너무 오래 울리고 있었다.' },
      { text: '길이 열렸다. 당신은 앞으로 걸었다. 뒤에서 불리던 이름 하나가 도중에 끊겼다.' },
      { text: '다음 날, 식탁에는 식은 차가 두 잔 놓여 있었다. 사람들은 빈 의자의 주인을 기억했지만, 그와 함께 보낸 마지막 한 시간은 누구에게도 남지 않았다.' },
      { speaker: '시간의 정령', text: '아까 있던 사람은?' },
      { text: '당신은 대답하지 못했다. 길은 열렸고, 돌아갈 수 있는 길은 사라졌다.' },
    ],
  },
  together: {
    title: '서로 다른 내일',
    pages: [
      { text: '당신은 닻을 받친 채 기록을 펼쳤다. 남아 있는 무게를 확인하고, 그만큼의 연결만 풀었다. 어느 매듭에서도 그 순서를 바꾸지 않았다.' },
      { text: '닫혀 있던 문에서 발소리가 났다. 누군가는 오래 기다렸고, 누군가에게는 잠깐이었다. 어느 쪽의 기록도 지우지 않았다.' },
      { speaker: '시간의 정령', text: '나도 가도 돼?' },
      { text: '당신이 손을 내밀자, 아이가 잡았다. 문밖의 바람은 차가웠다.' },
      { text: '일루네온의 시계들은 조금씩 다른 시각을 가리켰다. 사람들은 고장 난 시계를 고치고, 늦어진 약속을 새로 잡았다. 모두가 같은 시간을 살지는 않아도, 내일 만날 수는 있었다.' },
    ],
  },
};

/** Render only from the victory snapshot, never from today's NPC state. */
export function endingPresentation(id: TimeEndingId, witnesses?: TimeEndingWitnesses): TimeEnding & { variant: string } {
  const edition = TIME_ENDINGS[id];
  const pages = edition.pages.map(page => ({ ...page }));
  if (!witnesses) return { title: edition.title, pages, variant: '동행 기록 없음' };
  const presentDun = witnesses.dun.state === 'present' && witnesses.dun.joined, presentTifre = witnesses.tifre.state === 'present' && witnesses.tifre.joined;
  const dun = presentDun && witnesses.dun.joined, tifre = presentTifre && witnesses.tifre.joined;
  let variant = dun && tifre ? '두 사람과 함께' : dun ? '던과 함께' : tifre ? '티프레와 함께' : '홀로';
  const voices: TimeEndingPage[] = [];
  if (id === 'together') {
    pages[0] = { text: dun && tifre
      ? '던이 닻의 무게를 받았다. 티프레는 연결을 한꺼번에 끊지 않았다. 당신이 읽어 온 기록을 따라, 서로 다른 시각의 매듭을 하나씩 풀었다.'
      : dun ? '던이 기울어지는 닻을 받쳤다. 당신은 그 손이 버티는 동안 기록을 살피고, 남은 사람의 시간을 하나씩 풀었다.'
      : tifre ? '당신이 닻을 받쳤다. 손끝이 떨릴 때마다 티프레가 기다렸다. 당신의 신호에 맞춰, 연결 하나씩 번개가 스쳤다.'
      : '닻을 받치던 손으로 매듭까지 풀어야 했다. 당신은 몇 번이고 멈춰 섰다. 무게를 옮기고, 기록을 확인하고, 다시 하나를 풀었다.' };
    if (presentDun) voices.push({ speaker: '던', text: dun ? '아직. 이쪽에 사람이 남았어.' : '……둘 다 해냈구나.' });
    if (presentTifre) voices.push({ speaker: '티프레', text: tifre ? '알아. 이번엔 기다릴게. ……지금?' : '다 열렸네. 사람들도, 길도.' });
  } else if (id === 'stillness') {
    if (presentDun) voices.push({ speaker: '던', text: '버틴 건 맞아. ……그런데 문이 안 열려.' });
    if (presentTifre) voices.push({ speaker: '티프레', text: '여기서 멈추면 안 돼. 아직 안쪽에 사람이 있어.' });
  } else {
    if (presentDun) voices.push({ speaker: '던', text: '잠깐. 저쪽에 아직…….' });
    if (presentTifre) voices.push({ speaker: '티프레', text: '길은 열렸는데. 왜 돌아오는 발소리가 안 들리지?' });
  }
  pages.splice(id === 'together' ? 1 : 3, 0, ...voices);
  const recovering = [['던', witnesses.dun.state], ['티프레', witnesses.tifre.state]].filter(([,state])=>state==='recovering'||state==='dead').map(([name])=>name!);
  if (recovering.length) {
    variant += ' · 동료 회복 중';
    pages.push({text: recovering.join('과 ') + (recovering.at(-1)==='던'?'은':'는') + ' 거점에서 몸을 추스르고 있다. 당신은 돌아가서 전할 이야기를 수첩에 남겼다.'});
  } else {
    const absent = [witnesses.dun.state === 'absent' ? '던' : '', witnesses.tifre.state === 'absent' ? '티프레' : ''].filter(Boolean);
    if (absent.length) pages.push({ text: absent.join('과 ') + '에게 전할 이야기가 남았다. 당신은 닻에서 있었던 일을 적었다. 무엇을 지켰고, 무엇을 놓쳤는지.' });
    else if (witnesses.dun.state === 'unknown' || witnesses.tifre.state === 'unknown')
      pages.push({ text: '돌아오지 않은 답장을 기다리며, 당신은 기록을 덮었다. 아직 행방을 알 수 없는 사람이 있었다.' });
  }
  return { title: edition.title, pages, variant };
}
