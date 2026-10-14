"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_PRIMARY_ITEMS } from "@/components/navItems";
import { PlusIcon } from "@/components/icons";

/**
 * 手机版导览：顶部一条细 bar（品牌）＋ 底部五格 tab（P0-02）。
 *
 *   总览 ｜ 收支 ｜ ⊕ ｜ 投资 ｜ 我的
 *
 * 中间那个 ⊕ 是整个 App 最重要的 CTA：在任何页面点一下就能记一笔。
 * 从前它藏在汉堡抽屉里，而抽屉里还塞著设置和市场简报 —— 每天要做的动作
 * 跟一年调一次的设置放在同一个深度，是本末倒置。
 * 抽屉整个移除，那三项改由「我的」页承接。
 */
export default function MobileNav({ userEmail }: { userEmail?: string | null }) {
  const pathname = usePathname();
  const [left, right] = [MOBILE_PRIMARY_ITEMS.slice(0, 2), MOBILE_PRIMARY_ITEMS.slice(2)];

  const tab = (item: (typeof MOBILE_PRIMARY_ITEMS)[number]) => {
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
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-sm font-semibold text-surface">
            财
          </span>
          <span className="text-sm font-semibold tracking-wide text-ink">我的钱</span>
        </Link>
        {userEmail && (
          <Link href="/me" className="truncate text-xs text-ink-muted" title={userEmail}>
            我的
          </Link>
        )}
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden"
        // iPhone 底部的 home indicator 会盖住最后一列，补上安全区高度
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {left.map(tab)}

        <Link
          href={`${pathname}?add=1`}
          aria-label="记一笔"
          className="flex min-h-14 flex-col items-center justify-center"
        >
          <span className="flex h-12 w-12 -translate-y-3 items-center justify-center rounded-full bg-portfolio-accent text-primary-foreground shadow-lg">
            <PlusIcon className="h-6 w-6" />
          </span>
          <span className="-mt-2 text-xs text-ink-muted">记一笔</span>
        </Link>

        {right.map(tab)}
      </nav>
    </>
  );
}
