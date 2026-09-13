/** A greeting is not evidence; these topics must actually be opened. */
export const TIME_TESTIMONIES: Record<string, { id: string; label: string; lines: string[] }> = {
  'time-02': { id: 'time-diner-testimony', label: '식당에서 잰 시간', lines: [
    '탑의 시각은 쓰지 않았습니다. 물을 올리고, 끓기 시작한 때를 따로 적었습니다.',
    '종을 치지 않았다는 연락보다 종소리가 먼저였습니다. 제 기록에서도 순서는 같습니다.',
  ] },
  'time-04': { id: 'time-luna-testimony', label: '같은 날짜를 산다는 것', lines: [
    '날짜는 같아도 그 안에 남은 기억은 다를 수 있겠죠. 제게도 그런 날이 있어요.',
    '보관 봉투를 봐 주세요. 같은 날 쓴 두 장이에요. 하나를 틀렸다고 버리지는 않았으면 해요.',
  ] },
  'time-15': { id: 'time-clock-testimony', label: '고치지 않은 점검판', lines: [
    '숫자는 안 고쳤어. 잘못 적었다고 지우면, 종을 붙잡고 있던 일까지 없어진 것 같아서.',
    '둘 다 남겨 두자. 언제 틀렸는지 모르는 것보다, 어디서 달라졌는지 아는 게 낫잖아.',
  ] },
};
