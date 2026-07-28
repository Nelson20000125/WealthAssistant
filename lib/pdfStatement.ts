import { PDFParse } from "pdf-parse";
// @ts-expect-error pdfjs-dist 没有帮这个子路径附类型宣告，但档案确实存在，能正常 import
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

// pdfjs-dist（pdf-parse 底层用的）平常用「fake worker」在同一个 thread 里跑 worker 逻辑，
// 做法是动态 import 一个用 workerSrc（相对路径字串）算出来的模块——这个动态 import 的路径是
// 运行时才决定的，Turbopack 打包时猜不出实际文件在哪，会直接炸掉（"Setting up fake worker
// failed"）。改成静态 import worker 模块、塞进 globalThis.pdfjsWorker：pdfjs-dist 内部
// 在真的要动态 import 之前，会先检查 globalThis.pdfjsWorker.WorkerMessageHandler 存不存在，
// 存在就直接用、完全跳过那个 bundler 解析不了的动态 import（官方文档给的 Node 打包环境标准解法）。
(globalThis as unknown as { pdfjsWorker: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

// Public Bank (PBE) 网银 PDF 对帐单解析（方案 A：纯 regex + 状态机，不用 LLM）。
// 设计依据见与用户的讨论：debit/credit 栏位在文字层是合并的（只有「金额 balance」两个数字），
// 唯一可靠的方向判断法是用余额变化倒推：balanceAfter - 上一笔余额，正数是入账、负数是出账，
// 金额还能拿来交叉验证（算出来的 delta 绝对值应该等于这行的金额，兜不上就是解析出了问题）。
// 已用真实对帐单验证：解析出的 debit/credit 合计跟对帐单本身「RINGKASAN/SUMMARY」的官方
// 总额完全一致（零误差）。

const TXN_ROW = /^(?:(\d{2}\/\d{2})\s+)?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\t(.+)$/;
const MARKER = /(Balance From Last Statement|Balance B\/F|Balance C\/F|Closing Balance In This Statement)\s*([\d,]+\.\d{2})?/;
// 每页页尾的页码噪音，如 "Muka Surat 1 Daripada 4 Page 1 of 4"
const PAGE_NOISE = /^Muka Surat .* Page \d+ of \d+$/i;
const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export type StatementTransaction = {
  date: Date;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  balanceAfter: number;
  description: string;
};

export type ParsedStatement = {
  accountNumber: string | null;
  statementDate: Date | null;
  transactions: StatementTransaction[];
  warnings: string[];
};

function toNumber(s: string) {
  return parseFloat(s.replace(/,/g, ""));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** 对帐单日期只有 DD/MM，没有年份；跨年只会发生在「交易月份 > 对帐单结尾月份」时（如结尾是 1 月、交易是上一年 12 月） */
function resolveYear(month: number, statementYear: number, statementMonth: number) {
  return month > statementMonth ? statementYear - 1 : statementYear;
}

export async function parsePBEStatement(fileBuffer: Buffer): Promise<ParsedStatement> {
  const parser = new PDFParse({ data: fileBuffer });
  const { text: rawText } = await parser.getText();

  const acctMatch = rawText.match(/Account Number\s*(\d+)/);
  const dateMatch = rawText.match(/Statement Date\s*(\d{1,2})\s+(\w+)\s+(\d{4})/);
  let statementDate: Date | null = null;
  let statementYear = 0;
  let statementMonth = 0;
  if (dateMatch) {
    const monthKey = dateMatch[2].slice(0, 3).toLowerCase();
    statementMonth = MONTH_NAMES[monthKey] ?? 0;
    statementYear = toNumber(dateMatch[3]);
    if (statementMonth) {
      statementDate = new Date(Date.UTC(statementYear, statementMonth - 1, Number(dateMatch[1])));
    }
  }

  const warnings: string[] = [];
  if (!statementMonth) warnings.push("找不到 Statement Date，无法判断交易年份，请检查 PDF 格式是否变动");

  // 逐页切出「表头之后 ~ 页尾签名声明之前」的交易表格区域，页首地址/摘要噪音自然被切掉
  const pages = rawText.split(/DATE\s+TRANSACTION\s+DEBIT\s+CREDIT\s+BALANCE/);
  const windows = pages.slice(1).map((p) => {
    const endIdx = p.indexOf("Penyata ini dicetak");
    return endIdx === -1 ? p : p.slice(0, endIdx);
  });

  type RawTxn = { date: string | null; amount: number; balanceAfter: number; descLines: string[] };
  type Row = { kind: "txn"; date: string | null; amount: number; balanceAfter: number; desc: string } | { kind: "marker"; label: string; balance: number | null };

  let lastDate: string | null = null;
  let current: RawTxn | null = null;
  const rows: Row[] = [];

  function finalizeTxn() {
    if (!current) return;
    const desc = current.descLines.join(" ").replace(/\s+/g, " ").trim();
    rows.push({ kind: "txn", date: current.date, amount: current.amount, balanceAfter: current.balanceAfter, desc });
    current = null;
  }

  for (const win of windows) {
    const lines = win.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (PAGE_NOISE.test(line)) continue;

      const markerMatch = line.match(MARKER);
      if (markerMatch) {
        // Balance B/F / Balance C/F 只是换页时的重复列印，余额值跟前后交易自己的 balanceAfter
        // 完全冗余——不能拿来结算当前交易，因为有时一笔交易的描述续行会被印到下一页、
        // 夹在 Balance B/F 之后才出现（结算了就会把续行弄丢或错接到下一笔）
        if (markerMatch[1] === "Balance From Last Statement" || markerMatch[1] === "Closing Balance In This Statement") {
          finalizeTxn();
          rows.push({ kind: "marker", label: markerMatch[1], balance: markerMatch[2] ? toNumber(markerMatch[2]) : null });
        }
        const dm = line.match(/^(\d{2}\/\d{2})/);
        if (dm) lastDate = dm[1];
        continue;
      }

      const m = line.match(TXN_ROW);
      if (m) {
        finalizeTxn();
        const date = m[1] ?? lastDate;
        lastDate = date;
        current = { date, amount: toNumber(m[2]), balanceAfter: toNumber(m[3]), descLines: [m[4]] };
      } else if (current) {
        current.descLines.push(line);
      }
      // else: 表格开始前的噪音（如首页 RINGKASAN 摘要数字），没有正在处理的交易可以挂，直接丢弃
    }
  }
  finalizeTxn();

  // 依序核对余额链：delta = 这笔的 balanceAfter - 上一笔的 balanceAfter，
  // 正数是入账、负数是出账，金额应该等于 |delta|，兜不上就记警告（但仍然产生这笔交易，不静默吞掉）
  let runningBalance: number | null = null;
  const transactions: StatementTransaction[] = [];
  for (const r of rows) {
    if (r.kind === "marker") {
      if (r.balance !== null) runningBalance = r.balance;
      continue;
    }
    if (r.amount === 0) {
      // 零金额行（如手续费 0.00）不产生交易，但它的 balanceAfter 跟余额链是一致的，不用特别处理
      continue;
    }
    if (runningBalance === null) {
      warnings.push(`第一笔交易前找不到基准余额（Balance From Last Statement），跳过核对: ${r.desc}`);
      runningBalance = r.balanceAfter - r.amount;
    }
    const delta = round2(r.balanceAfter - runningBalance);
    const direction: "DEBIT" | "CREDIT" = delta >= 0 ? "CREDIT" : "DEBIT";
    if (Math.abs(Math.abs(delta) - r.amount) > 0.01) {
      warnings.push(`金额与余额差额不符（可能解析错误，请人工核对）: ${r.date} ${r.amount} "${r.desc}"`);
    }
    runningBalance = r.balanceAfter;

    if (!r.date) {
      warnings.push(`找不到日期，跳过: "${r.desc}"`);
      continue;
    }
    const [dd, mm] = r.date.split("/").map(Number);
    const year = statementMonth ? resolveYear(mm, statementYear, statementMonth) : new Date().getFullYear();
    transactions.push({
      date: new Date(Date.UTC(year, mm - 1, dd)),
      amount: r.amount,
      direction,
      balanceAfter: r.balanceAfter,
      description: r.desc,
    });
  }

  return {
    accountNumber: acctMatch?.[1] ?? null,
    statementDate,
    transactions,
    warnings,
  };
}

// TNG (Touch 'n Go) 电子钱包 PDF 交易记录解析。格式跟 PBE 不同：每笔交易的「金额 余额」
// 这行在区块最后面（不是最前面），且没有官方 SUMMARY 总额可以交叉核对——但每一行本来就有
// 完整的 Wallet Balance，一样能用余额变化链核对。跟 PBE 不同的地方是这份 PDF 有清楚的
// 交易类型栏位（Transfer to Wallet / Reload / DuitNow QR / Receive from Wallet /
// DUITNOW_RECEIVEFROM / Payment / Cashback），方向判断改用类型对照表为主，余额变化链为交叉验证
// （两者理论上要一致，兜不上就是解析出了问题）。
const TNG_HEADER = "Date Status Transaction Type Reference Description Details Amount (RM) Wallet Balance";
const TNG_START = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\S+)\s+(.*)$/;
const TNG_END = /^RM([\d,]+\.\d{2})\s+RM([\d,]+\.\d{2})$/;

// 已知交易类型 → 方向。这里用「交易区块前两行串接、去掉所有空白」去比对前缀，因为类型名称
// 有时会被 PDF 硬换行截断（如 "DUITNOW_RECEI" + 换行 + "VEFROM"），直接比对整行容易漏；
// 串接去空白后 "DUITNOW_RECEI" + "VEFROM" 会变回 "DUITNOWRECEIVEFROM"，用 startsWith 两种
// 情况都吃得到。较长/较具体的类型要排前面（"DuitNow QR TNGD" 是 "DuitNow QR" 的超集）。
const TNG_TYPE_DIRECTION: [string, "DEBIT" | "CREDIT"][] = [
  ["DuitNowQRTNGD", "DEBIT"],
  ["DuitNowQR", "DEBIT"],
  ["TransfertoWallet", "DEBIT"],
  ["Payment", "DEBIT"],
  ["Reload", "CREDIT"],
  ["ReceivefromWallet", "CREDIT"],
  ["DUITNOW_RECEIVEFROM", "CREDIT"],
  ["Cashback", "CREDIT"],
];

function detectTngType(probe: string): { type: string; direction: "DEBIT" | "CREDIT" } | null {
  const stripped = probe.replace(/\s+/g, "");
  for (const [type, direction] of TNG_TYPE_DIRECTION) {
    if (stripped.startsWith(type)) return { type, direction };
  }
  return null;
}

export async function parseTNGStatement(fileBuffer: Buffer, password?: string): Promise<ParsedStatement> {
  const parser = new PDFParse({ data: fileBuffer, password });
  const { text: rawText } = await parser.getText();

  const warnings: string[] = [];
  const headerIdx = rawText.indexOf(TNG_HEADER);
  if (headerIdx === -1) {
    warnings.push("找不到交易表头，PDF 格式可能已变动，无法解析");
    return { accountNumber: null, statementDate: null, transactions: [], warnings };
  }

  const lines = rawText
    .slice(headerIdx + TNG_HEADER.length)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  type RawTxn = { date: string; status: string; lines: string[] };
  type Row = { date: string; status: string; amount: number; balanceAfter: number; typeProbe: string; descLines: string[] };

  let current: RawTxn | null = null;
  const rows: Row[] = [];

  for (const line of lines) {
    // 每页页尾免责声明第一行；第二行不用特别挡，这时 current 已经被上面的金额行结算成 null，
    // 后面「没有正在处理的交易」的分支会自然把它当噪音丢掉
    if (line.startsWith("*This is a system generated")) continue;

    const startMatch = line.match(TNG_START);
    if (startMatch) {
      if (current) warnings.push(`交易区块未正常结束就遇到下一笔，可能漏解析: ${current.lines.join(" ")}`);
      current = { date: startMatch[1], status: startMatch[2], lines: [startMatch[3]] };
      continue;
    }

    const endMatch = line.match(TNG_END);
    if (endMatch && current) {
      rows.push({
        date: current.date,
        status: current.status,
        amount: toNumber(endMatch[1]),
        balanceAfter: toNumber(endMatch[2]),
        typeProbe: current.lines.slice(0, 2).join(""),
        descLines: current.lines,
      });
      current = null;
      continue;
    }

    if (current) current.lines.push(line);
    // else: 表格外噪音（页首帐户资讯等），没有正在处理的交易可以挂，直接丢弃
  }

  let runningBalance: number | null = null;
  const transactions: StatementTransaction[] = [];
  for (const r of rows) {
    if (r.status !== "Success") {
      warnings.push(`交易状态非 Success（${r.status}），跳过: ${r.descLines.join(" ")}`);
      continue;
    }

    const detected = detectTngType(r.typeProbe);
    let direction: "DEBIT" | "CREDIT";
    if (detected) {
      direction = detected.direction;
    } else {
      warnings.push(`无法辨识交易类型「${r.typeProbe}」，改用余额变化猜方向，建议人工核对: ${r.descLines.join(" ")}`);
      direction = runningBalance !== null && r.balanceAfter < runningBalance ? "DEBIT" : "CREDIT";
    }

    if (runningBalance !== null) {
      const delta = round2(r.balanceAfter - runningBalance);
      const expectedDirection = delta >= 0 ? "CREDIT" : "DEBIT";
      if (expectedDirection !== direction || Math.abs(Math.abs(delta) - r.amount) > 0.01) {
        warnings.push(`方向或金额与余额变化不符（可能解析错误，请人工核对）: ${r.date} RM${r.amount} "${r.descLines.join(" ")}"`);
      }
    }
    runningBalance = r.balanceAfter;

    const [dd, mm, yyyy] = r.date.split("/").map(Number);
    transactions.push({
      date: new Date(Date.UTC(yyyy, mm - 1, dd)),
      amount: r.amount,
      direction,
      balanceAfter: r.balanceAfter,
      // 原始行本身就含类型字样（如 "Reload"/"Transfer to Wallet"），"RELOAD" 分类关键字规则
      // 就是靠这个抓到，不用另外拼一次类型标签进来
      description: r.descLines.join(" ").replace(/\s+/g, " ").trim(),
    });
  }

  return { accountNumber: null, statementDate: null, transactions, warnings };
}
