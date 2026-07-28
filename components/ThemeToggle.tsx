"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "wa-theme";

/**
 * 深浅主题切换。真正的"防闪烁"初始化在 layout.tsx 的 inline script 里完成
 * （首帧渲染前就往 <html> 加 .theme-dark），这里只负责后续切换 + 持久化。
 */
export default function ThemeToggle() {
  // 挂载后才读 DOM 状态，避免 SSR/CSR 不一致
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("theme-dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("theme-dark");
    document.documentElement.classList.toggle("theme-dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      // localStorage 不可用（隐私模式等）就只切当前会话
    }
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-secondary transition-colors hover:bg-page hover:text-ink"
    >
      {/* 挂载前渲染中性占位，避免图标闪跳 */}
      {isDark === null ? (
        <span className="h-4 w-4 shrink-0" />
      ) : isDark ? (
        <SunIcon className="h-4 w-4 shrink-0" />
      ) : (
        <MoonIcon className="h-4 w-4 shrink-0" />
      )}
      {isDark === null ? "主题" : isDark ? "浅色模式" : "深色模式"}
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
    </svg>
  );
}
