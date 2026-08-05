import { prisma } from "@/lib/prisma";

// 记账核心逻辑（设计见 bookkeeping-design.md）。
// INVEST 联动 = 方案 B：记一笔投资，同一事务内更新目标持仓（加权平均成本）
// 和现金持仓（扣款）；删除/修改时按公式精确逆算回滚，保证账实一致。

export type TxType = "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";

export type TransactionInput = {
  date: Date;
  amount: number;
  type: TxType;
  description: string;
  categoryId?: string | null;
  // ---- INVEST 专用 ----
  holdingId?: string | null;
  unitPrice?: number | null;
  cashHoldingId?: string | null;
};

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function assertInvestInput(input: TransactionInput) {
  if (!input.holdingId) throw new Error("投资记录必须选择目标持仓");
  if (!input.unitPrice || input.unitPrice <= 0) throw new Error("投资记录必须填写有效单价");
  if (input.amount <= 0) throw new Error("投资金额必须大于 0");
}

/** 确认持仓所属户口是当前用户的，防止跨用户 ID 被拿来写入别人的持仓 */
async function assertHoldingOwnership(tx: PrismaTx, holdingId: string, userId: string) {
  const holding = await tx.holding.findUnique({
    where: { id: holdingId },
    include: { account: { select: { userId: true } } },
  });
  if (!holding || holding.account.userId !== userId) throw new Error("持仓不存在");
}

/** 确认分类是当前用户的，防止跨用户 ID 被拿来关联到别人的分类 */
async function assertCategoryOwnership(tx: PrismaTx, categoryId: string, userId: string) {
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  if (!category || category.userId !== userId) throw new Error("分类不存在");
}

/** 对目标持仓做加权平均成本买入；返回持仓计价货币（Transaction.currency 用） */
async function applyInvest(
  tx: PrismaTx,
  input: { holdingId: string; amount: number; unitPrice: number; cashHoldingId?: string | null }
) {
  const holding = await tx.holding.findUniqueOrThrow({ where: { id: input.holdingId } });
  if (holding.assetType === "CASH") throw new Error("目标持仓不能是现金");

  const units = input.amount / input.unitPrice;
  const newQty = holding.quantity + units;
  const newCostBasis = (holding.quantity * holding.costBasis + input.amount) / newQty;
  await tx.holding.update({
    where: { id: holding.id },
    data: { quantity: newQty, costBasis: newCostBasis },
  });

  if (input.cashHoldingId) {
    const cash = await tx.holding.findUniqueOrThrow({ where: { id: input.cashHoldingId } });
    if (cash.assetType !== "CASH") throw new Error("扣款持仓必须是现金类");
    if (cash.currency !== holding.currency) {
      throw new Error(`扣款现金（${cash.currency}）与目标持仓（${holding.currency}）币种不一致`);
    }
    // 有期初余额 = 走流水推导，余额由 getDerivedCashBalances 从这笔交易本身算出来，
    // 这里再扣一次 costBasis 是多余的：那个栏位已经不被读取，写进去只会慢慢偏离真实值。
    // 没有期初余额的旧式现金持仓才沿用直接扣款。
    if (cash.openingBalance === null) {
      await tx.holding.update({
        where: { id: cash.id },
        data: { costBasis: cash.costBasis - input.amount, lastPrice: cash.costBasis - input.amount },
      });
    }
  }

  return { units, currency: holding.currency };
}

/** applyInvest 的精确逆运算（加权平均可逆推） */
async function reverseInvest(
  tx: PrismaTx,
  t: { holdingId: string | null; cashHoldingId: string | null; amount: number; units: number | null }
) {
  if (t.holdingId && t.units) {
    const holding = await tx.holding.findUnique({ where: { id: t.holdingId } });
    if (holding) {
      const oldQty = holding.quantity - t.units;
      // 数值误差容忍：份额几乎归零就当归零，避免除以极小数放大误差
      const oldCostBasis =
        oldQty > 1e-9 ? (holding.quantity * holding.costBasis - t.amount) / oldQty : 0;
      await tx.holding.update({
        where: { id: holding.id },
        data: { quantity: Math.max(oldQty, 0), costBasis: Math.max(oldCostBasis, 0) },
      });
    }
  }
  if (t.cashHoldingId) {
    const cash = await tx.holding.findUnique({ where: { id: t.cashHoldingId } });
    // 同 applyInvest：推导型现金不碰 costBasis。交易删掉後推导自然就不含它了，
    // 这里再加回去等于加两次。
    if (cash && cash.openingBalance === null) {
      await tx.holding.update({
        where: { id: cash.id },
        data: { costBasis: cash.costBasis + t.amount, lastPrice: cash.costBasis + t.amount },
      });
    }
  }
}

