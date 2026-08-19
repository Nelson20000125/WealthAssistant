-- 回填 valuation。上一个 migration 给的预设值是 AUTO，对现金与无代号资产都是错的。
-- 规则依「现在实际怎么取价」推断，不猜使用者意图：
--   CASH            -> DERIVED           余额由流水推导（cashBalance.ts）
--   有 symbol       -> AUTO              refresh-prices 抓得到行情
--   无 symbol       -> MANUAL_UNIT_PRICE 抓不到行情，只能手填单价（如 Public Mutual）
-- MANUAL_VALUE 不在这里指派：既有资料没有任何「只有总市值、无份额」的持仓，
-- 硬猜会把份额概念弄丢。房产/EPF 这类由使用者新增时自己选。

UPDATE "Holding" SET "valuation" = 'DERIVED'
WHERE "assetType" = 'CASH';

UPDATE "Holding" SET "valuation" = 'AUTO'
WHERE "assetType" <> 'CASH' AND "symbol" IS NOT NULL AND "symbol" <> '';

UPDATE "Holding" SET "valuation" = 'MANUAL_UNIT_PRICE'
WHERE "assetType" <> 'CASH' AND ("symbol" IS NULL OR "symbol" = '');
