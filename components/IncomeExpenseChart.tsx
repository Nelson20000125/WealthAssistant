import { formatMYR } from "@/lib/format";

// 12 个月收入 vs 支出对比柱状图。纯 SVG 服务端渲染，无依赖。

type MonthRow = { month: number; income: number; expense: number };

const W = 720;
const H = 200;
const PAD_BOTTOM = 22;
const PAD_TOP = 8;

export default function IncomeExpenseChart({ months }: { months: MonthRow[] }) {
  const max = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1);
  const slot = W / 12;
  const barW = slot * 0.28;
  const chartH = H - PAD_BOTTOM - PAD_TOP;
  const y = (v: number) => PAD_TOP + chartH - (v / max) * chartH;

  const hasData = months.some((m) => m.income > 0 || m.expense > 0);
  if (!hasData) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-ink-muted">
        今年还没有收支数据
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 基线 */}
        <line x1="0" y1={H - PAD_BOTTOM} x2={W} y2={H - PAD_BOTTOM} stroke="var(--line)" strokeWidth="1" />
        {months.map((m, i) => {
          const cx = i * slot + slot / 2;
          return (
            <g key={m.month}>
              {m.income > 0 && (
                <rect
                  x={cx - barW - 1.5}
                  y={y(m.income)}
                  width={barW}
                  height={H - PAD_BOTTOM - y(m.income)}
                  rx="2"
                  fill="var(--good)"
                  opacity="0.85"
                >
                  <title>{`${m.month}月收入 ${formatMYR(m.income)}`}</title>
                </rect>
              )}
              {m.expense > 0 && (
                <rect
                  x={cx + 1.5}
                  y={y(m.expense)}
                  width={barW}
                  height={H - PAD_BOTTOM - y(m.expense)}
                  rx="2"
                  fill="var(--critical)"
                  opacity="0.85"
                >
                  <title>{`${m.month}月支出 ${formatMYR(m.expense)}`}</title>
                </rect>
              )}
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fontSize="11"
                fill="var(--ink-muted)"
              >
                {m.month}月
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-center gap-4 text-xs text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--good)" }} />
          收入
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--critical)" }} />
          支出
        </span>
      </div>
    </div>
  );
}
