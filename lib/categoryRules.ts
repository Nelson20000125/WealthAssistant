import { prisma } from "@/lib/prisma";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 关键字比对：拿对帐单交易描述（大写不敏感）去找命中的分类，命中就回传 categoryId，没有就回传
 * null（前端留给用户手动挑）。用整字边界（\b）而不是纯子字串比对——单字关键字（如 "PET"）用子
 * 字串比对会误撞进地名/其他字词里（比如 "PETALING JAYA" 里就含有 "PET"），整字边界能避开这种。
 *
 * 命中多条时取「关键字最长」的那条，也就是最具体的规则赢。
 * 原本是 find() 取储存顺序第一条，导致宽的规则永远盖过窄的：
 * "PUBLIC MUTUAL"→定投(INVEST) 会把「PUBLIC MUTUAL REDEMPTIONS（赎回，钱是进来的）」
 * 也标成投资。规则只看文字不看借贷方向，所以唯一的解法是让更长的关键字有机会赢。
 */
export async function matchCategoryByKeyword(userId: string, description: string): Promise<string | null> {
  const rules = await prisma.categoryRule.findMany({
    where: { category: { userId } },
    select: { keyword: true, categoryId: true },
  });
  const upperDesc = description.toUpperCase();
  const hits = rules.filter((r) => new RegExp(`\\b${escapeRegex(r.keyword.toUpperCase())}\\b`).test(upperDesc));
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.keyword.length - a.keyword.length);
  return hits[0].categoryId;
}
