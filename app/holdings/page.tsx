import Link from "next/link";
import { auth } from "@/auth";
import { getPortfolioSummary } from "@/lib/portfolio";
import { getAccounts } from "@/lib/accounts";
import { prisma } from "@/lib/prisma";
import { todaySnapshotDate } from "@/lib/snapshot";
import ValuationUpdateForm from "@/components/ValuationUpdateForm";
import { formatMYR, formatShare } from "@/lib/format";
import { AssetIcon } from "@/components/icons";
import HoldingsView from "@/components/HoldingsView";
import { Badge } from "@/components/ui/badge";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
  DEPOSIT: "定存/公积金",
  PROPERTY: "房产",
  COMMODITY: "商品",
  OTHER: "其他",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
  DEPOSIT: "var(--series-5)",
  PROPERTY: "var(--series-6)",
  COMMODITY: "var(--series-7)",
  OTHER: "var(--series-8)",
};

export default async function HoldingsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const [summary, accounts, manualHoldings] = await Promise.all([
    getPortfolioSummary(userId),
    getAccounts(userId),
    // 手动估值的持仓（原本独立成 /valuations 一页）。合并进来是因为那一页只有
    // 一两行内容却独占一个路由与侧栏位置，而这一页只有三行、空得发慌；
    // 而且「看持仓」和「更新持仓估值」本来就是同一件事的两半。
    prisma.holding.findMany({
      where: {
        account: { userId },
        valuation: { in: ["MANUAL_UNIT_PRICE", "MANUAL_VALUE"] },
      },
      include: {
        account: { select: { name: true } },
        prices: { orderBy: { date: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // 天数在伺服器端算好再传下去。放到 client 用 new Date() 算，会因为伺服器与
  // 浏览器时区不同而 hydration 不一致。
  const valuationToday = todaySnapshotDate();
  const valuationRows = manualHoldings.map((h) => {
    const latest = h.prices[0];
    return {
      id: h.id,
      name: h.name,
      accountName: h.account.name,
      valuation: h.valuation,
      currency: h.currency,
      quantity: h.quantity,
      lastPrice: latest?.price ?? null,
      lastDate: latest ? latest.date.toISOString().slice(0, 10) : null,
      daysAgo: latest
        ? Math.round((valuationToday.getTime() - latest.date.getTime()) / 86_400_000)
        : null,
    };
  });
  const sortedAllocation = [...summary.allocation].sort((a, b) => b.valueMYR - a.valueMYR);

  // 这一页只管投资标的，现金归收支页（那里能同时看到余额与造成余额的流水）。
  // 占比因此对「投资总额」算而不是净资产 —— 对净资产算的话这页的百分比
  // 加起来永远不到 100%，差的那截是看不见的现金。
  const investments = summary.holdings.filter((h) => h.assetType !== "CASH");
  const investedMYR = investments.reduce((sum, h) => sum + (h.valueMYR ?? 0), 0);
  const cashMYR = summary.netWorthMYR - investedMYR;

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">
          Portfolio Holdings
        </div>
        <h1 className="mt-1 text-3xl font-semibold text-ink">持仓明细</h1>
        <p className="mt-1 text-sm text-ink-muted">
          共 {investments.length} 笔投资持仓，投资总额 {formatMYR(investedMYR)}
          <span className="mx-1.5 text-line">·</span>
          净资产 {formatMYR(summary.netWorthMYR)}（含现金 {formatMYR(cashMYR)}，
          <Link href="/cashflow" className="text-ai-accent hover:underline">
            在收支记录页
          </Link>
          ）
        </p>
      </div>

      {/* 这排刻意保留现金：它是「资产配置」视角，现金占比过高本身就是要看见的信号。
          下面的表格是「投资标的」视角，两者分母不同，所以标题写清楚。 */}
      <div className="flex flex-col gap-2">
        <div className="text-xs text-ink-muted">资产配置（含现金，对净资产计）</div>
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
              <span className="font-medium text-ink">{formatShare(a.pct)}</span>
            </Badge>
          );
        })}
        </div>
      </div>

      <HoldingsView holdings={investments} totalMYR={investedMYR} accounts={accounts} />

      {/* 更新估值：原 /valuations。这一段最值钱的不是输入框，是「上次更新距今几天」——
          没有它，没人知道哪笔资产的估值已经烂掉了。
          没有手动估值持仓时整段不渲染，避免给只买 ETF 的人一块永远空着的区域。 */}
      {valuationRows.length > 0 && (
        <div className="card animate-in p-6" id="valuations">
          <div className="mb-1 text-sm font-medium text-ink">更新估值</div>
          <p className="mb-5 text-xs text-ink-muted">
            没有行情 API 的资产（Public Mutual 基金、定存、房产）在这里更新。填了才会送出，留空的不动。
          </p>
          <ValuationUpdateForm rows={valuationRows} today={valuationToday.toISOString().slice(0, 10)} />
        </div>
      )}
    </div>
  );
}
