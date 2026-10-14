"use client";

import { useEffect, useState } from "react";

// 每日记账提醒开关（P1-07）。通知授权只在使用者按下按钮时才请求 ——
// iOS 也只允许在点击里请求，而且规格写死「未授权不准发」。

type State = "loading" | "unsupported" | "needs-home-screen" | "denied" | "off" | "on";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function detect(): Exclude<State, "loading" | "on" | "off"> | null {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    // iOS 只有「加到主画面」后打开的 web app 才有推播；Safari 分页里 PushManager 根本不存在
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    return ios ? "needs-home-screen" : "unsupported";
  }
  return Notification.permission === "denied" ? "denied" : null;
}

export default function ReminderToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const blocked = detect();
      if (blocked) return setState(blocked);
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY!) });
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "保存失败");
      setState("on");
    } catch (e) {
      setMsg(`开启失败：${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = await r.json();
      setMsg(r.ok ? `已发出，几秒内应该会收到（${j.sent} 台设备）` : `发送失败：${j.error}`);
    } finally {
      setBusy(false);
    }
  }

  const hint: Record<State, string> = {
    loading: "",
    unsupported: "这个浏览器不支持推播通知",
    "needs-home-screen": "iPhone 要从「主画面」的图标打开这个 app，才能开启提醒",
    denied: "通知权限被关掉了 —— 去 iPhone「设置 → 通知 → 我的钱」打开",
    off: "今天没记账的话，21:30 提醒一次",
    on: "已开启 · 今天没记账的话，21:30 提醒一次",
  };

  return (
    <div className="card animate-in flex flex-col gap-2 px-5 py-3.5">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-ink">每日记账提醒</span>
          <span className="text-xs text-ink-muted">{!KEY ? "服务端没设推播金钥，这里用不了" : hint[state]}</span>
        </div>
        {KEY && state === "off" && (
          <button type="button" disabled={busy} onClick={enable} className="min-h-11 shrink-0 rounded-md bg-ink px-4 text-sm font-medium text-surface disabled:opacity-50">
            开启
          </button>
        )}
        {KEY && state === "on" && (
          <button type="button" disabled={busy} onClick={disable} className="min-h-11 shrink-0 rounded-md border border-line px-4 text-sm text-ink-secondary disabled:opacity-50">
            关闭
          </button>
        )}
      </div>
      {KEY && state === "on" && (
        <button type="button" disabled={busy} onClick={test} className="min-h-11 self-start text-sm text-ink-secondary underline underline-offset-4 disabled:opacity-50">
          发一条测试
        </button>
      )}
      {msg && <div className="text-xs text-ink-secondary">{msg}</div>}
    </div>
  );
}
