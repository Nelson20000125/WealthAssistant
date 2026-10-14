// 月度同期比较的日期区间（P0-03）。
//
// 从前首页拿「9 月前 25 天」去比「完整的 8 月」，算出「支出 -88.3%」——
// 那不是省了钱，那是月份还没过完。进行中的月份只能比到同一个日号。

export type Range = { start: Date; end: Date };
export type MonthComparison = {
  /** 本月还没结束 —— 前端要标「截至今日」 */
  partial: boolean;
  current: Range;
  previous: Range;
};

/** 该月有几天（用 UTC，与流水存的日期同一套时区基准） */
function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * end 一律是开区间（查询用 `date < end`），所以「含今天」＝今天 +1 天。
 */
export function monthComparisonRange(today: Date): MonthComparison {
  const year = today.getUTCFullYear();
  const monthIndex = today.getUTCMonth();
  const day = today.getUTCDate();
  const partial = day < daysInMonth(year, monthIndex);

  const prevYear = monthIndex === 0 ? year - 1 : year;
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;

  if (!partial) {
    return {
      partial,
      current: { start: new Date(Date.UTC(year, monthIndex, 1)), end: new Date(Date.UTC(year, monthIndex + 1, 1)) },
      previous: {
        start: new Date(Date.UTC(prevYear, prevMonthIndex, 1)),
        end: new Date(Date.UTC(prevYear, prevMonthIndex + 1, 1)),
      },
    };
  }

  // 上月天数可能比今天的日号少（3/31 对 2 月）—— 夹到上月底，
  // 不夹的话 Date.UTC 会自动溢出到 3/3，比较区间静悄悄地错位。
  const prevDay = Math.min(day, daysInMonth(prevYear, prevMonthIndex));

  return {
    partial,
    current: {
      start: new Date(Date.UTC(year, monthIndex, 1)),
      end: new Date(Date.UTC(year, monthIndex, day + 1)),
    },
    previous: {
      start: new Date(Date.UTC(prevYear, prevMonthIndex, 1)),
      end: new Date(Date.UTC(prevYear, prevMonthIndex, prevDay + 1)),
    },
  };
}
