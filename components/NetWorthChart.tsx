"use client";

import { useRef, useState } from "react";
import { formatMYR } from "@/lib/format";
import Value from "@/components/Value";

// 跟 lib/portfolio.ts 的 getNetWorthHistory 返回值对应（Date 已序列化成 ISO 字符串）。
// 不直接 import 那边的类型：lib/portfolio.ts 引了 prisma，client bundle 不能碰。
export type HistoryPoint = {
  date: string;
  netWorthMYR: number;
  plMYR: number;
  plPct: number;
};

export type History = {
  range: string;
  points: HistoryPoint[];
  changeMYR: number | null;
  changePct: number | null;
};

const RANGES = ["1M", "3M", "YTD", "1Y", "MAX"] as const;

// SVG 画布逻辑尺寸（viewBox），实际渲染宽度自适应容器
const W = 600;
const H = 160;
const PAD_Y = 10;

function buildPaths(points: HistoryPoint[]) {
  const values = points.map((p) => p.netWorthMYR);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.abs(max) * 0.02 || 1; // 全部同值时给一点假的纵向空间
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.netWorthMYR).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  return { line, area, x, y };
}

export default function NetWorthChart({ initial }: { initial: History | null }) {
  const [history, setHistory] = useState<History | null>(initial);
  const [range, setRange] = useState<string>(initial?.range ?? "MAX");
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  async function selectRange(r: string) {
    if (r === range || loading) return;
    setRange(r);
    setLoading(true);
    setHoverIdx(null);
    try {
      const res = await fetch(`/api/history?range=${r}`);
      if (res.ok) setHistory(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const points = history?.points ?? [];
  const hasChart = points.length >= 2;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!hasChart || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  }

  const paths = hasChart ? buildPaths(points) : null;
  const hover = hoverIdx !== null && paths ? points[hoverIdx] : null;

  return (
    <div>
      {/* 图表区 */}
      <div className="relative mt-6 h-40">
        {hasChart && paths ? (
          <>
            {hover && (
              <div className="pointer-events-none absolute -top-1 left-0 right-0 text-center text-xs text-ink-secondary font-mono tabular-nums">
                {hover.date.slice(0, 10)} · {formatMYR(hover.netWorthMYR)}
              </div>
            )}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-full w-full"
              onMouseMove={onMove}
              onMouseLeave={() => setHoverIdx(null)}
            >
              <defs>
                <linearGradient id="nw-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--portfolio-accent)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="var(--portfolio-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={paths.area} fill="url(#nw-fill)" />
              <path
                d={paths.line}
                fill="none"
                stroke="var(--portfolio-accent-deep)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {hoverIdx !== null && (
                <circle
                  cx={paths.x(hoverIdx)}
                  cy={paths.y(points[hoverIdx].netWorthMYR)}
                  r="4"
                  fill="var(--portfolio-accent-deep)"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-center">
            <div className="text-sm text-ink-secondary">净值曲线积累中</div>
            <div className="text-xs text-ink-muted">
              {history
                ? `每天刷新一次价格就会多一个数据点（目前 ${points.length} 条）`
                : "历史数据暂不可用，试试重新整理或先跑一次 npx prisma generate"}
            </div>
          </div>
        )}
      </div>

      {/* 区间 chips + 区间涨跌，Ghostfolio 式摆在图下方 */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => selectRange(r)}
            disabled={loading}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 ${
              range === r
                ? "bg-portfolio-accent text-primary-foreground"
                : "border border-line text-ink-secondary hover:bg-page hover:text-ink"
            }`}
          >
            {r}
          </button>
        ))}
        {history?.changeMYR !== null && history?.changeMYR !== undefined && (
          <span className="ml-2 text-xs text-ink-secondary">
            区间 <Value value={history.changeMYR} colorizeSign className="font-medium" />{" "}
            (<Value value={history.changePct} kind="percent" colorizeSign className="font-medium" />)
          </span>
        )}
      </div>
    </div>
  );
}
