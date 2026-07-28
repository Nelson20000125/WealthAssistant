"use client";

import { useEffect, useState } from "react";

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 数字从 0 数到 target，纯 requestAnimationFrame，不用动画库。
 *
 * 首次渲染（含 SSR hydration 那一刻）直接给 target，跟 server 渲染的文字保持完全一致——
 * Node 和浏览器的 Intl compact 格式化对 0 的输出不一定相同，会触发 hydration mismatch，
 * 所以「从 0 开始数」这个动画只在 mount 之后才启动，不影响 SSR 输出。
 * 尊重 prefers-reduced-motion：偏好减少动画时直接停在最终值，不做数字滚动。
 */
export function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      const raf = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(raf);
    }

    let raf: number;
    const start = performance.now();

    function tick(now: number) {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(target * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}
