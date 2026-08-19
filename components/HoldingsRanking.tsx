import { formatMYR } from "@/lib/format";
import { AssetIcon } from "@/components/icons";

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
  accountName: string;
  assetType: string;
  symbol: string | null;
  valueMYR: number | null;
};

export default function HoldingsRanking({ holdings }: { holdings: Holding[] }) {
  const ranked = [...holdings]
    .filter((h) => h.valueMYR !== null)
    .sort((a, b) => (b.valueMYR as number) - (a.valueMYR as number));
  const max = ranked.length > 0 ? (ranked[0].valueMYR as number) : 1;

  return (
    <div className="flex flex-col gap-4">
      {ranked.map((h) => {
        const value = h.valueMYR as number;
        const widthPct = Math.max((value / max) * 100, 3);
        const color = ASSET_TYPE_COLOR[h.assetType] ?? "var(--ink-muted)";
        return (
          <div key={h.id} className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              <AssetIcon assetType={h.assetType} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <div className="truncate text-sm text-ink">
                  {h.name}
                  <span className="ml-1.5 text-xs text-ink-muted">
                    {h.symbol ? h.symbol : ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                  </span>
                </div>
                <div className="shrink-0 text-sm font-medium text-ink font-mono tabular-nums">
                  {formatMYR(value)}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-page">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPct}%`, background: color }}
                />
              </div>
              <div className="mt-1 text-xs text-ink-muted">{h.accountName}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
