import Link from "next/link";
import { auth } from "@/auth";
import { getDisplayName } from "@/lib/profile";
import { ME_ITEMS } from "@/components/navItems";
import ThemeToggle from "@/components/ThemeToggle";
import ReminderToggle from "@/components/ReminderToggle";
import { logout } from "@/app/actions/auth";

// 「我的」（P0-02）：AI 顾问、市场简报、设置的手机入口。
// 这三项从前只在汉堡抽屉里 —— 能进去，但要先想起按钮在右上角。

export default async function MePage() {
  const session = await auth();
  const displayName = session?.user.id ? await getDisplayName(session.user.id) : null;
  const email = session?.user.email ?? null;

  return (
    <div className="flex flex-col gap-8">
      <div className="animate-in">
        <h1 className="text-3xl font-semibold text-ink">我的</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {displayName ?? email ?? ""}
        </p>
      </div>

      <div className="card animate-in divide-y divide-line">
        {ME_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-14 items-center gap-3 px-5 py-3.5 text-sm text-ink"
            >
              <Icon className="h-5 w-5 shrink-0 text-ink-muted" />
              {item.label}
              <span className="ml-auto text-ink-muted">›</span>
            </Link>
          );
        })}
      </div>

      <ReminderToggle />

      <div className="card animate-in flex items-center justify-between px-5 py-3.5">
        <span className="text-sm text-ink">主题</span>
        <ThemeToggle />
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="card card-interactive flex min-h-14 w-full items-center justify-center text-sm text-ink-secondary"
        >
          登出
        </button>
      </form>
    </div>
  );
}
