import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsManager from "@/components/SettingsManager";
import { getDisplayName } from "@/lib/profile";
import { updateDisplayName } from "@/app/actions/profile";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [displayName, accounts, categories, rules] = await Promise.all([
    getDisplayName(userId),
    prisma.account.findMany({
      where: { userId },
      include: { _count: { select: { holdings: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({
      where: { userId },
      include: { _count: { select: { transactions: true, rules: true } } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.categoryRule.findMany({
      where: { category: { userId } },
      include: { category: { select: { id: true, name: true, type: true } } },
      orderBy: { keyword: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <div className="text-xs font-medium tracking-widest text-ai-accent uppercase">Settings</div>
        <h1 className="mt-1 text-3xl font-semibold text-ink">设定</h1>
        <p className="mt-1 text-sm text-ink-muted">
          户口、分类、关键字规则都可以在这里自己增删改，不用再改资料库
        </p>
      </div>

      {/* 显示名字（P0-07）：首页问候语用它，没设就只问好 */}
      <form action={updateDisplayName} className="card animate-in flex flex-col gap-2 p-5 sm:flex-row sm:items-end sm:gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">显示名字</span>
          <span className="text-xs text-ink-muted">首页会用这个名字跟你打招呼，留空就只问好</span>
          <input
            name="name"
            defaultValue={displayName ?? ""}
            maxLength={40}
            placeholder="例如：Nelson"
            className="mt-1 min-h-11 rounded-md border border-line bg-surface px-3 py-2 text-base text-ink"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 shrink-0 rounded-md bg-portfolio-accent px-4 text-sm font-medium text-primary-foreground"
        >
          保存
        </button>
      </form>

      <SettingsManager
        accounts={accounts.map((a) => ({
          id: a.id, name: a.name, type: a.type, institution: a.institution,
          currency: a.currency, holdingsCount: a._count.holdings,
        }))}
        categories={categories.map((c) => ({
          id: c.id, name: c.name, type: c.type, countsInTotals: c.countsInTotals,
          txCount: c._count.transactions, ruleCount: c._count.rules,
        }))}
        rules={rules.map((r) => ({
          id: r.id, keyword: r.keyword, categoryId: r.categoryId,
          categoryName: r.category.name, categoryType: r.category.type,
        }))}
      />
    </div>
  );
}
