"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatMYR } from "@/lib/format";
import { Button } from "@/components/ui/button";

// PDF 对帐单汇入弹窗：选档案 → 上传解析（/api/cashflow/import/parse）→ 预览列表
// （分类可手动改）→ 确认写入（/api/cashflow/import/confirm）。只在按钮点击后才会挂载，
// 不会在 SSR 阶段渲染，不需要 CashflowManager 那个 mounted 守卫也能安全用 createPortal。

type PreviewRow = {
  date: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  description: string;
  categoryId: string;
  type: string;
  aiSuggested?: boolean;
};
type CategoryOption = { id: string; name: string; type: string };
type Provider = "PBE" | "TNG";

const TYPE_LABEL: Record<string, string> = { EXPENSE: "支出", INCOME: "收入", INVEST: "投资", TRANSFER: "转帐" };
const PROVIDER_LABEL: Record<Provider, string> = { PBE: "Public Bank (PBE)", TNG: "TNG 电子钱包" };

export default function PdfImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<"pick" | "preview">("pick");
  const [provider, setProvider] = useState<Provider>("PBE");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [skippedDuplicates, setSkippedDuplicates] = useState(0);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("provider", provider);
      if (password) fd.append("password", password);
      const res = await fetch("/api/cashflow/import/parse", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "解析失败");
      setFileName(data.fileName);
      setWarnings(data.warnings ?? []);
      setSkippedDuplicates(data.skippedDuplicates ?? 0);
      setRows(data.rows);
      setCategories(data.categories);
      setStage("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateCategory(index: number, categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId);
    if (!cat) return;
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, categoryId, type: cat.type, aiSuggested: false } : r))
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cashflow/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          rows: rows.map((r) => ({ date: r.date, amount: r.amount, categoryId: r.categoryId, description: r.description })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "汇入失败");
      router.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && onClose()}>
      <div
        className="card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-line px-6 pt-6 pb-4">
          <div className="text-sm font-medium text-ink">汇入 PDF 对帐单</div>
          <div className="mt-1 text-xs text-ink-muted">目前支援 Public Bank (PBE) 网银对帐单 / TNG 电子钱包交易记录</div>
        </div>

        {stage === "pick" && (
          <div className="flex flex-col gap-3 px-6 py-6">
            <div className="flex rounded-full border border-line p-0.5">
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={busy}
                  onClick={() => setProvider(p)}
                  className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    provider === p ? "bg-portfolio-accent text-primary-foreground" : "text-ink-secondary hover:text-ink"
                  }`}
                >
                  {PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
            {provider === "TNG" && (
              <input
                type="password"
                placeholder="PDF 密码（如果有加密）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
            )}
            <input
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="text-sm text-ink"
            />
            {busy && <div className="text-xs text-ink-muted">解析中…</div>}
          </div>
        )}

        {stage === "preview" && (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-3 text-xs text-ink-muted">
              {fileName} · 共 {rows.length} 笔
              {skippedDuplicates > 0 && `（已自动排除 ${skippedDuplicates} 笔重复交易，之前汇入过了）`}
            </div>
            {warnings.length > 0 && (
              <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
                解析时有 {warnings.length} 项提醒，建议汇入后核对余额：
                <ul className="mt-1 list-disc pl-4">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-col divide-y divide-line">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 shrink-0 text-xs text-ink-muted tabular-nums">{r.date.slice(5, 10)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-secondary" title={r.description}>
                    {r.description}
                  </span>
                  <span
                    className={`shrink-0 text-sm font-medium tabular-nums ${r.direction === "CREDIT" ? "text-good" : "text-ink"}`}
                  >
                    {r.direction === "CREDIT" ? "+" : "−"}
                    {formatMYR(r.amount)}
                  </span>
                  {r.aiSuggested && (
                    <span
                      className="shrink-0 rounded-full bg-ai-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-ai-accent"
                      title="关键字规则没抓到，这是 AI 猜的分类，请核对一下"
                    >
                      AI
                    </span>
                  )}
                  <select
                    value={r.categoryId}
                    onChange={(e) => updateCategory(i, e.target.value)}
                    className="shrink-0 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {TYPE_LABEL[c.type] ?? c.type} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t border-line px-6 py-4">
          {error && <div className="mb-3 text-sm text-critical">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              取消
            </Button>
            {stage === "preview" && (
              <Button disabled={busy || rows.length === 0} onClick={confirm}>
                {busy ? "汇入中…" : `确认汇入 ${rows.length} 笔`}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
