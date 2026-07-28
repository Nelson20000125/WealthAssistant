"use client";

import { useEffect, useState } from "react";
import { useCountUp } from "@/hooks/useCountUp";

const R = 60;
const STROKE = 14;
const CIRC = 2 * Math.PI * R;

function scoreColor(score: number) {
  if (score >= 70) return "var(--good)";
  // 40 分以上算「需要留意」，用琥珀色；只有真的很低（<20）才用红色，
  // 避免顾问语气的产品一打开就给人「报警」的感觉
  if (score >= 20) return "var(--warning)";
  return "var(--critical)";
}

export default function HealthScoreRing({ score }: { score: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const animatedScore = useCountUp(score, 800);
  const color = scoreColor(score);
  const len = (score / 100) * CIRC;
  const dashArray = `${Math.max(len - 1.5, 0)} ${CIRC - Math.max(len - 1.5, 0)}`;

  return (
    <div className="relative h-[152px] w-[152px] shrink-0">
      <svg viewBox="0 0 144 144" className="h-full w-full -rotate-90">
        <circle cx="72" cy="72" r={R} fill="none" stroke="var(--line)" strokeWidth={STROKE} />
        <circle
          cx="72"
          cy="72"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeDasharray={mounted ? dashArray : `0 ${CIRC}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 800ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-semibold tabular-nums text-ink">{Math.round(animatedScore)}</div>
        <div className="text-[11px] text-ink-muted">健康分</div>
      </div>
    </div>
  );
}
