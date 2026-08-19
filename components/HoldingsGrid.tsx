import { formatMYR, formatShare } from "@/lib/format";
import { AssetIcon } from "@/components/icons";
import Value from "@/components/Value";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
};

type Holding = {
  id: string;
  name: string;
  assetType: string;
  symbol: string | null;
  valueMYR: number | null;
  costValueMYR: number | null;
  /** 手动估值型但一笔价都没填过 —— 现值等于成本，盈亏恒为 0 */
  needsValuation?: boolean;
};

export default function HoldingsGrid({
  holdings,
  netWorthMYR,
}: {
  holdings: Holding[];
  netWorthMYR: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {holdings.map((h) => {
        const color = ASSET_TYPE_COLOR[h.assetType] ?? "var(--ink-muted)";
        const isCash = h.assetType === "CASH";
        const allocationPct = h.valueMYR !== null && netWorthMYR > 0 ? h.valueMYR / netWorthMYR : null;
        const pnlMYR = h.valueMYR !== null && h.costValueMYR !== null ? h.valueMYR - h.costValueMYR : null;
        const pnlPct = pnlMYR !== null && h.costValueMYR ? pnlMYR / h.costValueMYR : null;

        return (
          <div key={h.id} className="card p-4">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
              >
                <AssetIcon assetType={h.assetType} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{h.name}</div>
                <div className="text-xs text-ink-muted">
                  {h.symbol ? h.symbol : ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">现值</span>
              <span className="text-sm font-semibold text-ink font-mono tabular-nums">
                {h.valueMYR !== null ? formatMYR(h.valueMYR) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">成本</span>
              <span className="text-xs text-ink-secondary font-mono tabular-nums">
                {h.costValueMYR !== null ? formatMYR(h.costValueMYR) : "—"}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">配置占比</span>
              <span className="text-xs text-ink-secondary font-mono tabular-nums">
                {allocationPct !== null ? formatShare(allocationPct) : "—"}
              </span>
            </div>

            {/* 现金没有盈亏概念（余额由流水推导，成本恒等于现值），渲染出来必然是
                「RM 0.00 (0%)」—— 那是在回答一个不该被问的问题，读者会以为现金持平。
                手动估值型但从没填过价的（needsValuation）是同一类谎：那个 0.00%
                不是「没涨没跌」，是「根本没估过」。要显式说出来，不能让它冒充持平。 */}
            {!isCash && h.needsValuation && (
              <div className="mt-2 text-xs font-medium text-warning">尚未估值</div>
            )}
            {!isCash && !h.needsValuation && pnlMYR !== null && pnlPct !== null && (
              <div className="mt-2 text-xs font-medium">
                <Value value={pnlMYR} colorizeSign />{" "}
                (<Value value={pnlPct} kind="percent" colorizeSign />)
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
