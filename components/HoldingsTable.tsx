"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMYR, formatShare, formatQuantity } from "@/lib/format";
import { AssetIcon } from "@/components/icons";
import HoldingFormModal, { type HoldingFormValues } from "@/components/HoldingFormModal";
import { Button } from "@/components/ui/button";
import Value from "@/components/Value";

const ASSET_TYPE_LABEL: Record<string, string> = {
  ETF: "股票/ETF",
  STOCK: "股票/ETF",
  FUND: "基金",
  CASH: "现金",
  CRYPTO: "加密货币",
};

const ASSET_TYPE_COLOR: Record<string, string> = {
  ETF: "var(--series-1)",
  STOCK: "var(--series-1)",
  FUND: "var(--series-2)",
  CASH: "var(--series-3)",
  CRYPTO: "var(--series-4)",
};

type Account = { id: string; name: string; type: string; institution: string; currency: string };

type Holding = {
  id: string;
  accountId: string;
  accountName: string;
  assetType: string;
  valuation: string;
  symbol: string | null;
  name: string;
  quantity: number;
  costBasis: number;
  currency: string;
  unitPrice: number;
  valueMYR: number | null;
  costValueMYR: number | null;
  /** 手动估值型但一笔价都没填过 —— 盈亏恒为 0，要标出来而不是冒充持平 */
  needsValuation?: boolean;
  derivedBalance?: number;
  isDerivedCash?: boolean;
  openingBalance?: number | null;
  openingBalanceDate?: Date | string | null;
};

const EMPTY_FORM: HoldingFormValues = {
  accountId: "",
  assetType: "STOCK",
  valuation: "AUTO",
  name: "",
  symbol: "",
  quantity: "",
  costBasis: "",
  currency: "",
};

// 现金不出现在这张表里（归收支页管），所以不需要期初余额那组栏位
function toFormValues(h: Holding): HoldingFormValues {
  return {
    id: h.id,
    accountId: h.accountId,
    assetType: h.assetType,
    valuation: h.valuation,
    name: h.name,
    symbol: h.symbol ?? "",
    quantity: String(h.quantity),
    costBasis: String(h.costBasis),
    currency: h.currency,
  };
}

