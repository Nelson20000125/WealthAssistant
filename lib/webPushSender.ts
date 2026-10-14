import webpush from "web-push";
import type { BrowserSubscription } from "@/lib/push";

// web-push 的发送器，金钥来自环境变数。Next 路由与 21:30 排程脚本共用这一份。
export function webPushSend() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) throw new Error("缺 VAPID 金钥（NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT）");
  webpush.setVapidDetails(subject, pub, priv);
  return (sub: BrowserSubscription, payload: string) => webpush.sendNotification(sub, payload);
}
