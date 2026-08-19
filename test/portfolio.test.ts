import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { getPortfolioSummary } from "@/lib/portfolio";

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function makeUser() {
  return prisma.user.create({
    data: { email: `u-${Math.random()}@test.local`, passwordHash: "x" },
  });
}

async function makeAccount(userId: string, currency = "MYR") {
  return prisma.account.create({
    data: { userId, name: "户口", type: "BROKERAGE", institution: "T", currency },
  });
}

type HoldingOpts = {
  valuation: "AUTO" | "MANUAL_UNIT_PRICE" | "MANUAL_VALUE" | "DERIVED";
  assetType?: "STOCK" | "ETF" | "FUND" | "CASH" | "PROPERTY";
  quantity?: number;
  costBasis?: number;
  lastPrice?: number | null;
  currency?: string;
  symbol?: string | null;
};

async function makeHolding(accountId: string, o: HoldingOpts) {
  return prisma.holding.create({
    data: {
      accountId,
      assetType: o.assetType ?? "ETF",
      valuation: o.valuation,
      name: "标的",
      symbol: o.symbol ?? null,
      quantity: o.quantity ?? 10,
      costBasis: o.costBasis ?? 100,
      currency: o.currency ?? "MYR",
      lastPrice: o.lastPrice === undefined ? null : o.lastPrice,
    },
  });
}

describe("getPortfolioSummary 取价优先级", () => {
  it("手动估值：有 HoldingPrice 就用它，不用 lastPrice 也不用 costBasis", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, {
      valuation: "MANUAL_UNIT_PRICE",
      assetType: "FUND",
      quantity: 100,
      costBasis: 1.0,
      lastPrice: 1.5, // 建仓时写进去的旧值，不该被采用
    });
    await prisma.holdingPrice.create({
      data: { holdingId: h.id, date: D("2026-08-01"), price: 1.2 },
    });

    const s = await getPortfolioSummary(user.id);
    const row = s.holdings.find((x) => x.id === h.id)!;

    expect(row.unitPrice).toBe(1.2);
    expect(row.valueMYR).toBeCloseTo(120, 6);
  });

  it("手动估值但一笔价都没填：退回 costBasis，且标记 needsValuation", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, {
      valuation: "MANUAL_UNIT_PRICE",
      assetType: "FUND",
      quantity: 100,
      costBasis: 1.0,
      lastPrice: null,
    });

    const s = await getPortfolioSummary(user.id);
    const row = s.holdings.find((x) => x.id === h.id)!;

    // 现值等於成本 -> 盈亏 0。这不是「没涨没跌」，是「没估过值」，必须能分辨
    expect(row.unitPrice).toBe(1.0);
    expect(row.needsValuation).toBe(true);
  });

  it("填过价之後 needsValuation 转为 false", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, { valuation: "MANUAL_UNIT_PRICE", assetType: "FUND" });
    await prisma.holdingPrice.create({
      data: { holdingId: h.id, date: D("2026-08-01"), price: 5 },
    });

    const s = await getPortfolioSummary(user.id);

    expect(s.holdings.find((x) => x.id === h.id)!.needsValuation).toBe(false);
  });

  it("AUTO 型没有手动价，用 lastPrice；不会被标 needsValuation", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, {
      valuation: "AUTO",
      symbol: "VOO",
      quantity: 2,
      costBasis: 100,
      lastPrice: 150,
    });

    const s = await getPortfolioSummary(user.id);
    const row = s.holdings.find((x) => x.id === h.id)!;

    expect(row.unitPrice).toBe(150);
    expect(row.needsValuation).toBe(false);
  });

  it("补录过去日期，不会盖掉比较新的那笔价", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, { valuation: "MANUAL_UNIT_PRICE", assetType: "FUND", quantity: 1 });

    await prisma.holdingPrice.create({
      data: { holdingId: h.id, date: D("2026-08-01"), price: 9 },
    });
    // 事後才想起来补 7 月的价 —— 当前估值仍该用 8 月那笔
    await prisma.holdingPrice.create({
      data: { holdingId: h.id, date: D("2026-07-01"), price: 3 },
    });

    const s = await getPortfolioSummary(user.id);

    expect(s.holdings.find((x) => x.id === h.id)!.unitPrice).toBe(9);
  });

  it("MANUAL_VALUE：份额恒为 1，填的价就是总市值", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const h = await makeHolding(acc.id, {
      valuation: "MANUAL_VALUE",
      assetType: "PROPERTY",
      quantity: 1,
      costBasis: 300000,
    });
    await prisma.holdingPrice.create({
      data: { holdingId: h.id, date: D("2026-08-01"), price: 450000 },
    });

    const s = await getPortfolioSummary(user.id);

    expect(s.holdings.find((x) => x.id === h.id)!.valueMYR).toBeCloseTo(450000, 6);
  });
});

