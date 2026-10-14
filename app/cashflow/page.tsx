import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  getMonthCashflow,
  getYearCashflow,
  listCategories,
  listOutstandingReimbursements,
  parseSearchParams,
  searchTransactions,
} from "@/lib/transactions";
import { formatMYR, formatShare } from "@/lib/format";
import Value from "@/components/Value";
import DonutChart from "@/components/DonutChart";
import CashflowManager from "@/components/CashflowManager";
import CashflowSearch from "@/components/CashflowSearch";
import CashBalanceCards from "@/components/CashBalanceCards";
import OutstandingReimbursements from "@/components/OutstandingReimbursements";
import { getCashPools, pickDefaultCashPool } from "@/lib/cashBalance";
import IncomeExpenseChart from "@/components/IncomeExpenseChart";
import YearlyCashflowTable from "@/components/YearlyCashflowTable";

// 支出分类圆环的颜色轮换（分类数量不定，固定色序循环）。
// 原本第 5、6 位是 --critical 与 --ink-muted：前者让「旅游」这种中性分类被画成亏损红，
// 后者让一个分类看起来像被停用。分类色一律从 series 取。
const DONUT_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const now = new Date();
  const [yStr, mStr] = (params.m ?? monthKey(now.getFullYear(), now.getMonth() + 1)).split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const filters = parseSearchParams(params);

  const [cashflow, yearData, categories, holdings, accounts, cashPools, outstanding, search] = await Promise.all([
    getMonthCashflow(userId, year, month),
    getYearCashflow(userId, year),
    listCategories(userId),
    prisma.holding.findMany({
      where: { account: { userId } },
      select: {
        id: true,
        name: true,
        symbol: true,
        assetType: true,
        currency: true,
        lastPrice: true,
        costBasis: true,
      },
      orderBy: { name: "asc" },
    }),
    // 投资表单要能就地建目标持仓，不然使用者得跳去持仓页再回来
    prisma.account.findMany({
      where: { userId },
      // type / institution 是现金池编辑表单要的（HoldingFormModal 的 Account 形状）
      select: { id: true, name: true, currency: true, type: true, institution: true },
      orderBy: { name: "asc" },
    }),
    getCashPools(userId),
    listOutstandingReimbursements(userId),
    filters ? searchTransactions(userId, filters) : null,
  ]);

  // 有实际数据的月份数。少于 3 个月就不画年度对比图 ——
  // 12 个月的横轴配一两根柱子看起来像坏了，而下面的年度表格已经把同样的数说清楚。
  const monthsWithData = yearData.months.filter(
    (m) => m.income !== 0 || m.expense !== 0 || m.invest !== 0
  ).length;

  const prev = month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1);
  const next = month === 12 ? monthKey(year + 1, 1) : monthKey(year, month + 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  const donutSegments = cashflow.expenseByCategory.map((c, i) => ({
    key: c.name,
    label: c.name,
    valueMYR: c.valueMYR,
    pct: cashflow.totals.expense > 0 ? c.valueMYR / cashflow.totals.expense : 0,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const incomeDonutSegments = cashflow.incomeByCategory.map((c, i) => ({
    key: c.name,
    label: c.name,
    valueMYR: c.valueMYR,
    pct: cashflow.totals.income > 0 ? c.valueMYR / cashflow.totals.income : 0,
    color: DONUT_COLORS[i % DONUT_COLORS.length],
  }));

  const stats = [
    { label: "收入", value: cashflow.totals.income, cls: "text-good" },
    { label: "支出", value: cashflow.totals.expense, cls: "text-ink" },
  ];

  const header = (
    <div className="animate-in">
      <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">Cashflow</div>
      <h1 className="mt-1 text-3xl font-semibold text-ink">收支记录</h1>
    </div>
  );
  const listProps = {
    categories,
    holdings,
    accounts,
    outstanding,
    defaultCashHoldingId: pickDefaultCashPool(cashPools),
  };
  const searchBar = <CashflowSearch filters={filters} categories={categories} pools={cashPools} />;

  // 搜索模式（P1-05）：跨月份的结果取代当月内容，月份切换 / 图表 / 余额在这里都不相关
  if (search) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {searchBar}
        <div className="card p-4 text-sm text-ink-secondary">
          找到 <span className="font-medium text-ink">{search.items.length}</span> 笔
          {search.truncated && "（只显示最新 500 笔，请加条件缩小范围）"}
          <span className="ml-3 font-mono tabular-nums">
            支出 {formatMYR(search.totals.expense)} · 收入 <span className="text-good">{formatMYR(search.totals.income)}</span>
          </span>
        </div>
        <CashflowManager
          searching
          items={search.items.map((t) => ({ ...t, date: t.date.toISOString() }))}
          dayTotals={search.byDay}
          {...listProps}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {header}

      {/* P1-03 层级：月份切换 + 汇总 → 流水（按日分组）→ 户口余额 chips → 其余分析。
          预算进度本该在汇总与流水之间，等 Monthly Budget（P2，要 schema）做了再插进来 */}
      <div className="card animate-in p-6">
        <div className="flex items-center justify-between">
          <Link href={`/cashflow?m=${prev}`} className="rounded-md px-2 py-1 text-sm text-ink-secondary hover:bg-page hover:text-ink">←</Link>
          <div className="text-sm font-medium text-ink">
            {year} 年 {month} 月{isCurrentMonth && <span className="ml-1.5 text-xs text-ink-muted">本月</span>}
          </div>
          <Link href={`/cashflow?m=${next}`} className="rounded-md px-2 py-1 text-sm text-ink-secondary hover:bg-page hover:text-ink">→</Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-xs text-ink-muted">{s.label}</div>
              <div className={`mt-1 text-lg font-medium font-mono tabular-nums ${s.cls}`}>{formatMYR(s.value, true)}</div>
            </div>
          ))}
          <div className="text-center">
            <div className="text-xs text-ink-muted">结余（收入−支出）</div>
            <div className="mt-1 text-lg font-medium">
              <Value value={cashflow.totals.net} kind="currency-compact" colorizeSign />
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-ink-muted">储蓄率</div>
            <div className="mt-1 text-lg font-medium font-mono tabular-nums text-ink">
              {cashflow.totals.savingsRate === null ? "—" : formatShare(cashflow.totals.savingsRate)}
            </div>
          </div>
        </div>
        {cashflow.totals.invest > 0 && (
          <div className="mt-3 text-center text-xs text-ink-muted">
            另有投资转出 <span className="font-mono tabular-nums text-portfolio-accent-deep">{formatMYR(cashflow.totals.invest)}</span>，不算支出
          </div>
        )}
        {cashflow.fxMissingCount > 0 && (
          <div className="mt-3 text-xs text-warning">
            有 {cashflow.fxMissingCount} 笔非 MYR 记录因缺汇率未计入汇总
          </div>
        )}
      </div>

      {/* 流水：按日分组，每组右侧当天小计 */}
      <div className="animate-in flex flex-col gap-4">
        {searchBar}
        <CashflowManager
          items={cashflow.items.map((t) => ({ ...t, date: t.date.toISOString() }))}
          dayTotals={cashflow.byDay}
          autoImport={params.import === "1"}
          {...listProps}
        />
      </div>

      <CashBalanceCards pools={cashPools} accounts={accounts} />

      {/* 垫出去的钱不在余额里、也不在支出里，这是它唯一的落脚处 */}
      <OutstandingReimbursements items={outstanding} />

      {/* 分析类放最后：先看流水，要细看再往下 */}
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="animate-in">
          <div className="card p-6">
            <div className="mb-5 text-sm font-medium text-ink">本月支出分类</div>
            {donutSegments.length > 0 ? (
              <DonutChart
                segments={donutSegments}
                centerLabel="支出"
                centerValue={formatMYR(cashflow.totals.expense, true)}
              />
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-ink-muted">
                本月还没有支出记录
              </div>
            )}
          </div>
        </div>

        <div className="animate-in">
          <div className="card p-6">
            <div className="mb-5 text-sm font-medium text-ink">本月收入分类</div>
            {incomeDonutSegments.length > 1 ? (
              <DonutChart
                segments={incomeDonutSegments}
                centerLabel="收入"
                centerValue={formatMYR(cashflow.totals.income, true)}
              />
            ) : incomeDonutSegments.length === 1 ? (
              // 只有一个分类时不画圆环 —— 一个 100% 的完整圆环不携带任何信息，
              // 却占掉整整半个面板。退化成一行，把空间还给页面。
              <div className="flex items-baseline justify-between">
                <span className="flex items-center gap-2 text-sm text-ink">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: incomeDonutSegments[0].color }}
                  />
                  {incomeDonutSegments[0].label}
                </span>
                <span className="font-mono text-sm text-ink tabular-nums">
                  {formatMYR(cashflow.totals.income)}
                </span>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-ink-muted">
                本月还没有收入记录
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card animate-in p-6">
        <div className="mb-5 text-sm font-medium text-ink">{year} 年收支对比</div>
        {monthsWithData >= 3 && <IncomeExpenseChart months={yearData.months} />}
        <div className="mt-6 border-t border-line pt-5">
          <YearlyCashflowTable
            months={yearData.months}
            totals={yearData.totals}
            currentMonth={year === now.getFullYear() ? now.getMonth() + 1 : null}
          />
        </div>
      </div>

    </div>
  );
}
