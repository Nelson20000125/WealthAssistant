"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Account = { id: string; name: string; type: string; institution: string; currency: string; holdingsCount: number };
type Category = { id: string; name: string; type: string; txCount: number; ruleCount: number };
type Rule = { id: string; keyword: string; categoryId: string; categoryName: string; categoryType: string };

const TAB = { accounts: "户口", categories: "分类", rules: "关键字规则" } as const;
type TabKey = keyof typeof TAB;

const ACCOUNT_TYPES = ["BANK", "BROKERAGE", "FUND", "CRYPTO"];
const CATEGORY_TYPES = ["EXPENSE", "INCOME", "INVEST", "TRANSFER"];
const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "支出", INCOME: "收入", INVEST: "投资", TRANSFER: "转帐",
  BANK: "银行", BROKERAGE: "券商", FUND: "基金", CRYPTO: "加密货币",
};

const input = "rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink";

export default function SettingsManager({
  accounts, categories, rules,
}: { accounts: Account[]; categories: Category[]; rules: Rule[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("rules");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 所有写入都走同一支：出错就把后端讯息显示出来，不要静静失败。
  // 后端那些「还有 N 笔交易在用」的防护讯息就是靠这里让使用者看到的。
  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `${method} 失败 (${res.status})`);
      router.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        {(Object.keys(TAB) as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => { setTab(k); setError(null); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
              tab === k ? "bg-ai-accent font-medium text-surface" : "text-ink-secondary hover:text-ink"
            }`}
          >
            {TAB[k]}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
          {error}
        </div>
      )}

      {tab === "rules" && <RulesTab rules={rules} categories={categories} call={call} busy={busy} />}
      {tab === "categories" && <CategoriesTab categories={categories} call={call} busy={busy} />}
      {tab === "accounts" && <AccountsTab accounts={accounts} call={call} busy={busy} />}
    </div>
  );
}

type Call = (url: string, method: string, body?: unknown) => Promise<boolean>;

function RulesTab({ rules, categories, call, busy }: {
  rules: Rule[]; categories: Category[]; call: Call; busy: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 text-sm font-medium text-ink">新增规则</div>
        <div className="flex flex-wrap gap-2">
          <input
            className={`${input} min-w-52 flex-1`}
            placeholder="关键字，例如 HAPPY PETS"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{TYPE_LABEL[c.type]} · {c.name}</option>
            ))}
          </select>
          <Button
            disabled={busy || !keyword.trim() || !categoryId}
            onClick={async () => {
              if (await call("/api/category-rules", "POST", { keyword, categoryId })) setKeyword("");
            }}
          >
            新增
          </Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          比对不分大小写、以整字为单位，命中多条时<strong>关键字最长的赢</strong>。
          所以 &quot;PUBLIC MUTUAL REDEMPTIONS&quot; 会盖过 &quot;PUBLIC MUTUAL&quot;。
          注意整字比对：&quot;PET&quot; 配不到 &quot;PETS&quot;。
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">关键字</th>
              <th className="px-4 py-2 text-left font-medium">分类</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-muted">还没有任何规则</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-4 py-2">
                  {editing === r.id ? (
                    <input className={`${input} w-full`} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  ) : (
                    <span className="font-mono text-ink">{r.keyword}</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <select
                    className={input}
                    value={r.categoryId}
                    disabled={busy}
                    onChange={(e) => call(`/api/category-rules/${r.id}`, "PATCH", { categoryId: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{TYPE_LABEL[c.type]} · {c.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {editing === r.id ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={async () => {
                        if (await call(`/api/category-rules/${r.id}`, "PATCH", { keyword: draft })) setEditing(null);
                      }}>存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(r.id); setDraft(r.keyword); }}>改</Button>
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => call(`/api/category-rules/${r.id}`, "DELETE")}>删</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CategoriesTab({ categories, call, busy }: { categories: Category[]; call: Call; busy: boolean }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("EXPENSE");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 text-sm font-medium text-ink">新增分类</div>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} min-w-52 flex-1`} placeholder="分类名，例如 定存"
            value={name} onChange={(e) => setName(e.target.value)} />
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            {CATEGORY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <Button disabled={busy || !name.trim()} onClick={async () => {
            if (await call("/api/categories", "POST", { name, type })) setName("");
          }}>新增</Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          型别决定这个分类算收入、支出、投资还是内部转帐，建立后<strong>不能改</strong>——
          改了会让底下所有交易的性质在报表里整批翻转。要换型别请新建一个再搬过去。
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">名称</th>
              <th className="px-4 py-2 text-left font-medium">型别</th>
              <th className="px-4 py-2 text-right font-medium">交易 / 规则</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-2">
                  {editing === c.id ? (
                    <input className={`${input} w-full`} value={draft} onChange={(e) => setDraft(e.target.value)} />
                  ) : <span className="text-ink">{c.name}</span>}
                </td>
                <td className="px-4 py-2 text-ink-secondary">{TYPE_LABEL[c.type] ?? c.type}</td>
                <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{c.txCount} / {c.ruleCount}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {editing === c.id ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={async () => {
                        if (await call(`/api/categories/${c.id}`, "PATCH", { name: draft })) setEditing(null);
                      }}>存</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(c.name); }}>改名</Button>
                      <Button size="sm" variant="ghost" disabled={busy || c.txCount > 0}
                        title={c.txCount > 0 ? `还有 ${c.txCount} 笔交易在用` : undefined}
                        onClick={() => call(`/api/categories/${c.id}`, "DELETE")}>删</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountsTab({ accounts, call, busy }: { accounts: Account[]; call: Call; busy: boolean }) {
  const [form, setForm] = useState({ name: "", institution: "", type: "BANK", currency: "MYR" });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Account | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 text-sm font-medium text-ink">新增户口</div>
        <div className="flex flex-wrap gap-2">
          <input className={`${input} min-w-40 flex-1`} placeholder="户口名"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className={`${input} min-w-36 flex-1`} placeholder="机构，例如 AmBank"
            value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} />
          <select className={input} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <input className={`${input} w-24`} placeholder="MYR" maxLength={3}
            value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
          <Button disabled={busy || !form.name.trim()} onClick={async () => {
            if (await call("/api/accounts", "POST", form)) setForm({ name: "", institution: "", type: "BANK", currency: "MYR" });
          }}>新增</Button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          户口本身不带金额。建好之后要到<strong>持仓明细</strong>页新增持仓，净资产才会有数字——
          空户口对净资产的贡献是 0。
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">户口</th>
              <th className="px-4 py-2 text-left font-medium">机构</th>
              <th className="px-4 py-2 text-left font-medium">型别</th>
              <th className="px-4 py-2 text-left font-medium">币种</th>
              <th className="px-4 py-2 text-right font-medium">持仓</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const isEdit = editing === a.id && draft;
              return (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-2">
                    {isEdit ? <input className={`${input} w-full`} value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })} /> : <span className="text-ink">{a.name}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {isEdit ? <input className={`${input} w-full`} value={draft.institution}
                      onChange={(e) => setDraft({ ...draft, institution: e.target.value })} /> : <span className="text-ink-secondary">{a.institution}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {isEdit ? (
                      <select className={input} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                        {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                      </select>
                    ) : <span className="text-ink-secondary">{TYPE_LABEL[a.type] ?? a.type}</span>}
                  </td>
                  <td className="px-4 py-2">
                    {isEdit ? <input className={`${input} w-20`} maxLength={3} value={draft.currency}
                      onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })} /> : <span className="text-ink-secondary">{a.currency}</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-muted">{a.holdingsCount}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {isEdit ? (
                      <>
                        <Button size="sm" disabled={busy} onClick={async () => {
                          if (await call(`/api/accounts/${a.id}`, "PATCH", draft)) setEditing(null);
                        }}>存</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>取消</Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(a.id); setDraft(a); }}>改</Button>
                        <Button size="sm" variant="ghost" disabled={busy || a.holdingsCount > 0}
                          title={a.holdingsCount > 0 ? `底下还有 ${a.holdingsCount} 笔持仓` : undefined}
                          onClick={() => call(`/api/accounts/${a.id}`, "DELETE")}>删</Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
