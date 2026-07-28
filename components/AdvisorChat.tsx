"use client";

import { useState } from "react";
import { isToolUIPart, isDynamicToolUIPart, getToolName } from "ai";
import ReactMarkdown from "react-markdown";
import InsightNote from "@/components/InsightNote";
import type { useAdvisorChat } from "@/hooks/useAdvisorChat";

const SUGGESTION_PILLS = ["总结今天的市场", "我最大的风险是什么", "生成本月报告"];

const MARKDOWN_CLASSES = `[&_h1]:mt-3 [&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:first:mt-0
  [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:first:mt-0
  [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_h3]:first:mt-0
  [&_p]:mb-2 [&_p]:last:mb-0
  [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5
  [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5
  [&_li]:mb-1
  [&_strong]:font-semibold
  [&_hr]:my-3 [&_hr]:border-line`;

export default function AdvisorChat({ chat }: { chat: ReturnType<typeof useAdvisorChat> }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = chat;

  const submitText = (text: string) => {
    if (!text.trim() || status === "submitted" || status === "streaming") return;
    sendMessage({ text });
    setInput("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitText(input);
  };

  return (
    <div className="flex flex-col gap-4">
      {messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((message) =>
            message.parts.map((part, i) => {
              if (part.type === "text" && message.role === "user") {
                return (
                  <div key={`${message.id}-${i}`} className="text-xs font-medium tracking-wide text-ink-muted">
                    你问 · {part.text}
                  </div>
                );
              }
              if (part.type === "text" && message.role === "assistant") {
                return (
                  <InsightNote
                    key={`${message.id}-${i}`}
                    tone="neutral"
                    label="今天 · AI 分析"
                    className="animate-in"
                  >
                    <div className={MARKDOWN_CLASSES}>
                      <ReactMarkdown>{part.text}</ReactMarkdown>
                    </div>
                  </InsightNote>
                );
              }
              if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
                return (
                  <div key={`${message.id}-${i}`} className="text-xs text-ink-muted">
                    查了一下：{getToolName(part)}
                  </div>
                );
              }
              return null;
            })
          )}
          {status === "submitted" && <div className="text-sm text-ink-muted">分析中…</div>}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="card flex items-center gap-2 py-3 pl-4 pr-2"
        style={{ borderLeft: "2px solid var(--ai-accent)" }}
      >
        <span className="font-mono text-sm text-ai-accent">›</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="向你的分析师提问…"
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
        <button
          type="submit"
          disabled={status === "submitted" || status === "streaming"}
          className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--ai-accent)" }}
        >
          分析
        </button>
      </form>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTION_PILLS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => submitText(p)}
              className="rounded-full border border-line px-3 py-1.5 text-xs text-ink-secondary transition-colors hover:border-ai-accent hover:text-ai-accent"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