export async function createTransaction(userId: string, input: TransactionInput) {
  return prisma.$transaction(async (tx) => {
    if (input.categoryId) await assertCategoryOwnership(tx, input.categoryId, userId);

    let units: number | null = null;
    let currency = "MYR";

    if (input.type === "INVEST") {
      assertInvestInput(input);
      await assertHoldingOwnership(tx, input.holdingId!, userId);
      if (input.cashHoldingId) await assertHoldingOwnership(tx, input.cashHoldingId, userId);
      const applied = await applyInvest(tx, {
        holdingId: input.holdingId!,
        amount: input.amount,
        unitPrice: input.unitPrice!,
        cashHoldingId: input.cashHoldingId,
      });
      units = applied.units;
      currency = applied.currency;
    }

    return tx.transaction.create({
      data: {
        userId,
        date: input.date,
        amount: input.amount,
        currency,
        type: input.type,
        description: input.description,
        categoryId: input.categoryId ?? null,
        source: "MANUAL",
        holdingId: input.type === "INVEST" ? input.holdingId : null,
        units,
        unitPrice: input.type === "INVEST" ? input.unitPrice : null,
        cashHoldingId: input.type === "INVEST" ? (input.cashHoldingId ?? null) : null,
      },
    });
  });
}

export async function updateTransaction(userId: string, id: string, input: TransactionInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUniqueOrThrow({ where: { id } });
    if (existing.userId !== userId) throw new Error("记录不存在");
    if (input.categoryId) await assertCategoryOwnership(tx, input.categoryId, userId);

    // 旧的是投资 → 先回滚旧联动；新的是投资 → 再应用新联动
    if (existing.type === "INVEST") await reverseInvest(tx, existing);

    let units: number | null = null;
    let currency = "MYR";
    if (input.type === "INVEST") {
      assertInvestInput(input);
      await assertHoldingOwnership(tx, input.holdingId!, userId);
      if (input.cashHoldingId) await assertHoldingOwnership(tx, input.cashHoldingId, userId);
      const applied = await applyInvest(tx, {
        holdingId: input.holdingId!,
        amount: input.amount,
        unitPrice: input.unitPrice!,
        cashHoldingId: input.cashHoldingId,
      });
      units = applied.units;
      currency = applied.currency;
    }

    return tx.transaction.update({
      where: { id },
      data: {
        date: input.date,
        amount: input.amount,
        currency,
        type: input.type,
        description: input.description,
        categoryId: input.categoryId ?? null,
        holdingId: input.type === "INVEST" ? input.holdingId : null,
        units,
        unitPrice: input.type === "INVEST" ? input.unitPrice : null,
        cashHoldingId: input.type === "INVEST" ? (input.cashHoldingId ?? null) : null,
      },
    });
  });
}

export async function deleteTransaction(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findUniqueOrThrow({ where: { id } });
    if (existing.userId !== userId) throw new Error("记录不存在");
    if (existing.type === "INVEST") await reverseInvest(tx, existing);
    return tx.transaction.delete({ where: { id } });
  });
}

// ---- 查询 ----

function rateFor(currency: string, fxRates: { base: string; quote: string; rate: number }[]) {
  if (currency === "MYR") return 1;
  return fxRates.find((r) => r.base === currency && r.quote === "MYR")?.rate ?? null;
}

