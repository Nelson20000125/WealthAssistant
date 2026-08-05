"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAdvisorChat } from "@/hooks/useAdvisorChat";
import AdvisorChat from "@/components/AdvisorChat";
import { SparkleIcon } from "@/components/icons";

/**
 * 全局悬浮 AI 入口：右下角小按钮，点开是迷你对话窗。
 * 主要场景是随手记账（"午餐 15"），走的是同一个 wealth-advisor agent
 * 和同一条 memory 线程，跟 /advisor 页的对话是连续的。
 * /advisor 页本身有完整对话界面，悬浮球在那页隐藏。
 */
export default function AiQuickChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const chat = useAdvisorChat();

  if (pathname === "/advisor") return null;

  // 手机隐藏：右下角这颗球的位置正好是底部 tab bar，会互相盖住。
  // 小屏要用 AI 就走 tab bar 的「顾问」进 /advisor 页，功能不会少。
  return (
    <div className="hidden md:block">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开 AI 记账助手"
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
          style={{ background: "var(--ai-accent)" }}
        >
          <SparkleIcon className="h-5 w-5" />
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex w-[380px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden card shadow-xl" style={{ maxHeight: "min(560px, calc(100vh - 6rem))" }}>
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full"
                style={{ background: "color-mix(in srgb, var(--ai-accent) 14%, transparent)", color: "var(--ai-accent)" }}
              >
                <SparkleIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium text-ink">AI 记账 · 顾问</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="收起"
              className="rounded-md px-2 py-1 text-sm text-ink-secondary hover:bg-page hover:text-ink"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {chat.messages.length === 0 && (
              <div className="mb-3 text-xs text-ink-muted">
                直接说就行：「午餐 15」「Grab 12 去机场」「工资进账 5000」，我来入账。
              </div>
            )}
            <AdvisorChat chat={chat} />
          </div>
        </div>
      )}
    </div>
  );
}
