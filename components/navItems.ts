import { HomeIcon, LayersIcon, NewsIcon, ChatIcon, WalletIcon, SettingsIcon } from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  /** 手机底部 tab 放不下六项，用短一点的字 */
  shortLabel: string;
  icon: (p: { className?: string }) => React.JSX.Element;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "总览", shortLabel: "总览", icon: HomeIcon },
  { href: "/holdings", label: "持仓明细", shortLabel: "持仓", icon: LayersIcon },
  { href: "/cashflow", label: "收支记录", shortLabel: "收支", icon: WalletIcon },
  { href: "/market-brief", label: "市场简报", shortLabel: "简报", icon: NewsIcon },
  { href: "/advisor", label: "AI 顾问", shortLabel: "顾问", icon: ChatIcon },
  { href: "/settings", label: "设定", shortLabel: "设定", icon: SettingsIcon },
];

/**
 * 手机底部 tab 只放这四项。上限是五个，超过标签会挤到看不清楚。
 * AI 顾问留在底部而不是收进汉堡，是因为它是这个专案最想让人看到的部分，
 * 藏在抽屉里等于没有。市场简报与设定则收进汉堡。
 */
const PRIMARY_HREFS = ["/", "/holdings", "/cashflow", "/advisor"];

export const MOBILE_PRIMARY_ITEMS = NAV_ITEMS.filter((i) => PRIMARY_HREFS.includes(i.href));
export const MOBILE_DRAWER_ITEMS = NAV_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href));
