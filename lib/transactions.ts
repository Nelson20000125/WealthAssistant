import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

// 记账核心逻辑（设计见 bookkeeping-design.md）。
// INVEST 联动 = 方案 B：记一笔投资，同一事务内更新目标持仓（加权平均成本）
// 和现金持仓（扣款）；删除/修改时按公式精确逆算回滚，保证账实一致。

export type TxType = "INCOME" | "EXPENSE" | "INVEST" | "TRANSFER";

/**
 * 会关联现金池的类型 —— 四种都算。
 *
 * TRANSFER 的 cashHoldingId 记的是**转出侧**：钱确实离开了这个池，
 * 该扣就得扣。转入侧是 counterCashHoldingId 的事，对家池不在系统里
 * （例如还没建的电子钱包）也不影响转出侧成立。
 * 曾经把 TRANSFER 排除在外，结果是每记一笔转账余额就偏高一次。
 */
const CASH_POOL_TYPES: TxType[] = ["INCOME", "EXPENSE", "INVEST", "TRANSFER"];

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
  // ---- 转帐对手侧 ----
  /** TRANSFER 专用：钱转进哪个现金池 */
  counterCashHoldingId?: string | null;
  /** TRANSFER 专用：转入侧金额。同币种可省略（退回 amount），跨币种必填 */
  counterAmount?: number | null;
  // ---- 垫付 / 还款 ----
  /** EXPENSE 专用：这笔里垫付给别人、预期会收回的金额 */
  reimbursable?: number | null;
  /** INCOME 专用：这笔还款在冲销哪一笔垫付支出 */
  settlesTransactionId?: string | null;
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

/**
 * 校验还款要冲销的那笔垫付：必须是自己的、是支出、而且真的有垫付金额。
 *
 * 币种也要一致 —— 垫的是 MYR 却拿 USD 还款来冲，未收回金额会变成两个币种相减，
 * 那个数字没有意义。跨币还款的场景先挡下来，等真的遇到再设计。
 */
async function assertSettlementTarget(tx: PrismaTx, targetId: string, userId: string, currency: string) {
  const target = await tx.transaction.findUnique({ where: { id: targetId } });
  if (!target || target.userId !== userId) throw new Error("要冲销的垫付记录不存在");
  if (target.type !== "EXPENSE") throw new Error("只能冲销支出类型的垫付记录");
  if (!target.reimbursable || target.reimbursable <= 0) throw new Error("那笔支出没有登记垫付金额");
  if (target.currency !== currency) {
    throw new Error(`还款币种（${currency}）与垫付记录（${target.currency}）不一致`);
  }
}

/** 垫付金额的防呆：不能是负数，也不能超过这笔支出本身 */
function normalizeReimbursable(input: TransactionInput): number | null {
  if (input.type !== "EXPENSE") return null;
  const value = input.reimbursable;
  if (value === null || value === undefined) return null;
  if (value < 0) throw new Error("垫付金额不能是负数");
  if (value > input.amount) throw new Error("垫付金额不能超过这笔支出的总额");
  return value > 0 ? value : null;
}

/**
 * 收支指定的现金池：校验归属与型别，回传它的计价货币。
 *
 * 币种必须跟着现金池走 —— 记成 MYR 的话，推导会把数字原封不动加进澳币池，
 * 余额从此失真（getDerivedCashBalances 不做汇率换算，它算的是该池的原生余额）。
 */
async function resolveCashPool(tx: PrismaTx, cashHoldingId: string, userId: string) {
  await assertHoldingOwnership(tx, cashHoldingId, userId);
  const cash = await tx.holding.findUniqueOrThrow({ where: { id: cashHoldingId } });
  if (cash.assetType !== "CASH") throw new Error("现金池必须是现金类持仓");
  return cash.currency;
}

/**
 * 转帐的转入侧。以前这一侧完全没有入口，UI 只好叫使用者「另外记一笔收入」——
 * 那会把自己户口之间的搬运算成当月收入，收入圆环和结余全部虚高。
 *
 * 跨币种（例如 MYR 转出、AUD 转入）两侧金额本来就不相等，必须各记各的：
 * getDerivedCashBalances 不做任何汇率换算，少了 counterAmount 就会把转出币种的
 * 数字原封不动加进另一个币种的池子。
 */
