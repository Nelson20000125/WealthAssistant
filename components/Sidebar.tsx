"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/components/navItems";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/app/actions/auth";

export default function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();

  // 手机改用 MobileNav（顶栏 + 底部 tab），这条固定侧栏在小屏会吃掉大半宽度
  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-surface text-sm font-semibold">
          财
        </span>
        <div>
          <div className="text-sm font-semibold tracking-wide text-ink">私人财富管理</div>
          <div className="text-xs text-ink-muted">Wealth Assistant</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-ink text-surface font-medium"
                  : "text-ink-secondary hover:bg-page hover:text-ink"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Link
        href={`${pathname}?add=1`}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-md bg-portfolio-accent px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        + 记一笔
      </Link>
      <div className="mt-auto border-t border-line pt-3">
        {userEmail && (
          <div className="mb-2 truncate px-1 text-xs text-ink-muted" title={userEmail}>
            {userEmail}
          </div>
        )}
        <div className="flex items-center justify-between">
          <ThemeToggle />
          <form action={logout}>
            <button
              type="submit"
              className="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap text-ink-secondary hover:bg-page hover:text-ink"
            >
              登出
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
