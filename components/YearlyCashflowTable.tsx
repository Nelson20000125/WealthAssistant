import Value from "@/components/Value";

// 年度明细表：每月收入/支出/投资/结余 + 最大消费分类。
// 支出最高的月份整行加背景高亮，一眼看出哪个月花最多、花在哪。

type MonthRow = {
  month: number;
  income: number;
  expense: number;
  invest: number;
  net: number;
  topExpenseCategory: string | null;
};

export default function YearlyCashflowTable({
  months,
  totals,
  currentMonth,
}: {
  months: MonthRow[];
  totals: { income: number; expense: number; invest: number };
  currentMonth: number | null;
}) {
  const maxExpense = Math.max(...months.map((m) => m.expense));
  const active = months.filter((m) => m.income > 0 || m.expense > 0 || m.invest > 0);

  if (active.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
        今年还没有数据，记账后这里会逐月累积
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th className="px-3 py-2 font-medium">月份</th>
            <th className="px-3 py-2 text-right font-medium">收入</th>
            <th className="px-3 py-2 text-right font-medium">支出</th>
            <th className="px-3 py-2 text-right font-medium">投资</th>
            <th className="px-3 py-2 text-right font-medium">结余</th>
            <th className="px-3 py-2 text-right font-medium">最大消费</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => {
            const isMax = m.expense > 0 && m.expense === maxExpense;
            const isCurrent = m.month === currentMonth;
            const isEmpty = m.income === 0 && m.expense === 0 && m.invest === 0;
            // 结余 = 收入 − 支出，跟投资无关。没有任何收支记录的月份，那个差是
            // 「没记账」而不是「刚好持平」—— 显示 RM 0.00 会被读成后者。
            // 这台机器上 7 月就是这种情况：有真实的投资回填，但收支从 8 月才开始记。
            const noBookkeeping = m.income === 0 && m.expense === 0;
            return (
              <tr
                key={m.month}
                className={`border-b border-line last:border-0 ${isEmpty ? "opacity-40" : ""}`}
                style={isMax ? { background: "color-mix(in srgb, var(--critical) 7%, transparent)" } : undefined}
              >
                <td className="px-3 py-2 text-ink">
                  {m.month}月
                  {isCurrent && <span className="ml-1.5 text-xs text-portfolio-accent-deep">本月</span>}
                  {isMax && <span className="ml-1.5 text-xs text-critical">花最多</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.income > 0 ? <Value value={m.income} className="text-good" /> : <span className="text-ink-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.expense > 0 ? <Value value={m.expense} className="text-ink" /> : <span className="text-ink-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {m.invest > 0 ? <Value value={m.invest} className="text-portfolio-accent-deep" /> : <span className="text-ink-muted">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {noBookkeeping ? <span className="text-ink-muted">—</span> : <Value value={m.net} colorizeSign />}
                </td>
                <td className="px-3 py-2 text-right text-xs text-ink-secondary">
                  {m.topExpenseCategory ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-medium">
            <td className="px-3 py-2 text-ink">全年</td>
            <td className="px-3 py-2 text-right"><Value value={totals.income} className="text-good" /></td>
            <td className="px-3 py-2 text-right"><Value value={totals.expense} className="text-ink" /></td>
            <td className="px-3 py-2 text-right"><Value value={totals.invest} className="text-portfolio-accent-deep" /></td>
            <td className="px-3 py-2 text-right"><Value value={totals.income - totals.expense} colorizeSign /></td>
            <td className="px-3 py-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
