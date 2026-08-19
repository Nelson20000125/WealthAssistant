"use client";

import { useEffect, useState } from "react";
import { formatMYR, formatShare } from "@/lib/format";
import { AssetIcon } from "@/components/icons";

type Segment = { key: string; label: string; valueMYR: number; pct: number; color: string };

const R = 60;
const STROKE = 22;
const CIRC = 2 * Math.PI * R;

export default function DonutChart({
  segments,
  centerLabel,
  centerValue,
}: {
  segments: Segment[];
  centerLabel: string;
  centerValue: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const sorted = [...segments].sort((a, b) => b.valueMYR - a.valueMYR);

  const arcs = sorted.reduce<{ cumulative: number; items: (Segment & { dashArray: string; offset: number })[] }>(
    (acc, s) => {
      const len = s.pct * CIRC;
      const dashArray = `${Math.max(len - 1.5, 0)} ${CIRC - Math.max(len - 1.5, 0)}`;
      const offset = -acc.cumulative;
      return { cumulative: acc.cumulative + len, items: [...acc.items, { ...s, dashArray, offset }] };
    },
    { cumulative: 0, items: [] }
  ).items;

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      {/* 尺寸随容器走，不再钉死 152px。原本固定尺寸的后果是：在 1152px 宽的卡片里
          圆环小得配不上它的地位，缩到手机宽度时又不跟着缩。上下限保证极端容器下仍可读。 */}
      <div className="relative aspect-square w-full max-w-[240px] min-w-[132px] shrink-0 sm:w-[38%]">
        <svg viewBox="0 0 144 144" className="h-full w-full -rotate-90">
          <circle cx="72" cy="72" r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
          {arcs.map((a, i) => (
            <circle
              key={a.key}
              cx="72"
              cy="72"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={mounted ? a.dashArray : `0 ${CIRC}`}
              strokeDashoffset={a.offset}
              strokeLinecap="butt"
              style={{
                transition: "stroke-dasharray 700ms ease-out",
                transitionDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[11px] text-ink-muted">{centerLabel}</div>
          <div className="mt-0.5 text-lg font-semibold text-ink">{centerValue}</div>
        </div>
      </div>

      <div className="flex min-w-[168px] flex-1 flex-col gap-3">
        {sorted.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${s.color} 16%, transparent)`, color: s.color }}
            >
              <AssetIcon assetType={s.key} className="h-3.5 w-3.5" />
            </span>
            <div className="flex flex-1 items-baseline justify-between gap-3">
              <span className="whitespace-nowrap text-sm text-ink-secondary">{s.label}</span>
              <span className="whitespace-nowrap text-sm font-medium text-ink font-mono tabular-nums">
                {formatShare(s.pct)} · {formatMYR(s.valueMYR, true)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
