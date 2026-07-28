import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// middleware 跑在 Edge Runtime，不能 import "@/auth"（会连带把 Prisma/libSQL
// 拉进来，Edge Runtime 不支援 Node.js 内建模组）。这里另开一个只用 JWT session
// 策略、不带 Credentials provider 的轻量 NextAuth 实例，只用来读 cookie 判断有没有登入。
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth) return;

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const loginUrl = new URL("/login", req.nextUrl.origin);
  return NextResponse.redirect(loginUrl);
});

export const config = {
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
