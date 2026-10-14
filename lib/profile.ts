import { prisma } from "@/lib/prisma";

/**
 * 显示用名字（P0-07）。
 *
 * 刻意读资料库而不读 session：next-auth 的 JWT 是登入那一刻的快照，
 * 使用者在设定页改了名字，session 里还是旧的，要等重新登入才变——
 * 需求要的是「改完首页立刻用新名字」。
 *
 * 回 null 就是没设过名字。**绝不退回 email 前缀** —— 那是帐号 ID，
 * 首页因此长年写著「晚上好，<邮箱前缀>」。
 */
export async function getDisplayName(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name?.trim() || null;
}
