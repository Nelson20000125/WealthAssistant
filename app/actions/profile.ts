"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const MAX_LEN = 40;

/** 设定页改显示名字。空字串＝清掉，首页会退回只问好、不硬凑一个名字出来。 */
export async function updateDisplayName(formData: FormData) {
  const session = await auth();
  if (!session?.user.id) throw new Error("未登入");

  const raw = String(formData.get("name") ?? "").trim();
  if (raw.length > MAX_LEN) throw new Error(`名字不能超过 ${MAX_LEN} 个字`);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: raw || null },
  });

  // 首页的问候语读的是资料库，改完要让它重新渲染
  revalidatePath("/");
  revalidatePath("/settings");
  revalidatePath("/me");
}
