import type { Metadata } from "next";
import { Inter, Geist_Mono, Geist } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import AiQuickChat from "@/components/AiQuickChat";
import "./globals.css";
import { cn } from "@/lib/utils";
import { auth } from "@/auth";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "私人财富管理助理",
  description: "Personal Wealth Dashboard",
};

// 首帧渲染前同步执行，避免深色用户刷新时白底闪一下（FOUC）。
// 逻辑：localStorage 有记录用记录，没记录跟随系统偏好。
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("wa-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("theme-dark")}}catch(e){}`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="zh-CN"
      // 主题 class 由防闪脚本在水合前写到 <html> 上，服务端渲染不知道这件事，
      // 必须抑制这个预期内的属性差异（next-themes 同款做法），否则每次都报 hydration 警告
      suppressHydrationWarning
      className={cn("h-full", "antialiased", inter.variable, geistMono.variable, "font-sans", geist.variable)}
    >
      {/* 手机是「顶栏 → 内容 → 底部 tab」的纵向排法，桌面才是「侧栏 ｜ 内容」的横向排法 */}
      <body className="flex min-h-full flex-col bg-page text-ink md:flex-row">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {session ? (
          <>
            <Sidebar userEmail={session.user.email} />
            <MobileNav userEmail={session.user.email} />
            {/* pb-24 是留给固定在底部的 tab bar 的位置，不然最后一列内容会被盖住 */}
            <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:py-8">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
            <AiQuickChat />
          </>
        ) : (
          <main className="flex-1">{children}</main>
        )}
      </body>
    </html>
  );
}
