import { AssetIcon } from "@/components/icons";
import Value from "@/components/Value";

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
};

// 现金类持仓成本恒等于现值，报酬率永远是 0%，不是真正的「表现」，排行榜里剔除。
// 剔除后持仓数太少时，榜单没有参考意义，直接给一句诚实说明，不用捏造的「表现最差」榜单凑数。
const MIN_MEANINGFUL_HOLDINGS = 5;

export default function Leaderboard({ holdings }: { holdings: Holding[] }) {
  const withRoi = holdings
    .filter((h) => h.assetType !== "CASH" && h.valueMYR !== null && h.costValueMYR !== null && h.costValueMYR > 0)
    .map((h) => ({
      ...h,
      roiPct: (h.valueMYR! - h.costValueMYR!) / h.costValueMYR!,
    }))
    .sort((a, b) => b.roiPct - a.roiPct);

  if (withRoi.length < MIN_MEANINGFUL_HOLDINGS) {
    return (
      <div className="text-sm text-ink-muted">
        目前持仓笔数较少（{withRoi.length} 笔有效报酬率数据），排行榜参考意义有限，等持仓再丰富一点再看。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {withRoi.slice(0, 5).map((h, i) => {
        const color = ASSET_TYPE_COLOR[h.assetType] ?? "var(--ink-muted)";
        return (
          <div key={h.id} className="flex items-center gap-3">
            <span className="w-5 text-center text-xs font-medium text-ink-muted">{i + 1}</span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              <AssetIcon assetType={h.assetType} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{h.name}</div>
              <div className="text-xs text-ink-muted">{h.symbol ?? h.assetType}</div>
            </div>
            <Value
              value={h.roiPct}
              kind="percent"
              colorizeSign
              className="shrink-0 text-sm font-semibold"
            />
          </div>
        );
      })}
    </div>
  );
}
