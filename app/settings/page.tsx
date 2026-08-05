import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import SettingsManager from "@/components/SettingsManager";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [accounts, categories, rules] = await Promise.all([
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

      <SettingsManager
        accounts={accounts.map((a) => ({
          id: a.id, name: a.name, type: a.type, institution: a.institution,
          currency: a.currency, holdingsCount: a._count.holdings,
        }))}
        categories={categories.map((c) => ({
          id: c.id, name: c.name, type: c.type,
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
