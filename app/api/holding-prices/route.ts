import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { upsertTodaySnapshot } from "@/lib/snapshot";

/**
 * 批次写入手动估值价格。
 *
 * 设计成批次而不是单笔，是因为真实使用行为是「隔几周想起来，一次把过期的补掉」，
 * 不是「每天更新一笔」。一次提交一个日期 + 多笔持仓的价格。
 *
 * date 收 YYYY-MM-DD（日历日概念），存成该日 UTC 零点 —— 跟 PortfolioSnapshot
 * 同一套约定（见 lib/snapshot.ts:todaySnapshotDate），否则同一天两次提交会因为
 * 时间部分不同而绕过 @@unique([holdingId, date]) 建出两笔。
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  const userId = session!.user.id;
  const body = await req.json();

  if (typeof body?.date !== "string" || !DATE_RE.test(body.date)) {
    return NextResponse.json({ error: "日期格式要是 YYYY-MM-DD" }, { status: 400 });
  }
  const date = new Date(`${body.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "日期不合法" }, { status: 400 });
  }

  const entries: unknown = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "没有要写入的价格" }, { status: 400 });
  }

  const parsed: { holdingId: string; price: number }[] = [];
  for (const e of entries) {
    const holdingId = (e as Record<string, unknown>)?.holdingId;
    const price = (e as Record<string, unknown>)?.price;
    if (typeof holdingId !== "string" || !holdingId) {
      return NextResponse.json({ error: "持仓 id 不合法" }, { status: 400 });
    }
    // 价格必须 > 0：0 会让现值归零、报酬率变 -100%，多半是误留空白而不是真的归零。
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "价格必须是大于 0 的数字" }, { status: 400 });
    }
    parsed.push({ holdingId, price });
  }

  // 一次查完做归属与型别检查，避免逐笔打 DB。
  const holdings = await prisma.holding.findMany({
    where: { id: { in: parsed.map((p) => p.holdingId) }, account: { userId } },
    select: { id: true, valuation: true, name: true },
  });
  const byId = new Map(holdings.map((h) => [h.id, h]));

  for (const p of parsed) {
    const h = byId.get(p.holdingId);
    if (!h) return NextResponse.json({ error: "持仓不存在" }, { status: 404 });
    // AUTO 的价来自行情 API，DERIVED 的余额来自流水推导。让它们接受手动价，
    // 等于开一个会被下次 refresh-prices 静默覆盖的后门。
    if (h.valuation !== "MANUAL_UNIT_PRICE" && h.valuation !== "MANUAL_VALUE") {
      return NextResponse.json(
        { error: `「${h.name}」不是手动估值型持仓，不能手动填价` },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(
    parsed.map((p) =>
      prisma.holdingPrice.upsert({
        where: { holdingId_date: { holdingId: p.holdingId, date } },
        create: { holdingId: p.holdingId, date, price: p.price },
        update: { price: p.price },
      })
    )
  );

  // 手动估值直接改变净值，补一笔当日快照让折线图跟上。
  // 快照失败不该让写价这件事整个失败，单独 catch（沿用 refresh-prices 的做法）。
  let snapshot;
  try {
    const s = await upsertTodaySnapshot(userId);
    snapshot = { date: s.date, netWorthMYR: s.netWorthMYR };
  } catch (error) {
    snapshot = { error: (error as Error).message };
  }

  return NextResponse.json({ saved: parsed.length, snapshot });
}