describe("getPortfolioSummary 报酬计算", () => {
  it("不同币种各自计算，不跨币种加总（汇率变动不算报酬）", async () => {
    const user = await makeUser();
    const accMyr = await makeAccount(user.id, "MYR");
    const accUsd = await makeAccount(user.id, "USD");
    await makeHolding(accMyr.id, { valuation: "AUTO", symbol: "A", quantity: 10, costBasis: 10, lastPrice: 12, currency: "MYR" });
    await makeHolding(accUsd.id, { valuation: "AUTO", symbol: "B", quantity: 10, costBasis: 10, lastPrice: 11, currency: "USD" });
    await prisma.fxRate.create({ data: { base: "USD", quote: "MYR", rate: 4 } });

    const s = await getPortfolioSummary(user.id);

    const myr = s.performanceByCurrency.find((p) => p.currency === "MYR")!;
    const usd = s.performanceByCurrency.find((p) => p.currency === "USD")!;
    expect(myr.plNative).toBeCloseTo(20, 6);
    expect(myr.plPct).toBeCloseTo(0.2, 6);
    expect(usd.plNative).toBeCloseTo(10, 6);
    expect(usd.plPct).toBeCloseTo(0.1, 6);
  });

  it("现金不计入报酬（成本恒等於市值，计入只会把报酬率稀释向 0）", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    await makeHolding(acc.id, { valuation: "DERIVED", assetType: "CASH", quantity: 1, costBasis: 5000 });
    await makeHolding(acc.id, { valuation: "AUTO", symbol: "A", quantity: 10, costBasis: 10, lastPrice: 12 });

    const s = await getPortfolioSummary(user.id);
    const myr = s.performanceByCurrency.find((p) => p.currency === "MYR")!;

    // 只有那笔 ETF 参与：成本 100、市值 120
    expect(myr.costNative).toBeCloseTo(100, 6);
    expect(myr.plPct).toBeCloseTo(0.2, 6);
  });

  it("缺汇率的持仓标记 fxMissing，且不计入净资产", async () => {
    const user = await makeUser();
    const accMyr = await makeAccount(user.id, "MYR");
    const accUsd = await makeAccount(user.id, "USD");
    await makeHolding(accMyr.id, { valuation: "AUTO", symbol: "A", quantity: 1, costBasis: 100, lastPrice: 100, currency: "MYR" });
    const usdH = await makeHolding(accUsd.id, { valuation: "AUTO", symbol: "B", quantity: 1, costBasis: 50, lastPrice: 50, currency: "USD" });
    // 刻意不建 USD->MYR 汇率

    const s = await getPortfolioSummary(user.id);
    const row = s.holdings.find((x) => x.id === usdH.id)!;

    expect(row.fxMissing).toBe(true);
    expect(row.valueMYR).toBeNull();
    expect(s.netWorthMYR).toBeCloseTo(100, 6);
  });

  it("现金余额走流水推导，不看 costBasis", async () => {
    const user = await makeUser();
    const acc = await makeAccount(user.id);
    const cash = await prisma.holding.create({
      data: {
        accountId: acc.id, assetType: "CASH", valuation: "DERIVED", name: "现金",
        quantity: 1, costBasis: 999, currency: "MYR",
        openingBalance: 1000, openingBalanceDate: D("2026-01-01"),
      },
    });
    await prisma.transaction.create({
      data: {
        userId: user.id, date: D("2026-02-01"), amount: 250, currency: "MYR",
        type: "EXPENSE", description: "支出", source: "MANUAL", cashHoldingId: cash.id,
      },
    });

    const s = await getPortfolioSummary(user.id);
    const row = s.holdings.find((x) => x.id === cash.id)!;

    expect(row.valueMYR).toBeCloseTo(750, 6);
    expect(row.isDerivedCash).toBe(true);
  });

  it("只算自己的持仓", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const myAcc = await makeAccount(me.id);
    const otherAcc = await makeAccount(other.id);
    await makeHolding(myAcc.id, { valuation: "AUTO", symbol: "A", quantity: 1, costBasis: 10, lastPrice: 10 });
    await makeHolding(otherAcc.id, { valuation: "AUTO", symbol: "B", quantity: 1, costBasis: 999, lastPrice: 999 });

    const s = await getPortfolioSummary(me.id);

    expect(s.holdings).toHaveLength(1);
    expect(s.netWorthMYR).toBeCloseTo(10, 6);
  });
});
