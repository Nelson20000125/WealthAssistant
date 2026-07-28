import { AlertIcon, CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";

export type InsightTone = "flag" | "healthy" | "neutral";

const TONE_COLOR: Record<InsightTone, string> = {
  flag: "var(--warning)",
  healthy: "var(--good)",
  neutral: "var(--ink-muted)",
};

const TONE_TEXT_CLASS: Record<InsightTone, string> = {
  flag: "text-[var(--warning)]",
  healthy: "text-[var(--good)]",
  neutral: "text-[var(--ink-muted)]",
};

// 严重度不能只靠颜色区分（色弱用户/扫视时容易分不清），额外配图标 + 文字徽章
const TONE_META: Record<InsightTone, { icon: (p: { className?: string }) => React.JSX.Element; badge: string }> = {
  flag: { icon: AlertIcon, badge: "需要留意" },
  healthy: { icon: CheckIcon, badge: "状况良好" },
  neutral: { icon: AlertIcon, badge: "仅供参考" },
};

export default function InsightNote({
  tone,
  label,
  children,
  className,
  style,
}: {
  tone: InsightTone;
  label: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { icon: Icon, badge } = TONE_META[tone];
  return (
    <div
      className={`rounded-md bg-page py-3 pl-4 pr-4 ${className ?? ""}`}
      style={{ borderLeft: `3px solid ${TONE_COLOR[tone]}`, ...style }}
    >
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${TONE_TEXT_CLASS[tone]}`} />
        <div className="text-xs font-medium text-ink-muted">{label}</div>
        <Badge
          variant="outline"
          className="ml-auto shrink-0 border-0"
          style={{ background: `color-mix(in srgb, ${TONE_COLOR[tone]} 14%, transparent)`, color: TONE_COLOR[tone] }}
        >
          {badge}
        </Badge>
      </div>
      <div className="mt-1 text-sm leading-relaxed text-ink">{children}</div>
    </div>
  );
}
