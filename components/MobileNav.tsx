"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_PRIMARY_ITEMS, MOBILE_DRAWER_ITEMS } from "@/components/navItems";
import { MenuIcon, CloseIcon } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import { logout } from "@/app/actions/auth";

/**
 * 手机版导览：顶部一条 bar（品牌 + 汉堡）＋ 底部四个 tab。
 * md 以上整个隐藏，交给 Sidebar。
 *
 * 底部固定四项、其余收进汉堡抽屉，是因为 tab bar 放超过五项标签就会挤成一团。
 */
export default function MobileNav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 抽屉开著时锁住背景捲动，不然滑动会穿透到底下的页面
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-surface">
            财
          </span>
          <span className="text-sm font-semibold tracking-wide text-ink">私人财富管理</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开选单"
          aria-expanded={open}
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md text-ink-secondary hover:bg-page hover:text-ink"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭选单"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute right-0 top-0 flex h-full w-72 max-w-[85vw] flex-col border-l border-line bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">选单</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭选单"
                className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md text-ink-secondary hover:bg-page hover:text-ink"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex flex-col gap-1">
              {MOBILE_DRAWER_ITEMS.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // 点了就收起来，否则跳到新页面抽屉还开著挡住内容
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm transition-colors ${
                      active ? "bg-ink font-medium text-surface" : "text-ink-secondary hover:bg-page hover:text-ink"
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
              onClick={() => setOpen(false)}
              className="mt-4 flex items-center justify-center gap-1.5 rounded-md bg-portfolio-accent px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
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
                    className="rounded-md px-2 py-1.5 text-xs text-ink-secondary hover:bg-page hover:text-ink"
                  >
                    登出
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface md:hidden"
        // iPhone 底部的 home indicator 会盖住最后一列，补上安全区高度
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MOBILE_PRIMARY_ITEMS.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              // min-h-14 让触控目标够大，低于 44px 会很难点准
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs transition-colors ${
                active ? "font-medium text-ink" : "text-ink-muted"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
