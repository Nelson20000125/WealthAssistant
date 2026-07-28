import { prisma } from "@/lib/prisma";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 关键字比对：拿对帐单交易描述（大写不敏感）去找命中的分类，命中就回传 categoryId，没有就回传
 * null（前端留给用户手动挑）。用整字边界（\b）而不是纯子字串比对——单字关键字（如 "PET"）用子
 * 字串比对会误撞进地名/其他字词里（比如 "PETALING JAYA" 里就含有 "PET"），整字边界能避开这种。
 */
export async function matchCategoryByKeyword(userId: string, description: string): Promise<string | null> {
  const rules = await prisma.categoryRule.findMany({
    where: { category: { userId } },
    select: { keyword: true, categoryId: true },
  });
  const upperDesc = description.toUpperCase();
  const hit = rules.find((r) => new RegExp(`\\b${escapeRegex(r.keyword.toUpperCase())}\\b`).test(upperDesc));
  return hit?.categoryId ?? null;
}
