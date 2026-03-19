"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FrameRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
};

export function PerspectiveTunnel() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const rect = host.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  const frames = useMemo<FrameRect[]>(() => {
    const W = size.width;
    const H = size.height;
    if (!W || !H) return [];

    const count = 6;
    return Array.from({ length: count }, (_, i) => {
      const prog = i / count;
      const easedProg = Math.pow(prog, 2.2);
      const fw = W * (1 - easedProg) * 0.9;
      const fh = H * (1 - easedProg) * 0.85;
      const x = (W - fw) / 2;
      const y = (H - fh) / 2;
      const a = easedProg * 0.09;
      return { x, y, w: fw, h: fh, a };
    });
  }, [size.height, size.width]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <svg className="h-full w-full" viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <radialGradient id="tunnel-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(232,65,66,0.03)" />
            <stop offset="100%" stopColor="rgba(232,65,66,0)" />
          </radialGradient>
        </defs>

        <ellipse
          cx={size.width / 2}
          cy={size.height / 2}
          rx={Math.max(size.width * 0.28, 1)}
          ry={Math.max(size.height * 0.2, 1)}
          fill="url(#tunnel-center-glow)"
        />

        {frames.map((frame, idx) => (
          <rect
            key={idx}
            x={frame.x}
            y={frame.y}
            width={frame.w}
            height={frame.h}
            fill="none"
            stroke={`rgba(200,30,30,${frame.a})`}
            strokeWidth={0.5}
          />
        ))}
      </svg>
    </div>
  );
}