export default function HoldingsTable({
  holdings,
  totalMYR,
  accounts,
}: {
  holdings: Holding[];
  /** 占比的分母：投资总额（不含现金） */
  totalMYR: number;
  accounts: Account[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; values: HoldingFormValues } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyDeleteId, setBusyDeleteId] = useState<string | null>(null);

  const handleSaved = () => {
    setModal(null);
    router.refresh();
  };

  const handleDelete = async (id: string) => {
    setBusyDeleteId(id);
    await fetch(`/api/holdings/${id}`, { method: "DELETE" });
    setBusyDeleteId(null);
    setDeletingId(null);
    router.refresh();
  };

  // 按资产类型分组，组之间按总值降序。用 label 当 key 而不是 assetType ——
  // STOCK 与 ETF 显示同一个名字，分成两组会让人以为自己重复建了持仓。
  const groups = useMemo(() => {
    const map = new Map<string, Holding[]>();
    for (const h of holdings) {
      const key = ASSET_TYPE_LABEL[h.assetType] ?? h.assetType;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    }
    return Array.from(map.entries())
      .map(([label, items]) => ({
        label,
        assetType: items[0].assetType,
        items: [...items].sort((a, b) => (b.valueMYR ?? 0) - (a.valueMYR ?? 0)),
        totalMYR: items.reduce((sum, h) => sum + (h.valueMYR ?? 0), 0),
      }))
      .sort((a, b) => b.totalMYR - a.totalMYR);
  }, [holdings]);

  // 每列都要算的三个衍生值，表格与手机卡片共用
  const derive = (h: Holding) => ({
    pl: h.valueMYR !== null && h.costValueMYR !== null ? h.valueMYR - h.costValueMYR : null,
    color: ASSET_TYPE_COLOR[h.assetType] ?? "var(--ink-muted)",
    pct: h.valueMYR !== null && totalMYR > 0 ? h.valueMYR / totalMYR : 0,
  });

  // 编辑／删除那组按钮含二次确认状态，表格与卡片两边都要用，抽出来免得写两份
  const rowActions = (h: Holding) =>
    deletingId === h.id ? (
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-ink-muted">确定删除？</span>
        <button type="button" onClick={() => setDeletingId(null)} className="text-ink-secondary hover:text-ink">
          取消
        </button>
        <button
          type="button"
          disabled={busyDeleteId === h.id}
          onClick={() => handleDelete(h.id)}
          style={{ color: "var(--critical)" }}
          className="font-medium disabled:opacity-50"
        >
          {busyDeleteId === h.id ? "删除中…" : "确定"}
        </button>
      </div>
    ) : (
      <div className="flex items-center justify-end gap-3 text-xs">
        <button
          type="button"
          onClick={() => setModal({ mode: "edit", values: toFormValues(h) })}
          className="text-ink-secondary hover:text-ink"
        >
          编辑
        </button>
        <button type="button" onClick={() => setDeletingId(h.id)} className="text-ink-secondary hover:text-ink">
          删除
        </button>
      </div>
    );

  return (
    <>
      <div className="flex justify-end">
        <Button type="button" onClick={() => setModal({ mode: "create", values: EMPTY_FORM })}>
          + 新增持仓
        </Button>
      </div>

      {/* 手机版：八栏表格在小屏只会被裁掉一半，改成一笔一张卡片 */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map((g) => (
          <Fragment key={g.label}>
            <div className="flex items-center gap-2 px-1 pt-2 text-xs font-medium text-ink-secondary">
              <AssetIcon assetType={g.assetType} className="h-3.5 w-3.5" />
              {g.label}
              <span className="font-normal text-ink-muted">{g.items.length} 笔</span>
              <span className="ml-auto font-mono tabular-nums">{formatMYR(g.totalMYR)}</span>
            </div>
            {g.items.map((h) => {
          const { pl, color, pct } = derive(h);
          return (
            <div key={h.id} className="card p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                >
                  <AssetIcon assetType={h.assetType} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{h.name}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                    {h.symbol ? ` · ${h.symbol}` : ""} · {h.accountName}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-end justify-between gap-3 border-t border-line pt-3">
                <div>
                  <div className="text-xs text-ink-muted">现值 (MYR)</div>
                  <div className="text-base font-medium font-mono tabular-nums text-ink">
                    {h.valueMYR !== null ? formatMYR(h.valueMYR) : "汇率缺失"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-ink-muted">损益 (MYR)</div>
                  <div className="text-sm font-medium">
                    {h.needsValuation ? (
                      <span className="text-warning">尚未估值</span>
                    ) : (
                      <Value value={pl} colorizeSign />
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-ink-muted">数量</span>
                  <span className="font-mono tabular-nums text-ink-secondary">{formatQuantity(h.quantity)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-muted">单价</span>
                  <span className="truncate font-mono tabular-nums text-ink-secondary">
                    {h.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })} {h.currency}
                  </span>
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <span className="text-ink-muted">占比</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-page">
                    <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
                  </span>
                  <span className="font-mono tabular-nums text-ink-secondary">{formatShare(pct)}</span>
                </div>
              </div>

              <div className="mt-3 border-t border-line pt-3">{rowActions(h)}</div>
            </div>
          );
            })}
          </Fragment>
        ))}
      </div>

      <div className="hidden card overflow-hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-muted">
              <th className="px-4 py-3 font-normal">资产</th>
              <th className="px-4 py-3 font-normal">户口</th>
              <th className="px-4 py-3 font-normal text-right">数量</th>
              <th className="px-4 py-3 font-normal text-right">单价</th>
              <th className="px-4 py-3 font-normal text-right">占比</th>
              <th className="px-4 py-3 font-normal text-right">现值 (MYR)</th>
              <th className="px-4 py-3 font-normal text-right">损益 (MYR)</th>
              <th className="px-4 py-3 font-normal text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.label}>
                <tr className="border-b border-line bg-page/40">
                  <td colSpan={5} className="px-4 py-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-ink-secondary">
                      <AssetIcon assetType={g.assetType} className="h-3.5 w-3.5" />
                      {g.label}
                      <span className="font-normal text-ink-muted">{g.items.length} 笔</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-medium font-mono tabular-nums text-ink-secondary">
                    {formatMYR(g.totalMYR)}
                  </td>
                  <td colSpan={2} />
                </tr>
                {g.items.map((h) => {
              const { pl, color, pct } = derive(h);
              return (
                <tr key={h.id} className="border-b border-line hover:bg-page/60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
                      >
                        <AssetIcon assetType={h.assetType} className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-ink">{h.name}</div>
                        <div className="text-xs text-ink-muted">
                          {ASSET_TYPE_LABEL[h.assetType] ?? h.assetType}
                          {h.symbol ? ` · ${h.symbol}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{h.accountName}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">{formatQuantity(h.quantity)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-secondary">
                    {h.unitPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })} {h.currency}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-page">
                        <span className="block h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
                      </span>
                      <span className="w-10 font-mono tabular-nums text-ink-secondary">{formatShare(pct)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">
                    {h.valueMYR !== null ? formatMYR(h.valueMYR) : "汇率缺失"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {h.needsValuation ? (
                      <span className="text-warning">尚未估值</span>
                    ) : (
                      <Value value={pl} colorizeSign />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{rowActions(h)}</td>
                </tr>
              );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <HoldingFormModal
          mode={modal.mode}
          initial={modal.values}
          accounts={accounts}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
