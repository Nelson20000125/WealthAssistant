"use client";

import { useEffect, useState } from "react";
import { formatShare } from "@/lib/format";

type Segment = { assetType: string; valueMYR: number; pct: number };

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
};

// 固定顺序的分类色票（dataviz skill：categorical hue 固定顺序，不能循环乱用）
const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
};

export default function AllocationBar({ segments }: { segments: Segment[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const sorted = [...segments].sort((a, b) => b.valueMYR - a.valueMYR);

  return (
    <div>
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {sorted.map((s, i) => (
          <div
            key={s.assetType}
            style={{
              width: mounted ? `${s.pct * 100}%` : "0%",
              background: ASSET_TYPE_COLOR[s.assetType] ?? "var(--ink-muted)",
              transition: "width 500ms ease-out",
              transitionDelay: `${i * 40}ms`,
            }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {sorted.map((s) => (
          <div key={s.assetType} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: ASSET_TYPE_COLOR[s.assetType] ?? "var(--ink-muted)" }}
            />
            <span className="text-ink-secondary">
              {ASSET_TYPE_LABEL[s.assetType] ?? s.assetType}
            </span>
            <span className="font-medium text-ink">{formatShare(s.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
