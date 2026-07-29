"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// 总览页的「更新报价」入口。/api/refresh-prices 一直存在但没有 UI 触发点，
// 所以持仓价格只能靠手改或跑脚本——这个按钮补上那个缺口。
// 刷完呼叫 router.refresh() 让 server component 重新取数，不做本地 state 同步。

function formatAgo(iso: string | null): string {
  if (!iso) return "尚未更新过";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "尚未更新过";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "刚刚更新";
  if (mins < 60) return `${mins} 分钟前更新`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前更新`;
  return `${Math.floor(hours / 24)} 天前更新`;
}

export default function RefreshPricesButton({ lastPriceAt }: { lastPriceAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/refresh-prices", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 单一 symbol 抓不到不算整体失败——行情来源本来就允许降级，只提示有几笔没成功
      const failed = (data.prices ?? []).filter((p: { error?: string }) => p.error).length;
      if (failed > 0) setError(`${failed} 笔报价没抓到，其余已更新`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={run} disabled={busy}>
        {busy ? "更新中…" : "更新报价"}
      </Button>
      <span className="text-xs text-ink-secondary">
        {error ?? formatAgo(lastPriceAt)}
      </span>
    </div>
  );
}
