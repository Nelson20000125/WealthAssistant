"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LayersIcon, NewsIcon, ChatIcon, WalletIcon, SettingsIcon } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/", label: "总览", icon: HomeIcon },
  { href: "/holdings", label: "持仓明细", icon: LayersIcon },
  { href: "/cashflow", label: "收支记录", icon: WalletIcon },
  { href: "/market-brief", label: "市场简报", icon: NewsIcon },
  { href: "/advisor", label: "AI 顾问", icon: ChatIcon },
  { href: "/settings", label: "设定", icon: SettingsIcon },
];

export default function Sidebar({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface px-4 py-6">
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
        href="/cashflow?add=1"
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
              className="rounded-md px-2 py-1 text-xs text-ink-secondary hover:bg-page hover:text-ink"
            >
              登出
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