async function resolveCounterCashPool(
  tx: PrismaTx,
  input: TransactionInput,
  userId: string,
  outCurrency: string
) {
  const counterId = input.counterCashHoldingId!;
  if (counterId === input.cashHoldingId) throw new Error("转出与转入不能是同一个现金池");
  await assertHoldingOwnership(tx, counterId, userId);
  const cash = await tx.holding.findUniqueOrThrow({ where: { id: counterId } });
  if (cash.assetType !== "CASH") throw new Error("转入的必须是现金类持仓");

  const counterAmount = input.counterAmount ?? null;
  if (counterAmount !== null && counterAmount <= 0) throw new Error("转入金额必须大于 0");
  if (cash.currency !== outCurrency && counterAmount === null) {
    throw new Error(`转出（${outCurrency}）与转入（${cash.currency}）币种不同，必须填写转入金额`);
  }
  return counterAmount;
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
    } else if (input.cashHoldingId && CASH_POOL_TYPES.includes(input.type)) {
      currency = await resolveCashPool(tx, input.cashHoldingId, userId);
    }

    let counterAmount: number | null = null;
    const counterCashHoldingId =
      input.type === "TRANSFER" ? (input.counterCashHoldingId ?? null) : null;
    if (counterCashHoldingId) {
      counterAmount = await resolveCounterCashPool(tx, input, userId, currency);
    }

    const reimbursable = normalizeReimbursable(input);
    const settlesTransactionId = input.type === "INCOME" ? (input.settlesTransactionId ?? null) : null;
    if (settlesTransactionId) {
      await assertSettlementTarget(tx, settlesTransactionId, userId, currency);
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
        cashHoldingId: CASH_POOL_TYPES.includes(input.type) ? (input.cashHoldingId ?? null) : null,
        counterCashHoldingId,
        counterAmount,
        reimbursable,
        settlesTransactionId,
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
    } else if (input.cashHoldingId && CASH_POOL_TYPES.includes(input.type)) {
      currency = await resolveCashPool(tx, input.cashHoldingId, userId);
    }

    let counterAmount: number | null = null;
    const counterCashHoldingId =
      input.type === "TRANSFER" ? (input.counterCashHoldingId ?? null) : null;
    if (counterCashHoldingId) {
      counterAmount = await resolveCounterCashPool(tx, input, userId, currency);
    }

    const reimbursable = normalizeReimbursable(input);
    const settlesTransactionId = input.type === "INCOME" ? (input.settlesTransactionId ?? null) : null;
    if (settlesTransactionId) {
      if (settlesTransactionId === id) throw new Error("一笔记录不能冲销自己");
      await assertSettlementTarget(tx, settlesTransactionId, userId, currency);
    }
    // 垫付金额改小（或清掉）之后，已经冲销掉的还款可能超过新的垫付额，
    // 那样「待收回」会变负数。与其让它悄悄错，不如挡在这里。
    if (existing.reimbursable && (!reimbursable || reimbursable < existing.reimbursable)) {
      const settled = await tx.transaction.aggregate({
        where: { settlesTransactionId: id },
        _sum: { amount: true },
      });
      const alreadySettled = settled._sum.amount ?? 0;
      if (alreadySettled > (reimbursable ?? 0)) {
        throw new Error(
          `已经收回 ${alreadySettled}，垫付金额不能改到比它小（先解除关联的还款记录）`
        );
      }
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
        cashHoldingId: CASH_POOL_TYPES.includes(input.type) ? (input.cashHoldingId ?? null) : null,
        counterCashHoldingId,
        counterAmount,
        reimbursable,
        settlesTransactionId,
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

/**
 * 统计口径与现金口径是两回事，这两个 helper 只管统计口径。
 *
 * 现金余额永远用 amount 全额（钱是真的动了），而收入/支出汇总要回答的是
 * 「我这个月赚了多少、花了多少」—— 垫付出去的钱没被消耗、还回来的钱不是新赚的，
 * 都不该进这两个数字。
 */
type CountableTx = {
  type: string;
  amount: number;
  reimbursable: number | null;
  settlesTransactionId: string | null;
  category: { countsInTotals: boolean } | null;
};

/** 这笔要不要进收入/支出汇总 */
function countsInTotals(t: CountableTx): boolean {
  // 分类层级的开关：整类都不算（如「投资进账」其实是自己的钱换个池子）
  if (t.category && !t.category.countsInTotals) return false;
  // 还款只是应收变回现金，不是新赚到的钱
  if (t.type === "INCOME" && t.settlesTransactionId) return false;
  return true;
}

/** 进汇总的金额：支出要扣掉垫付出去、预期收得回来的那部分 */
function countableAmount(t: CountableTx): number {
  if (t.type === "EXPENSE" && t.reimbursable) return t.amount - t.reimbursable;
  return t.amount;
}

/**
 * 任意日期区间的收支汇总（P0-03 的同期比较用）。
 *
 * 走的是跟 getMonthCashflow 一模一样的 countsInTotals / countableAmount 规则 ——
 * 比较用一套口径、列表用另一套，是让使用者以为系统数字对不上的最快方法（P0-04）。
 * end 是开区间。
 */
export async function getRangeCashflow(userId: string, start: Date, end: Date) {
  const [transactions, fxRates] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      include: { category: true },
    }),
    prisma.fxRate.findMany(),
  ]);

  const totals = { income: 0, expense: 0, invest: 0, transfer: 0, fxMissingCount: 0 };
  for (const t of transactions) {
    const rate = rateFor(t.currency, fxRates);
    if (rate === null) {
      totals.fxMissingCount++;
      continue;
    }
    if (!countsInTotals(t)) continue;
    const myr = countableAmount(t) * rate;
    if (t.type === "INCOME") totals.income += myr;
    if (t.type === "EXPENSE") totals.expense += myr;
    if (t.type === "INVEST") totals.invest += myr;
    if (t.type === "TRANSFER") totals.transfer += myr;
  }
  return { ...totals, net: totals.income - totals.expense };
}

