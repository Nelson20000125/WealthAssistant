import { auth } from "@/auth";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getAccounts } from "@/lib/accounts";
import { formatMYR, formatPct } from "@/lib/format";
import { AssetIcon } from "@/components/icons";
import HoldingsView from "@/components/HoldingsView";
import { Badge } from "@/components/ui/badge";

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

export default async function HoldingsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [summary, accounts] = await Promise.all([getPortfolioSummary(userId), getAccounts(userId)]);
  const sortedAllocation = [...summary.allocation].sort((a, b) => b.valueMYR - a.valueMYR);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">
          Portfolio Holdings
        </div>
        <h1 className="mt-1 text-3xl font-semibold text-ink">持仓明细</h1>
        <p className="mt-1 text-sm text-ink-muted">共 {summary.holdings.length} 笔持仓，净资产 {formatMYR(summary.netWorthMYR)}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sortedAllocation.map((a) => {
          const color = ASSET_TYPE_COLOR[a.assetType] ?? "var(--ink-muted)";
          return (
            <Badge
              key={a.assetType}
              variant="outline"
              className="gap-1.5 border-line bg-surface py-1.5 pl-1.5 pr-3 text-sm font-normal"
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
              >
                <AssetIcon assetType={a.assetType} className="h-3 w-3" />
              </span>
              <span className="text-ink-secondary">{ASSET_TYPE_LABEL[a.assetType] ?? a.assetType}</span>
              <span className="font-medium text-ink">{formatPct(a.pct)}</span>
            </Badge>
          );
        })}
      </div>

      <HoldingsView holdings={summary.holdings} netWorthMYR={summary.netWorthMYR} accounts={accounts} />
    </div>
  );
}
