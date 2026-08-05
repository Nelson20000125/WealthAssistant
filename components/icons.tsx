type IconProps = { className?: string };

// 统一 1.5px stroke 线性图标，跟 dataviz skill 的色票语义对应：
// STOCK/ETF -> series-1 (蓝) ｜ FUND -> series-2 (绿) ｜ CASH -> series-3 (橙) ｜ CRYPTO -> series-4 (深绿)

export function StockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3 17l5-5 4 4 8-9"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 7h5v5" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FundIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3.5" y="7.5" width="17" height="4.2" rx="1" stroke="currentColor" strokeWidth={1.6} />
      <rect x="3.5" y="12.8" width="17" height="4.2" rx="1" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

export function CashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="6.5" width="18" height="11" rx="1.6" stroke="currentColor" strokeWidth={1.6} />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

export function CryptoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.6} />
      <path
        d="M10 8.3h2.9a2 2 0 010 4H9.6m0 0h3.6a2.1 2.1 0 010 4.2H10m2-8.5v-1.5m0 1.5v0m0 8.5v1.5m0-1.5v0"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DefaultAssetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

export const ASSET_TYPE_ICON: Record<string, (p: IconProps) => React.JSX.Element> = {
  STOCK: StockIcon,
  ETF: StockIcon,
  FUND: FundIcon,
  CASH: CashIcon,
  CRYPTO: CryptoIcon,
};

export function AssetIcon({ assetType, className }: { assetType: string; className?: string }) {
  const Icon = ASSET_TYPE_ICON[assetType] ?? DefaultAssetIcon;
  return <Icon className={className} />;
}

export function WalletIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3.5 7.5A2 2 0 015.5 5.5h12a2 2 0 012 2v1"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <rect x="3.5" y="8.5" width="17" height="10.2" rx="1.8" stroke="currentColor" strokeWidth={1.6} />
      <circle cx="16.3" cy="13.6" r="1.2" fill="currentColor" />
    </svg>
  );
}

export function CostIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 19V9.5L12 4l8 5.5V19" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9 19v-6h6v6" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function TrendIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 15l5-6 4 3 7-8" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13 4h7v7" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LayersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 3.5l8 4.3-8 4.3-8-4.3 8-4.3z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M4 12.2l8 4.3 8-4.3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16.3l8 4.3 8-4.3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BankIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 9.5L12 4l9 5.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 9.5h15V19h-15z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M4 19h16M8 12.5v4M12 12.5v4M16 12.5v4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 11.5L12 4l8 7.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v8.5a1 1 0 001 1h10a1 1 0 001-1V10" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9.5 19.4V14h5v5.4" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function NewsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3.5" y="5" width="17" height="14" rx="1.6" stroke="currentColor" strokeWidth={1.6} />
      <path d="M7 9h6M7 12.2h10M7 15.4h10" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

export function SparkleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2-5.2-1.8 5.2-1.8L12 3.5z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}

export function TrophyIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 5h10v4a5 5 0 01-10 0V5z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M7 6H4.5a2 2 0 000 4H7M17 6h2.5a2 2 0 010 4H17" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      <path d="M12 14v3.5M9 20.5h6M9.8 17.5h4.4l.5 3h-5.4l.5-3z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth={1.6} />
      <path d="M8.2 12.3l2.5 2.5 5.1-5.6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5l7 2.6v5.4c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.1l7-2.6z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M9 12l2.2 2.2L15.5 9.5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M12 10v3.6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="12" cy="16.3" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v6A2.5 2.5 0 0117.5 15H10l-4.5 4v-4H6.5A2.5 2.5 0 014 12.5v-6z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <circle cx="8.3" cy="9.5" r="0.9" fill="currentColor" />
      <circle cx="12" cy="9.5" r="0.9" fill="currentColor" />
      <circle cx="15.7" cy="9.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
