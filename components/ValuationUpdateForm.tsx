"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  name: string;
  accountName: string;
  valuation: string;
  currency: string;
  quantity: number;
  lastPrice: number | null;
  lastDate: string | null;
  daysAgo: number | null;
};

// 超过这个天数就标黄。抓 30 天是因为 Public Mutual 的 NAV 每日变动，
// 一个月不更新，净值曲线上那笔资产已经是一条明显失真的水平线了。
const STALE_DAYS = 30;

export default function ValuationUpdateForm({ rows, today }: { rows: Row[]; today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const filled = Object.entries(inputs).filter(([, v]) => v.trim() !== "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(null);

    const entries = filled.map(([holdingId, v]) => ({ holdingId, price: Number(v) }));
    const bad = entries.find((x) => !Number.isFinite(x.price) || x.price <= 0);
    if (bad) {
      setError("价格要是大于 0 的数字");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/holding-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, entries }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "储存失败");
        setSaving(false);
        return;
      }
      setSaved(data.saved);
      setInputs({});
      router.refresh();
    } catch {
      setError("网络错误，储存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm sm:w-56">
        <span className="text-ink-muted">估值日期</span>
        <input
          type="date"
          required
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ink"
        />
        <span className="text-xs text-ink-muted">
          可以改成过去的日期补录，历史净值会跟着修正。
        </span>
      </label>

      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const stale = r.daysAgo === null || r.daysAgo > STALE_DAYS;
          return (
            <div
              key={r.id}
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {r.accountName} ·{" "}
                  {r.valuation === "MANUAL_VALUE"
                    ? "总市值"
                    : `每单位 · ${r.quantity.toLocaleString()} 份`}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right text-xs">
                  {r.lastDate ? (
                    <>
                      <div className="font-mono tabular-nums text-ink-secondary">
                        {r.lastPrice?.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 4,
                        })}{" "}
                        {r.currency}
                      </div>
                      <div className={stale ? "text-amber-600 dark:text-amber-500" : "text-ink-muted"}>
                        {r.lastDate}（{r.daysAgo} 天前）
                      </div>
                    </>
                  ) : (
                    <div className="text-amber-600 dark:text-amber-500">从未估值</div>
                  )}
                </div>

                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  placeholder={r.valuation === "MANUAL_VALUE" ? "总市值" : "单价"}
                  value={inputs[r.id] ?? ""}
                  onChange={(e) => setInputs((s) => ({ ...s, [r.id]: e.target.value }))}
                  className="w-28 rounded-md border border-line bg-page px-3 py-2 text-right text-sm text-ink font-mono tabular-nums outline-none focus:border-ink"
                />
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved !== null && (
        <p className="text-sm text-emerald-600 dark:text-emerald-500">
          已更新 {saved} 笔估值。
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || filled.length === 0}
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-page disabled:opacity-50"
        >
          {saving ? "储存中…" : `提交 ${filled.length} 笔`}
        </button>
        <span className="text-xs text-ink-muted">留空的持仓不会被更动</span>
      </div>
    </form>
  );
}