/** 某月的流水 + 汇总（金额统一折算 MYR；汇率缺失的笔数单独返回，不静默吞掉） */
export async function getMonthCashflow(userId: string, year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [transactions, fxRates] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: {
        category: true,
        holding: { select: { name: true, symbol: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    prisma.fxRate.findMany(),
  ]);

  const totals = { income: 0, expense: 0, invest: 0, transfer: 0 };
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();
  let fxMissingCount = 0;

  const items = transactions.map((t) => {
    const rate = rateFor(t.currency, fxRates);
    const amountMYR = rate !== null ? t.amount * rate : null;
    if (amountMYR === null) {
      fxMissingCount++;
    } else {
      if (t.type === "INCOME") {
        totals.income += amountMYR;
        const key = t.category?.name ?? "未分类";
        incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + amountMYR);
      }
      if (t.type === "EXPENSE") {
        totals.expense += amountMYR;
        const key = t.category?.name ?? "未分类";
        expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + amountMYR);
      }
      if (t.type === "INVEST") totals.invest += amountMYR;
      if (t.type === "TRANSFER") totals.transfer += amountMYR;
    }
    return {
      id: t.id,
      date: t.date,
      amount: t.amount,
      currency: t.currency,
      amountMYR,
      type: t.type as TxType,
      description: t.description,
      categoryId: t.categoryId,
      categoryName: t.category?.name ?? null,
      holdingId: t.holdingId,
      holdingLabel: t.holding ? (t.holding.symbol ?? t.holding.name) : null,
      units: t.units,
      unitPrice: t.unitPrice,
      cashHoldingId: t.cashHoldingId,
    };
  });

  return {
    year,
    month,
    items,
    totals: { ...totals, net: totals.income - totals.expense },
    expenseByCategory: Array.from(expenseByCategory.entries())
      .map(([name, valueMYR]) => ({ name, valueMYR }))
      .sort((a, b) => b.valueMYR - a.valueMYR),
    incomeByCategory: Array.from(incomeByCategory.entries())
      .map(([name, valueMYR]) => ({ name, valueMYR }))
      .sort((a, b) => b.valueMYR - a.valueMYR),
    fxMissingCount,
  };
}

/** 年度矩阵：12 个月的收入/支出/投资/结余 + 每月最大消费分类（年度对比图表用） */
export async function getYearCashflow(userId: string, year: number) {
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const [transactions, fxRates] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { category: { select: { name: true } } },
    }),
    prisma.fxRate.findMany(),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    invest: 0,
    transfer: 0,
    net: 0,
    topExpenseCategory: null as string | null,
    _byCategory: new Map<string, number>(),
  }));

  for (const t of transactions) {
    const rate = rateFor(t.currency, fxRates);
    if (rate === null) continue;
    const amountMYR = t.amount * rate;
    const m = months[t.date.getUTCMonth()];
    if (t.type === "INCOME") m.income += amountMYR;
    if (t.type === "EXPENSE") {
      m.expense += amountMYR;
      const key = t.category?.name ?? "未分类";
      m._byCategory.set(key, (m._byCategory.get(key) ?? 0) + amountMYR);
    }
    if (t.type === "INVEST") m.invest += amountMYR;
    if (t.type === "TRANSFER") m.transfer += amountMYR;
  }

  for (const m of months) {
    m.net = m.income - m.expense;
    let top: { name: string; value: number } | null = null;
    for (const [name, value] of m._byCategory) {
      if (!top || value > top.value) top = { name, value };
    }
    m.topExpenseCategory = top?.name ?? null;
  }

  return {
    year,
    months: months.map(({ _byCategory: _ignored, ...m }) => m),
    totals: {
      income: months.reduce((a, m) => a + m.income, 0),
      expense: months.reduce((a, m) => a + m.expense, 0),
      invest: months.reduce((a, m) => a + m.invest, 0),
      transfer: months.reduce((a, m) => a + m.transfer, 0),
    },
  };
}

export async function listCategories(userId: string) {
  return prisma.category.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] });
}

/** 按名称找分类（AI 记账用），找不到就创建 */
export async function ensureCategory(userId: string, name: string, type: TxType) {
  return prisma.category.upsert({
    where: { userId_name_type: { userId, name, type } },
    update: {},
    create: { userId, name, type },
  });
}

/** 今天（吉隆坡时区）是否已有记录 —— 「今天还没记账」横幅用 */
export async function hasTransactionToday(userId: string) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const start = new Date(`${key}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const count = await prisma.transaction.count({ where: { userId, date: { gte: start, lt: end } } });
  return count > 0;
}
