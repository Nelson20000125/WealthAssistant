import { describe, it, expect } from "vitest";
import { merchantName, maskSensitive } from "@/lib/merchant";

// 需求（P0-01）：对帐单描述不能直接当交易标题。
// 卡号 / 户口号一律遮蔽，只留末四码。

describe("maskSensitive", () => {
  it("把卡号收成末四码", () => {
    expect(maskSensitive("VISA4848100072413731")).toBe("VISA ••3731");
  });

  it("遮蔽夹在描述中间的长串数字", () => {
    expect(maskSensitive("Payment 20260903101 10000010000 TNGOW3MY1 7105")).toContain("••");
    expect(maskSensitive("Payment 20260903101 10000010000 TNGOW3MY1 7105")).not.toContain(
      "10000010000"
    );
  });

  it("不动短数字：金额、日期、门牌都要保留", () => {
    expect(maskSensitive("KOU FU KOPI 2026")).toBe("KOU FU KOPI 2026");
  });
});

describe("merchantName", () => {
  it("纯卡号描述抽不出商户，回传遮蔽后的字串而不是原文", () => {
    expect(merchantName("VISA4848100072413731")).toBe("VISA ••3731");
  });

  it("保留可读的商户名", () => {
    expect(merchantName("SHOPEE MALAYSIA")).toBe("SHOPEE MALAYSIA");
    expect(merchantName("Kou Fu Kopi Restaura")).toBe("Kou Fu Kopi Restaura");
  });

  it("剥掉商户名后面的参考号与日期", () => {
    expect(merchantName("PSS-TMN PELANGI INDAH 20260903 REF 8812774")).toBe(
      "PSS-TMN PELANGI INDAH"
    );
  });

  it("剥掉前缀的交易动词", () => {
    expect(merchantName("PAYMENT TO SHOPEE MALAYSIA")).toBe("SHOPEE MALAYSIA");
    expect(merchantName("DEBIT PURCHASE - GRAB* TRIP")).toBe("GRAB* TRIP");
  });

  it("空描述回空字串，让呼叫端自己决定退回什么", () => {
    expect(merchantName("")).toBe("");
    expect(merchantName("   ")).toBe("");
  });
});
