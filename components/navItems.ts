import {
  HomeIcon,
  LayersIcon,
  NewsIcon,
  ChatIcon,
  WalletIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  /** 手机底部 tab 放不下长标签，用短一点的字 */
  shortLabel: string;
  icon: (p: { className?: string }) => React.JSX.Element;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "总览", shortLabel: "总览", icon: HomeIcon },
  { href: "/cashflow", label: "收支记录", shortLabel: "收支", icon: WalletIcon },
  { href: "/holdings", label: "持仓明细", shortLabel: "投资", icon: LayersIcon },
  { href: "/advisor", label: "投资分析", shortLabel: "分析", icon: ChatIcon },
  { href: "/market-brief", label: "市场简报", shortLabel: "简报", icon: NewsIcon },
  { href: "/settings", label: "设置", shortLabel: "设置", icon: SettingsIcon },
];

/**
 * 手机底部：总览 ｜ 收支 ｜ ⊕ ｜ 投资 ｜ 我的（P0-02）。
 *
 * ⊕ 不是路由，是全域「记一笔」入口，由 MobileNav 自己画在正中间。
 * 顾问、市场简报、设置全部收进「我的」—— 从前它们只在汉堡抽屉里，
 * 进得去，但每次都要先想起「那个按钮在右上角」。
 */
const MOBILE_HREFS = ["/", "/cashflow", "/holdings", "/me"];

export const MOBILE_PRIMARY_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter((i) => MOBILE_HREFS.includes(i.href)),
  { href: "/me", label: "我的", shortLabel: "我的", icon: UserIcon },
];

/** 「我的」页面里列出来的项目 */
export const ME_ITEMS = NAV_ITEMS.filter((i) =>
  ["/advisor", "/market-brief", "/settings"].includes(i.href)
);
