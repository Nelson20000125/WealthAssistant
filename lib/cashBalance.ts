import { prisma } from "@/lib/prisma";

/**
 * 现金余额由流水推导，不可手改（决策 2026-07-29）。
 *
 *   余额 = openingBalance + Σ(期初日之后、动到这个现金池的流水)
 *
 * 只有设了 openingBalance / openingBalanceDate 的 CASH 持仓才走推导；
 * 没设的回传 undefined，呼叫端沿用 costBasis。
 *
 * 为什么挂在 Holding 而不是 Account：多币种户口（Wise）一个 Account 底下
 * 可以有多个币种余额，只知道「哪个户口」无法确定动的是哪一个池子。
 */
export async function getDerivedCashBalances(userId: string): Promise<Map<string, number>> {
  const cashHoldings = await prisma.holding.findMany({
    where: {
      account: { userId },
      assetType: "CASH",
      openingBalance: { not: null },
      openingBalanceDate: { not: null },
    },
    select: { id: true, openingBalance: true, openingBalanceDate: true },
  });

  const result = new Map<string, number>();
  if (cashHoldings.length === 0) return result;

  const ids = cashHoldings.map((h) => h.id);

  // 一次捞完所有相关流水，避免 N+1。两侧都要看：
  // 本侧 cashHoldingId（钱出去/进来），对手侧 counterCashHoldingId（转帐转进来）。
  const txs = await prisma.transaction.findMany({
    where: {
      userId,
      OR: [{ cashHoldingId: { in: ids } }, { counterCashHoldingId: { in: ids } }],
    },
    select: {
      date: true,
      amount: true,
      type: true,
      cashHoldingId: true,
      counterCashHoldingId: true,
      counterAmount: true,
    },
  });

  for (const h of cashHoldings) {
    let balance = h.openingBalance!;
    const since = h.openingBalanceDate!;

    for (const t of txs) {
      // 期初日当天及之前的流水不计——期初余额已经含了它们
      if (t.date <= since) continue;

      if (t.cashHoldingId === h.id) {
        // 本侧：收入进帐；支出/投资/转出都是扣款
        balance += t.type === "INCOME" ? t.amount : -t.amount;
      }
      if (t.counterCashHoldingId === h.id) {
        // 对手侧：转帐/换汇转入。换汇两边金额不等，所以优先用 counterAmount，
        // 没填才退回 amount（同币种转帐）。
        balance += t.counterAmount ?? t.amount;
      }
    }

    result.set(h.id, balance);
  }

  return result;
}

export type CashPool = {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  currency: string;
  /** 编辑表单要回填的原始栏位 —— 现金池的期初只能在收支页改，持仓页已经不管现金 */
  valuation: string;
  symbol: string | null;
  quantity: number;
  costBasis: number;
  /** 该池的原生币种余额 */
  balance: number;
  /** 折算成 MYR；缺汇率时为 null —— 不拿原生数字冒充 MYR */
  balanceMYR: number | null;
  /** 余额是否由流水推导。false 代表这个池子还没设期初，余额只是 costBasis 的残值 */
  isDerived: boolean;
  openingBalance: number | null;
  openingBalanceDate: Date | null;
};

/**
 * 首次记账时该预选哪个户口。
 *
 * 记一笔的户口预设优先读 localStorage 里上次用过的那个，但全新使用者没有那份记忆，
 * 旧行为是不预选 —— 而「不从户口扣」记出来的帐完全不影响余额推导，
 * 使用者可能记完整个月才发现余额一动没动。
 *
 * 余额最大的池子是最合理的猜测：日常开销九成从主户口出。
 * 缺汇率（balanceMYR 为 null）的池子不参与比较 —— 那是「不知道多少」，不是「零」；
 * 负余额也跳过，那通常代表期初填小了，不该被当成主力户口。
 */
export function pickDefaultCashPool(pools: { id: string; balanceMYR: number | null }[]): string | null {
  let best: { id: string; balanceMYR: number } | null = null;
  for (const p of pools) {
    if (p.balanceMYR === null || p.balanceMYR < 0) continue;
    if (best === null || p.balanceMYR > best.balanceMYR) best = { id: p.id, balanceMYR: p.balanceMYR };
  }
  return best?.id ?? null;
}

/**
 * 所有现金池 + 当前余额，给收支页顶部的余额卡用。
 *
 * 取值口径与 getPortfolioSummary 一致：推导值优先，没设期初才退回 costBasis。
 * 两边算出来的现金必须相等，否则收支页跟总览页会各说一套。
 */
export async function getCashPools(userId: string): Promise<CashPool[]> {
  const [holdings, derived, fxRates] = await Promise.all([
    prisma.holding.findMany({
      where: { account: { userId }, assetType: "CASH" },
      include: { account: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    getDerivedCashBalances(userId),
    prisma.fxRate.findMany(),
  ]);

  return holdings.map((h) => {
    const d = derived.get(h.id);
    const balance = d ?? h.costBasis;
    const rate =
      h.currency === "MYR"
        ? 1
        : (fxRates.find((r) => r.base === h.currency && r.quote === "MYR")?.rate ?? null);

    return {
      id: h.id,
      name: h.name,
      accountId: h.accountId,
      accountName: h.account.name,
      currency: h.currency,
      valuation: h.valuation,
      symbol: h.symbol,
      quantity: h.quantity,
      costBasis: h.costBasis,
      balance,
      balanceMYR: rate !== null ? balance * rate : null,
      isDerived: d !== undefined,
      openingBalance: h.openingBalance,
      openingBalanceDate: h.openingBalanceDate,
    };
  });
}
