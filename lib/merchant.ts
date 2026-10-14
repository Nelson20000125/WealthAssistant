// 对帐单描述 → 可读的商户名 + 敏感号码遮蔽（P0-01）。
//
// 刻意做成显示层的纯函数、不加资料库栏位：既有的几千笔流水不必回填，
// 解析规则改了也立刻对全部历史生效。银行原始描述仍完整存在
// Transaction.description 里，交易详情要显示「原始备注」时读它就好。

/** 长度 >= 6 的连续数字视为卡号/户口号/参考号，只留末四码 */
const LONG_DIGITS = /\d{6,}/g;

/**
 * 遮蔽敏感号码。门槛订在 6 位数是因为要放过金额（812.40）、
 * 年份（2026）、门牌与四位数分行码 —— 那些遮掉只会让描述读不懂。
 */
export function maskSensitive(text: string): string {
  return text
    // 字母紧接长号码时补个空格，否则遮完是 "VISA••3731" 黏成一团
    .replace(/([a-z])(\d{6,})/gi, "$1 $2")
    .replace(LONG_DIGITS, (digits) => `••${digits.slice(-4)}`);
}

// 对帐单前缀的交易动词，本身不带任何商户信息
const LEADING_NOISE =
  /^(?:payment\s+to|payment|debit\s+purchase|credit\s+purchase|purchase|pos\s+debit|dr|cr|transfer\s+to|transfer|ibg|duitnow|fpx)\b[\s\-:*]*/i;

// 商户名后面挂的参考号 / 日期串。一旦出现就把它连同后面全部截掉：
// 对帐单的格式是「商户名 + 一堆机器用的编号」，编号之后不会再有人读得懂的东西。
const TRAILING_REF = /\s+(?:\d{6,}|ref\b|\d{2}\/\d{2}\/\d{2,4}|\d{8})[\s\S]*$/i;

/**
 * 从银行描述抽商户名。抽不出可读内容时回传遮蔽后的原文
 * （而不是原文本身 —— 那正是会把整串卡号印在首页上的路径）。
 */
export function merchantName(description: string): string {
  const raw = description.trim();
  if (!raw) return "";

  const stripped = raw.replace(LEADING_NOISE, "").replace(TRAILING_REF, "").trim();

  // 剥完只剩符号或纯数字 = 这串描述里本来就没有商户名（如 VISA4848100072413731）
  if (!/[a-z一-鿿]{2,}/i.test(stripped)) return maskSensitive(raw);

  return maskSensitive(stripped);
}
