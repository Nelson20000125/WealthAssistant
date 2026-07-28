import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getNetWorthHistory, type HistoryRange } from "@/lib/portfolio";

const RANGES: HistoryRange[] = ["1M", "3M", "YTD", "1Y", "MAX"];

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("range") ?? "MAX").toUpperCase();
  const range: HistoryRange = (RANGES as string[]).includes(raw)
    ? (raw as HistoryRange)
    : "MAX";

  try {
    const history = await getNetWorthHistory(session!.user.id, range);
    return NextResponse.json(history);
  } catch (error) {
    // Prisma client 未重新生成（缺 PortfolioSnapshot 模型）等情况，
    // 返回结构化错误让前端显示空状态而不是整页挂掉
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
