import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { REMINDER } from "@/lib/push";
import { webPushSend } from "@/lib/webPushSender";

// 「发一条测试」：开启后立刻确认手机收得到，不必等到 21:30。不看今天记了没有
export async function POST() {
  const session = await auth();
  const subs = await prisma.pushSubscription.findMany({ where: { userId: session!.user.id } });
  if (subs.length === 0) return NextResponse.json({ error: "还没有开启提醒的设备" }, { status: 400 });
  try {
    const send = webPushSend();
    const payload = JSON.stringify({ ...REMINDER, body: `（测试）${REMINDER.body}` });
    await Promise.all(subs.map((s) => send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)));
    return NextResponse.json({ sent: subs.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
