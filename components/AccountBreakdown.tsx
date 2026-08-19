"use client";

import { useEffect, useState } from "react";
import { formatMYR, formatShare } from "@/lib/format";
import { BankIcon, WalletIcon } from "@/components/icons";

// 最后两位原本是硬编码 hex（#8a5cf6 / #e0578a）—— 那两个值不跟随深浅主题，
// 也不在 token 体系内。改版计划的验收项就写着「无硬编码颜色残留」。
const PALETTE = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

function iconFor(name: string) {
  return /bank|银行/i.test(name) ? BankIcon : WalletIcon;
}

export default function AccountBreakdown({
  accounts,
}: {
  accounts: { accountName: string; valueMYR: number; pct: number }[];
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const sorted = [...accounts].sort((a, b) => b.valueMYR - a.valueMYR);
  const max = sorted.length > 0 ? sorted[0].valueMYR : 1;

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((a, i) => {
        const Icon = iconFor(a.accountName);
        const color = PALETTE[i % PALETTE.length];
        const widthPct = Math.max((a.valueMYR / max) * 100, 3);
        return (
          <div key={a.accountName} className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <div className="truncate text-sm text-ink">{a.accountName}</div>
                <div className="shrink-0 text-xs text-ink-muted">{formatShare(a.pct)}</div>
              </div>
              <div className="mt-0.5 text-sm font-medium text-ink font-mono tabular-nums">{formatMYR(a.valueMYR)}</div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-page">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: mounted ? `${widthPct}%` : "0%",
                    background: color,
                    transition: "width 500ms ease-out",
                    transitionDelay: `${i * 40}ms`,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
