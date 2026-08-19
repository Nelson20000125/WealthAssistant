import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parsePBEStatement, parseTNGStatement } from "@/lib/pdfStatement";
import { parsePBECsv } from "@/lib/csvStatement";
import { matchCategoryByKeyword } from "@/lib/categoryRules";
import { aiSuggestCategories } from "@/lib/aiCategorize";
import { partitionByExisting } from "@/lib/importDedupe";
import type { TxType } from "@/lib/transactions";

// 上传 PDF → 解析 → 关键字分类比对，只回传预览列表，不写 DB（汇入前必须先给用户看过再确认）
export async function POST(request: Request) {
  const session = await auth();
  const userId = session!.user.id;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("没有收到档案");
    const provider = String(formData.get("provider") ?? "PBE");
    const password = formData.get("password");

    const buffer = Buffer.from(await file.arrayBuffer());
    // 副档名分流：CSV 走文字解析，PDF 走原本的 pdfjs 流程。
    // provider 只在 PDF 时有意义（TNG 的 PDF 有密码），CSV 目前只有 PBE 一种格式。
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const parsed = isCsv
      ? parsePBECsv(buffer)
      : provider === "TNG"
        ? await parseTNGStatement(buffer, password ? String(password) : undefined)
        : await parsePBEStatement(buffer);

    const categories = await prisma.category.findMany({ where: { userId }, orderBy: [{ type: "asc" }, { name: "asc" }] });
    const categoryTypeById = new Map(categories.map((c) => [c.id, c.type as TxType]));
    const fallbackExpenseId = categories.find((c) => c.name === "其他" && c.type === "EXPENSE")!.id;
    const fallbackIncomeId = categories.find((c) => c.name === "其他" && c.type === "INCOME")!.id;

    // 重复侦测：命中的直接从预览里排除，不用使用者自己肉眼挑重复。
    // 判定规则见 lib/importDedupe.ts，confirm 那侧写入前会再挡一次。
    const { fresh, duplicates: skippedDuplicates } = await partitionByExisting(
      userId,
      parsed.transactions
    );

    const rows: {
      date: string;
      amount: number;
      direction: "DEBIT" | "CREDIT";
      description: string;
      categoryId: string;
      type: TxType | undefined;
      aiSuggested?: boolean;
    }[] = [];
    // 关键字规则没命中、落回「其他」的行，留着交给 AI 二次判断（比如没见过的餐厅/宠物店名）
    const unmatched: { index: number; description: string; direction: "DEBIT" | "CREDIT" }[] = [];

    for (const t of fresh) {
      const matchedCategoryId = await matchCategoryByKeyword(userId, t.description);
      const categoryId = matchedCategoryId ?? (t.direction === "DEBIT" ? fallbackExpenseId : fallbackIncomeId);
      const index = rows.length;
      rows.push({
        date: t.date.toISOString(),
        amount: t.amount,
        direction: t.direction,
        description: t.description,
        categoryId,
        type: categoryTypeById.get(categoryId),
      });
      if (!matchedCategoryId) unmatched.push({ index, description: t.description, direction: t.direction });
    }

    // AI 二次分类：只精修关键字规则抓不到、预设「其他」的行，不做 INVEST/TRANSFER 这种需要
    // domain knowledge 才能判断的分类（那些交给关键字规则，AI 瞎猜风险较高）
    const expenseCategoryNames = categories.filter((c) => c.type === "EXPENSE" && c.name !== "其他").map((c) => c.name);
    const incomeCategoryNames = categories.filter((c) => c.type === "INCOME" && c.name !== "其他").map((c) => c.name);
    const categoryIdByNameType = new Map(categories.map((c) => [`${c.type}|${c.name}`, c.id]));

    const [debitGuesses, creditGuesses] = await Promise.all([
      aiSuggestCategories(
        unmatched.filter((u) => u.direction === "DEBIT").map((u) => ({ index: u.index, description: u.description })),
        expenseCategoryNames
      ),
      aiSuggestCategories(
        unmatched.filter((u) => u.direction === "CREDIT").map((u) => ({ index: u.index, description: u.description })),
        incomeCategoryNames
      ),
    ]);
    for (const [index, name] of debitGuesses) {
      const id = categoryIdByNameType.get(`EXPENSE|${name}`);
      if (id) Object.assign(rows[index], { categoryId: id, type: "EXPENSE", aiSuggested: true });
    }
    for (const [index, name] of creditGuesses) {
      const id = categoryIdByNameType.get(`INCOME|${name}`);
      if (id) Object.assign(rows[index], { categoryId: id, type: "INCOME", aiSuggested: true });
    }

    return NextResponse.json({
      fileName: file.name,
      accountNumber: parsed.accountNumber,
      statementDate: parsed.statementDate?.toISOString() ?? null,
      warnings: parsed.warnings,
      skippedDuplicates,
      rows,
      categories: categories.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
