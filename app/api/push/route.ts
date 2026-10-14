import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { removeSubscription, saveSubscription } from "@/lib/push";

// 「开启 / 关闭每日提醒」。订阅内容来自浏览器，存之前先验形状
function isSubscription(b: unknown): b is { endpoint: string; keys: { p256dh: string; auth: string } } {
  const s = b as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  return (
    typeof s?.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const body = await request.json().catch(() => null);
  if (!isSubscription(body)) return NextResponse.json({ error: "订阅资料不完整" }, { status: 400 });
  await saveSubscription(session!.user.id, body);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await auth();
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "缺 endpoint" }, { status: 400 });
  await removeSubscription(session!.user.id, body.endpoint);
  return NextResponse.json({ ok: true });
}
