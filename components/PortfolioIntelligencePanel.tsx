"use client";

import { useRef } from "react";
import { useAdvisorChat } from "@/hooks/useAdvisorChat";
import InsightNote from "@/components/InsightNote";
import AdvisorChat from "@/components/AdvisorChat";
import { SparkleIcon, TrendIcon, LayersIcon, ShieldIcon, CheckIcon } from "@/components/icons";
import type { Insight, Suggestion, SuggestionIcon } from "@/lib/portfolioIntelligence";

const SUGGESTION_ICON: Record<SuggestionIcon, (p: { className?: string }) => React.JSX.Element> = {
  trend: TrendIcon,
  layers: LayersIcon,
  shield: ShieldIcon,
  check: CheckIcon,
};

export default function PortfolioIntelligencePanel({
  insights,
  suggestions,
  sectionDelays,
  quota,
}: {
  insights: Insight[];
  suggestions: Suggestion[];
  sectionDelays: [number, number, number];
  quota?: { limit: number | null; used: number };
}) {
  const chat = useAdvisorChat();
  const { sendMessage, status } = chat;
  const chatSectionRef = useRef<HTMLDivElement>(null);

  const ask = (question: string) => {
    if (status === "submitted" || status === "streaming") return;
    sendMessage({ text: question });
    chatSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="card animate-in p-6" style={{ animationDelay: `${sectionDelays[0]}ms` }}>
        <div className="mb-5 flex items-center gap-2 text-sm font-medium text-ink">
          <SparkleIcon className="h-4 w-4 text-ai-accent" />
          AI Insights
        </div>
        <div className="flex flex-col gap-3">
          {insights.map((insight, i) => (
            <button
              key={i}
              type="button"
              onClick={() => ask(`详细分析一下：${insight.category} —— ${insight.text}`)}
              className="animate-in text-left transition-opacity hover:opacity-80"
              style={{ animationDelay: `${sectionDelays[0] + 100 + i * 60}ms` }}
            >
              <InsightNote tone={insight.tone} label={`今天 · ${insight.category}`}>
                {insight.text}
              </InsightNote>
            </button>
          ))}
        </div>
      </div>

      <div className="card animate-in p-6" style={{ animationDelay: `${sectionDelays[1]}ms` }}>
        <div className="mb-5 text-sm font-medium text-ink">AI 建议</div>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => {
            const Icon = SUGGESTION_ICON[s.icon];
            return (
              <button
                key={i}
                type="button"
                onClick={() => ask(`如果要「${s.label}」，具体应该怎么做？`)}
                className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-ai-accent hover:text-ai-accent"
              >
                <Icon className="h-3.5 w-3.5 text-ai-accent" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div ref={chatSectionRef} className="card animate-in p-6" style={{ animationDelay: `${sectionDelays[2]}ms` }}>
        <div className="mb-5 text-sm font-medium text-ink">向分析师提问</div>
        <AdvisorChat chat={chat} quota={quota} />
      </div>
    </>
  );
}
