import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getMonthCashflow, getYearCashflow, listCategories } from "@/lib/transactions";
import { formatMYR } from "@/lib/format";
import Value from "@/components/Value";
import DonutChart from "@/components/DonutChart";
import CashflowManager from "@/components/CashflowManager";
import IncomeExpenseChart from "@/components/IncomeExpenseChart";
import YearlyCashflowTable from "@/components/YearlyCashflowTable";

// 支出分类圆环的颜色轮换（分类数量不定，固定色序循环）
const DONUT_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--critical)",
  "var(--ink-muted)",
];

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; add?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const params = await searchParams;
  const now = new Date();
  const [yStr, mStr] = (params.m ?? monthKey(now.getFullYear(), now.getMonth() + 1)).split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  const [cashflow, yearData, categories, holdings, accounts] = await Promise.all([
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
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
    { label: "投资", value: cashflow.totals.invest, cls: "text-portfolio-accent-deep" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">Cashflow</div>
        <h1 className="mt-1 text-3xl font-semibold text-ink">收支记录</h1>
      </div>

      {/* 月份切换 + 四格汇总 */}
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
              <div className={`mt-1 text-lg font-medium tabular-nums ${s.cls}`}>{formatMYR(s.value, true)}</div>
            </div>
          ))}
          <div className="text-center">
            <div className="text-xs text-ink-muted">结余（收入−支出）</div>
            <div className="mt-1 text-lg font-medium">
              <Value value={cashflow.totals.net} kind="currency-compact" colorizeSign />
            </div>
          </div>
        </div>
        {cashflow.fxMissingCount > 0 && (
          <div className="mt-3 text-xs text-warning">
            有 {cashflow.fxMissingCount} 笔非 MYR 记录因缺汇率未计入汇总
          </div>
        )}
      </div>

      {/* 图表放前面：交易列表笔数一多会把图表推到最下面，要滚很久才看得到 */}
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
            {incomeDonutSegments.length > 0 ? (
              <DonutChart
                segments={incomeDonutSegments}
                centerLabel="收入"
                centerValue={formatMYR(cashflow.totals.income, true)}
              />
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
        <IncomeExpenseChart months={yearData.months} />
        <div className="mt-6 border-t border-line pt-5">
          <YearlyCashflowTable
            months={yearData.months}
            totals={yearData.totals}
            currentMonth={year === now.getFullYear() ? now.getMonth() + 1 : null}
          />
        </div>
      </div>

      {/* 流水 + 记一笔 */}
      <div className="animate-in">
        <CashflowManager
          items={cashflow.items.map((t) => ({ ...t, date: t.date.toISOString() }))}
          categories={categories}
          holdings={holdings}
          accounts={accounts}
          autoOpen={params.add === "1"}
        />
      </div>
    </div>
  );
}
