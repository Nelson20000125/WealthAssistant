import type { ParsedStatement, StatementTransaction } from "@/lib/pdfStatement";
import { formatMYR } from "@/lib/format";

// Public Bank (PBE) 网银 CSV 汇出解析。回传跟 PDF 版同一个 ParsedStatement 契约，
// 所以 parse/confirm 两阶段管线、去重、ImportBatch、预览 UI 全部沿用，不必重做。
//
// 这份格式的六个坑，都是拿真实汇出档验证过的：
//  1. 表头只声明 5 栏，资料列实际有 9~11 栏 —— 多出来的尾巴是对手方/商户摘要，
//     而那正是自动分类要用的东西，照表头解析会全部丢掉
//  2. 日期是 DD-MM-YYYY。丢给 new Date() 会被当成 MM-DD-YYYY，日 <= 12 时静默解析成错的月份
//  3. 未过账的列在日期后面黏 "(Unposted)"。当成正式交易汇入，等它真的入帐时会重复计算
//  4. 参考号大量是 '000000000'，不能当去重键
//  5. 没有逐笔余额，只有 metadata 里一个 Current Balance
//  6. 列的顺序是新到旧（descending）

const META_CURRENT_BALANCE = /^Current Balance:\s*,\s*RM\s*([\d,]+\.?\d*)/i;
const META_ACCOUNT = /^Account Number:\s*,\s*(.+?)\s*$/i;
const META_TO_DATE = /^To Date:\s*,\s*(\d{2}-\d{2}-\d{4})/i;
const HEADER_ROW = /^Transaction Date\s*,/i;
const UNPOSTED = /\(Unposted\)/i;

function toNumber(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** DD-MM-YYYY -> Date（UTC 零点）。绝不用 new Date(string)，它会把 DD-MM 当成 MM-DD。 */
function parseDdMmYyyy(s: string): Date | null {
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d));
}

type RawRow = {
  date: Date;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  description: string;
};

export function parsePBECsv(fileBuffer: Buffer): ParsedStatement {
  const warnings: string[] = [];
  const text = fileBuffer.toString("utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  let accountNumber: string | null = null;
  let statementDate: Date | null = null;
  let currentBalance: number | null = null;
  let headerIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headerIdx === -1 && HEADER_ROW.test(line)) { headerIdx = i; break; }
    const acc = line.match(META_ACCOUNT);
    if (acc) accountNumber = acc[1];
    const to = line.match(META_TO_DATE);
    if (to) statementDate = parseDdMmYyyy(to[1]);
    const bal = line.match(META_CURRENT_BALANCE);
    if (bal) currentBalance = toNumber(bal[1]);
  }

  if (headerIdx === -1) {
    return { accountNumber, statementDate, transactions: [], warnings: ["找不到表头列（Transaction Date...），这可能不是 Public Bank 的 CSV 汇出档"] };
  }
  if (currentBalance === null) {
    warnings.push("metadata 里没有 Current Balance，无法倒推逐笔余额（balanceAfter 会是 0）");
  }

  const rows: RawRow[] = [];
  let unpostedCount = 0;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;

    // 不做引号感知切分：这份格式的描述是定宽补空白、不含逗号，
    // 栏位 5 之后全部是摘要尾巴，直接 join 回去即可。
    const f = line.split(",");
    if (f.length < 5) {
      warnings.push(`第 ${i + 1} 行栏位不足（${f.length} 栏），已跳过`);
      continue;
    }

    // 坑 3：未过账。跳过，不然它真正入帐时会被重复汇入一次。
    if (UNPOSTED.test(f[0])) {
      unpostedCount++;
      continue;
    }

    const date = parseDdMmYyyy(f[0]);
    if (!date) {
      warnings.push(`第 ${i + 1} 行日期无法解析：「${f[0].trim()}」，已跳过`);
      continue;
    }

    const debit = toNumber(f[3]);
    const credit = toNumber(f[4]);

    // 防御：借贷两栏都空或都有值，代表栏位错位（例如描述里混进逗号）
    if ((debit === null && credit === null) || (debit !== null && credit !== null)) {
      warnings.push(`第 ${i + 1} 行借贷栏异常（debit="${f[3].trim()}" credit="${f[4].trim()}"），已跳过`);
      continue;
    }

    // 坑 1：栏位 5 之后是对手方/商户摘要，接回描述里，自动分类才有料可比对
    const tail = f.slice(5).map((x) => x.trim()).filter((x) => x !== "").join(" ");
    const description = [f[2].trim(), tail].filter((x) => x !== "").join(" | ");

    rows.push({
      date,
      amount: (debit ?? credit)!,
      direction: debit !== null ? "DEBIT" : "CREDIT",
      description,
    });
  }

  if (unpostedCount > 0) {
    warnings.push(
      `已跳过 ${unpostedCount} 笔未过账（Unposted）交易。它们尚未入帐，等真正过账后再汇入，避免重复计算。`
    );
  }

  // 坑 5+6：没有逐笔余额，但列是新到旧，且 Current Balance 是最新一笔过账後的余额。
  // 从最新往回走：本笔 balanceAfter 减掉本笔的带号金额 = 上一笔（较旧那笔）的 balanceAfter。
  const transactions: StatementTransaction[] = [];
  let running = currentBalance ?? 0;
  for (const r of rows) {
    transactions.push({ ...r, balanceAfter: Math.round(running * 100) / 100 });
    running -= r.direction === "CREDIT" ? r.amount : -r.amount;
  }

  // 倒推完剩下的就是本期期初余额，拿来做健全性检查
  if (currentBalance !== null) {
    warnings.push(`倒推所得本期期初余额：${formatMYR(Math.round(running * 100) / 100)}（可与上期结余核对）`);
  }

  // 汇入端预期由旧到新，翻转回来
  transactions.reverse();

  return { accountNumber, statementDate, transactions, warnings };
}
