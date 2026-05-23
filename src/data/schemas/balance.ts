/**
 * 상점·공방 밸런스 튜닝 — config/balance.txt 의 [config.balance] 한 섹션.
 *
 * 데이터에서 값을 빼서 *코드 빌드 없이* 가격·슬롯·제작비를 조정할 수 있게 한다.
 * 누락/오타 필드는 DEFAULT_BALANCE 로 폴백 → 가격이 0이 되는 사고 방지.
 */
export interface Balance {
  // ── 상점 (가격: 골드) ──
  shopCardPriceBasic: number;
  shopCardPriceCommon: number;
  shopCardPriceRare: number;
  shopCardPriceLegendary: number;
  shopRelicPriceBasic: number;
  shopRelicPriceCommon: number;
  shopRelicPriceRare: number;
  shopRelicPriceLegendary: number;
  shopCardRemovalPrice: number;
  shopNumCards: number;
  shopNumRelics: number;
  shopMaterialCommonPrice: number;
  shopMaterialCommonStock: number;
  // ── 공방 (비용: 시간의 조각) ──
  upgradeCostShards: number;          // 기본/일반 카드 강화
  upgradeRareCostShards: number;      // 희귀 카드 강화
  upgradeLegendaryCostShards: number; // 전설 카드 강화
  forgePriceShards: number;           // 희귀+ 제작 1장
  legendaryCostShards: number;        // 전설 제작
  forgeNumOffers: number;             // 희귀+ 제작 추첨 슬롯 수
  potionCommonCostShards: number;     // 일반 포션 제작
  potionRareCostShards: number;       // 희귀 포션 제작
}

export const DEFAULT_BALANCE: Balance = {
  shopCardPriceBasic: 20,
  shopCardPriceCommon: 50,
  shopCardPriceRare: 100,
  shopCardPriceLegendary: 180,
  shopRelicPriceBasic: 60,
  shopRelicPriceCommon: 100,
  shopRelicPriceRare: 160,
  shopRelicPriceLegendary: 240,
  shopCardRemovalPrice: 50,
  shopNumCards: 5,
  shopNumRelics: 2,
  shopMaterialCommonPrice: 18,
  shopMaterialCommonStock: 4,
  upgradeCostShards: 8,
  upgradeRareCostShards: 12,
  upgradeLegendaryCostShards: 18,
  forgePriceShards: 15,
  legendaryCostShards: 25,
  forgeNumOffers: 3,
  potionCommonCostShards: 6,
  potionRareCostShards: 12,
};
