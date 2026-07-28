import { prisma } from "@/lib/prisma";

export async function getAccounts(userId: string) {
  return prisma.account.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, institution: true, currency: true },
    orderBy: { name: "asc" },
  });
}
