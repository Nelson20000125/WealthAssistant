import { describe, it, expect } from "vitest";
import { formatPct, formatShare, formatQuantity } from "@/lib/format";

// 百分比有两种语义，先前共用同一个 formatPct（写死 signDisplay: "exceptZero"），
// 结果占比也被加上了正号：
//
//   「现金 +59.3%」——读起来像现金涨了 59.3%，实际是现金占净资产 59.3%
//   持仓卡片里「配置占比 +29.6%」与其正下方的盈亏「+2.2%」格式完全一致，
//   两个意思完全不同的数字长得一模一样。
//
// 拆成两个函数：涨跌带号（+2.2% / -1.4%），占比不带号（29.6%）。

describe("formatPct —— 涨跌幅，带正负号", () => {
  it("正值带 +", () => {
    expect(formatPct(0.022)).toBe("+2.2%");
  });

  it("负值带 -", () => {
    expect(formatPct(-0.014)).toBe("-1.4%");
  });

  it("零不带号", () => {
    expect(formatPct(0)).toBe("0%");
  });
});

describe("formatShare —— 占比，绝不带正号", () => {
  it("占比不加正号", () => {
    expect(formatShare(0.593)).toBe("59.3%");
  });

  it("配置占比不加正号", () => {
    expect(formatShare(0.296)).toBe("29.6%");
  });

  it("零占比不加号", () => {
    expect(formatShare(0)).toBe("0%");
  });

  it("100% 不加号", () => {
    expect(formatShare(1)).toBe("100%");
  });

  it("小数位与 formatPct 一致，最多一位", () => {
    expect(formatShare(0.40449)).toBe("40.4%");
  });

  // 占比理论上不会是负的，但真出现时也不该被静默吃掉符号
  it("负值仍显示负号", () => {
    expect(formatShare(-0.05)).toBe("-5%");
  });
});

// 份额直接 {h.quantity} 渲染，浮点原样输出成 1.78529826143312（14 位小数）。
// 券商成交的碎股份额本来就是这种数，但读者需要的精度远低于此。
describe("formatQuantity —— 持仓份额", () => {
  it("碎股份额收敛到 6 位小数", () => {
    expect(formatQuantity(1.78529826143312)).toBe("1.785298");
  });

  it("小于 1 的份额同样收敛", () => {
    expect(formatQuantity(0.60599397007164)).toBe("0.605994");
  });

  it("整数份额不补小数点", () => {
    expect(formatQuantity(150)).toBe("150");
  });

  it("现金持仓的 quantity 恒为 1", () => {
    expect(formatQuantity(1)).toBe("1");
  });

  it("大数带千分位", () => {
    expect(formatQuantity(12345)).toBe("12,345");
  });

  it("末尾的零不保留", () => {
    expect(formatQuantity(2.5)).toBe("2.5");
  });
});
