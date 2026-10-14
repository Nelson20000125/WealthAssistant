import { describe, it, expect } from "vitest";
import { recordingStatus } from "@/lib/recordingStatus";

// 需求（P1-06）：断记提醒要是真实状态 ——「已 22 天没记账 / 9/4 起的对账单还没导入 [导入]」。
// 不准写死天数：天数从最后一笔交易日期算；对账单以「上个月结束了、却还没导入到月底」为准
// （银行月结单是按月出的，这才是「该导入了」的真实信号，不是拍一个 N 天）。

describe("recordingStatus 断记天数", () => {
  it("今天有记 → 0 天", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: "2026-09-29", lastImportedDate: null }).daysSinceLast).toBe(0);
  });

  it("从最后一笔交易日期算，跨月也对", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: "2026-09-07", lastImportedDate: null }).daysSinceLast).toBe(22);
    expect(recordingStatus({ today: "2026-10-02", lastTxDate: "2026-09-28", lastImportedDate: null }).daysSinceLast).toBe(4);
  });

  it("一笔都没有 → null（跟「0 天」是两回事）", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: null, lastImportedDate: null }).daysSinceLast).toBeNull();
  });

  it("记了未来日期的交易不会变成负天数", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: "2026-10-05", lastImportedDate: null }).daysSinceLast).toBe(0);
  });
});

describe("recordingStatus 对账单缺口", () => {
  it("导入只到 9/3，而 9 月已经过完 → 从 9/4 起缺", () => {
    expect(recordingStatus({ today: "2026-10-02", lastTxDate: "2026-10-01", lastImportedDate: "2026-09-03" }).importGapFrom).toBe("2026-09-04");
  });

  it("上个月的对账单已导入到月底 → 不提醒（这个月的还没出，不能催）", () => {
    expect(recordingStatus({ today: "2026-10-15", lastTxDate: "2026-10-14", lastImportedDate: "2026-09-30" }).importGapFrom).toBeNull();
  });

  it("导入到本月中间也不提醒：上个月已经齐了", () => {
    expect(recordingStatus({ today: "2026-10-15", lastTxDate: "2026-10-14", lastImportedDate: "2026-10-05" }).importGapFrom).toBeNull();
  });

  it("导入停在上个月中间 → 提醒，缺口从隔天开始", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: "2026-09-28", lastImportedDate: "2026-08-20" }).importGapFrom).toBe("2026-08-21");
  });

  it("跨年：1 月初时，去年 12 月没导入完也要提醒", () => {
    expect(recordingStatus({ today: "2027-01-03", lastTxDate: "2027-01-02", lastImportedDate: "2026-12-10" }).importGapFrom).toBe("2026-12-11");
  });

  it("从没导入过对账单 → 不提醒（不是每个人都用导入）", () => {
    expect(recordingStatus({ today: "2026-09-29", lastTxDate: "2026-09-28", lastImportedDate: null }).importGapFrom).toBeNull();
  });
});