const LIST_INCLUDE = {
  category: true,
  holding: { select: { name: true, symbol: true } },
} as const;

type ListTx = Awaited<ReturnType<typeof listTransactions>>[number];

function listTransactions(where: Prisma.TransactionWhereInput, take?: number) {
  return prisma.transaction.findMany({
    where,
    include: LIST_INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
}

/** 某月的流水 + 汇总（金额统一折算 MYR；汇率缺失的笔数单独返回，不静默吞掉） */
export async function getMonthCashflow(userId: string, year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const [transactions, fxRates] = await Promise.all([
    listTransactions({ userId, date: { gte: start, lt: end } }),
    prisma.fxRate.findMany(),
  ]);
  return { year, month, ...summarize(transactions, fxRates) };
}

export type SearchFilters = {
  q?: string;
  type?: TxType;
  categoryId?: string;
  /** 现金池（Holding）id，转出、转入侧都算 */
  poolId?: string;
  min?: number;
  max?: number;
  /** YYYY-MM-DD，两端都包含 */
  from?: string;
  to?: string;
};

const TX_TYPES: TxType[] = ["INCOME", "EXPENSE", "INVEST", "TRANSFER"];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// ponytail: 结果上限 500 笔，个人帐够用；真的不够再做分页
const SEARCH_LIMIT = 500;

/** 网址参数 → 搜索条件。没有任何有效条件时回 null（页面照常显示当月） */
export function parseSearchParams(params: Record<string, string | undefined>): SearchFilters | null {
  const f: SearchFilters = {};
  const q = params.q?.trim();
  if (q) f.q = q;
  if (TX_TYPES.includes(params.type as TxType)) f.type = params.type as TxType;
  if (params.cat) f.categoryId = params.cat;
  if (params.pool) f.poolId = params.pool;
  for (const k of ["min", "max"] as const) {
    const n = params[k] ? Number(params[k]) : NaN;
    if (Number.isFinite(n)) f[k] = n;
  }
  for (const k of ["from", "to"] as const) {
    const v = params[k];
    if (v && DAY_RE.test(v) && !Number.isNaN(Date.parse(v))) f[k] = v;
  }
  return Object.keys(f).length > 0 ? f : null;
}

/** 跨月份搜流水（P1-05）。汇总走 summarize，跟月报同一口径 */
export async function searchTransactions(userId: string, f: SearchFilters) {
  const and: Prisma.TransactionWhereInput[] = [{ userId }];
  if (f.type) and.push({ type: f.type });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.poolId) and.push({ OR: [{ cashHoldingId: f.poolId }, { counterCashHoldingId: f.poolId }] });
  if (f.min !== undefined) and.push({ amount: { gte: f.min } });
  if (f.max !== undefined) and.push({ amount: { lte: f.max } });
  if (f.from) and.push({ date: { gte: new Date(`${f.from}T00:00:00.000Z`) } });
  if (f.to) {
    const end = new Date(`${f.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    and.push({ date: { lt: end } });
  }
  if (f.q) {
    // SQLite 的 LIKE 对 ASCII 本来就不分大小写，SHOPEE / shopee 都对得上
    const pool = { OR: [{ name: { contains: f.q } }, { account: { name: { contains: f.q } } }] };
    const or: Prisma.TransactionWhereInput[] = [
      { description: { contains: f.q } },
      { category: { name: { contains: f.q } } },
      { cashHolding: pool },
      { counterCashHolding: pool },
    ];
    const n = Number(f.q);
    // 金额精确比对（容半分钱的浮点误差）：搜 12.5 不该把 125 也拉进来
    if (Number.isFinite(n)) or.push({ amount: { gte: n - 0.005, lte: n + 0.005 } });
    and.push({ OR: or });
  }

  const [transactions, fxRates] = await Promise.all([
    listTransactions({ AND: and }, SEARCH_LIMIT),
    prisma.fxRate.findMany(),
  ]);
  return { ...summarize(transactions, fxRates), truncated: transactions.length === SEARCH_LIMIT };
}

/**
 * 列表 + 汇总的共用部分。月报与搜索结果都走这里 ——
 * 两边各算一套口径，迟早会有「搜出来的支出跟月报对不上」（P0-04）。
 */
function summarize(
  transactions: ListTx[],
  fxRates: { base: string; quote: string; rate: number }[]
) {
  const totals = { income: 0, expense: 0, invest: 0, transfer: 0 };
  const expenseByCategory = new Map<string, number>();
  const incomeByCategory = new Map<string, number>();
  const byDay = new Map<string, { income: number; expense: number }>();
  let fxMissingCount = 0;

  const items = transactions.map((t) => {
    const rate = rateFor(t.currency, fxRates);
    if (rate === null) {
      fxMissingCount++;
    } else if (countsInTotals(t)) {
      // 汇总用净额（支出扣掉垫付），列表仍然显示 amount 全额 —— 对帐单上就是那个数
      const countableMYR = countableAmount(t) * rate;
      if (t.type === "INCOME") {
        totals.income += countableMYR;
        const key = t.category?.name ?? "未分类";
        incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + countableMYR);
      }
      if (t.type === "EXPENSE") {
        totals.expense += countableMYR;
        const key = t.category?.name ?? "未分类";
        expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + countableMYR);
      }
      if (t.type === "INVEST") totals.invest += countableMYR;
      if (t.type === "TRANSFER") totals.transfer += countableMYR;
      if (t.type === "INCOME" || t.type === "EXPENSE") {
        const day = t.date.toISOString().slice(0, 10);
        const d = byDay.get(day) ?? { income: 0, expense: 0 };
        if (t.type === "INCOME") d.income += countableMYR;
        else d.expense += countableMYR;
        byDay.set(day, d);
      }
    }
    return {
      id: t.id,
      date: t.date,
      amount: t.amount,
      currency: t.currency,
      amountMYR: rate !== null ? t.amount * rate : null,
      type: t.type as TxType,
      description: t.description,
      categoryId: t.categoryId,
      categoryName: t.category?.name ?? null,
      holdingId: t.holdingId,
      holdingLabel: t.holding ? (t.holding.symbol ?? t.holding.name) : null,
      units: t.units,
      unitPrice: t.unitPrice,
      cashHoldingId: t.cashHoldingId,
      counterCashHoldingId: t.counterCashHoldingId,
      counterAmount: t.counterAmount,
      reimbursable: t.reimbursable,
      settlesTransactionId: t.settlesTransactionId,
    };
  });

  return {
    items,
    totals: {
      ...totals,
      net: totals.income - totals.expense,
      savingsRate: totals.income > 0 ? (totals.income - totals.expense) / totals.income : null,
    },
    // 列表按日分组时右侧的当天小计，跟上面 totals 同一口径
    byDay: Array.from(byDay.entries())
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => b.date.localeCompare(a.date)),
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
      include: { category: { select: { name: true, countsInTotals: true } } },
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
    if (!countsInTotals(t)) continue;
    const amountMYR = countableAmount(t) * rate;
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

export type OutstandingReimbursement = {
  id: string;
  date: Date;
  description: string;
  categoryName: string | null;
  currency: string;
  /** 这笔支出的总额（含自己那份） */
  amount: number;
  /** 其中垫付出去的部分 */
  reimbursable: number;
  /** 已经收回多少 */
  settled: number;
  /** 还差多少没收回 */
  outstanding: number;
};

/**
 * 还没收清的垫付。
 *
 * 这个清单不是锦上添花：垫付的钱已经从支出统计里扣掉了，如果没有一个地方
 * 盯着它，那笔钱就等于被账本藏起来 —— 既不在支出里，也没人提醒你去要。
 */
export async function listOutstandingReimbursements(
  userId: string
): Promise<OutstandingReimbursement[]> {
  const advances = await prisma.transaction.findMany({
    where: { userId, type: "EXPENSE", reimbursable: { gt: 0 } },
    include: {
      category: { select: { name: true } },
      settledBy: { select: { amount: true } },
    },
    orderBy: { date: "desc" },
  });

  return advances
    .map((t) => {
      const settled = t.settledBy.reduce((sum, s) => sum + s.amount, 0);
      return {
        id: t.id,
        date: t.date,
        description: t.description,
        categoryName: t.category?.name ?? null,
        currency: t.currency,
        amount: t.amount,
        reimbursable: t.reimbursable!,
        settled,
        outstanding: t.reimbursable! - settled,
      };
    })
    // 浮点误差容忍：差不到一分钱就当收清了，不要让 0.0000001 一直挂在清单上
    .filter((r) => r.outstanding > 0.005);
}

/**
 * 分类清单，附带各自被几笔交易用过。
 *
 * 排序刻意维持 type → name，设定页依赖这个顺序。usageCount 是附加资讯，
 * 要按热度排的呼叫端（记一笔的分类药丸）自己排 —— 那里 20+ 个分类按名字排，
 * 最高频的「餐饮」会落在最末尾，记一顿午餐得扫完整面墙。
 */
/**
 * 分类清单，**按真实使用频率排序**（P0-08）。
 *
 * 从前按名字排，于是收入的第一个选项是「还钱」、「工资」排在最后面 ——
 * 那个顺序不对应任何人的使用习惯。每天要点的东西必须排在最前面，
 * 而且每个使用者的顺序都该是他自己的，不是写死的一张表。
 * 同样次数时按名字排，避免顺序在每次查询间跳动。
 */
export async function listCategories(userId: string) {
  const cats = await prisma.category.findMany({
    where: { userId },
    include: { _count: { select: { transactions: true } } },
  });
  return cats
    .map(({ _count, ...c }) => ({ ...c, usageCount: _count.transactions }))
    .sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        b.usageCount - a.usageCount ||
        a.name.localeCompare(b.name, "zh-Hans-CN")
    );
}

/**
 * 设定页的分类更新。只让改名字与「是否计入汇总」，不让改 type：
 * 分类底下的交易已经按 type 归户，中途改型别会让那些交易的收支性质在报表里整批翻转。
 */
export async function updateCategory(
  userId: string,
  id: string,
  input: { name?: string; countsInTotals?: boolean }
) {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat || cat.userId !== userId) throw new Error("分类不存在");

  const name = input.name === undefined ? cat.name : input.name.trim();
  if (!name) throw new Error("分类名不能为空");

  if (name !== cat.name) {
    const dup = await prisma.category.findFirst({
      where: { userId, name, type: cat.type, NOT: { id } },
    });
    if (dup) throw new Error(`已经有同名的「${name}」分类`);
  }

  return prisma.category.update({
    where: { id },
    data: { name, ...(input.countsInTotals === undefined ? {} : { countsInTotals: input.countsInTotals }) },
  });
}

/** 按名称找分类（AI 记账用），找不到就创建 */
export async function ensureCategory(userId: string, name: string, type: TxType) {
  return prisma.category.upsert({
    where: { userId_name_type: { userId, name, type } },
    update: {},
    create: { userId, name, type },
  });
}

