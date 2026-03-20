"use client";

import { useRef, useEffect, useMemo } from "react";

/**
 * LPBandChart — Canvas-based liquidity band visualization for V3 pools.
 *
 * Renders a bar chart showing liquidity depth per tick range.
 * Gap zones are shaded red, thin zones yellow, and healthy zones green.
 * A vertical line marks the current tick position.
 */

type Band = {
  tickLower: number;
  tickUpper: number;
  cumulativeLiquidity: string;
  isGapZone: boolean;
  isThinZone: boolean;
  isCliffPoint: boolean;
};

type Props = {
  poolAddress: string;
  bands?: Band[];
  currentTick?: number;
  height?: number;
};

export function LPBandChart({ poolAddress, bands, currentTick, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const sortedBands = useMemo(
    () => (bands ?? []).slice().sort((a, b) => a.tickLower - b.tickLower),
    [bands]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = wrap.clientWidth;
    const h = height;
    canvas.width = w;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    if (sortedBands.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("No LP band data available", w / 2, h / 2);
      return;
    }

    const minTick = sortedBands[0]!.tickLower;
    const maxTick = sortedBands[sortedBands.length - 1]!.tickUpper;
    const tickRange = maxTick - minTick || 1;

    const liquidities = sortedBands.map((b) => Number(b.cumulativeLiquidity));
    const maxLiq = Math.max(...liquidities, 1);

    const barGap = 1;
    const padding = 20;
    const chartW = w - padding * 2;
    const chartH = h - 30;

    for (let i = 0; i < sortedBands.length; i++) {
      const band = sortedBands[i]!;
      const liq = Number(band.cumulativeLiquidity);

      const x1 = padding + ((band.tickLower - minTick) / tickRange) * chartW;
      const x2 = padding + ((band.tickUpper - minTick) / tickRange) * chartW;
      const barW = Math.max(x2 - x1 - barGap, 2);
      const barH = (liq / maxLiq) * chartH;

      let color: string;
      if (band.isGapZone) {
        color = "rgba(232, 65, 66, 0.6)";
      } else if (band.isThinZone) {
        color = "rgba(245, 158, 11, 0.5)";
      } else if (band.isCliffPoint) {
        color = "rgba(168, 85, 247, 0.5)";
      } else {
        color = "rgba(74, 222, 128, 0.45)";
      }

      ctx.fillStyle = color;
      ctx.fillRect(x1, chartH - barH + 10, barW, barH);
    }

    if (currentTick != null) {
      const cx = padding + ((currentTick - minTick) / tickRange) * chartW;
      ctx.strokeStyle = "rgba(232, 65, 66, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(cx, 5);
      ctx.lineTo(cx, h - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(232, 65, 66, 0.9)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`tick ${currentTick}`, cx, h - 2);
    }

    // Legend
    ctx.font = "8px monospace";
    ctx.textAlign = "left";
    const legend = [
      { color: "rgba(74, 222, 128, 0.6)", label: "Normal" },
      { color: "rgba(245, 158, 11, 0.7)", label: "Thin" },
      { color: "rgba(232, 65, 66, 0.7)", label: "Gap" },
      { color: "rgba(168, 85, 247, 0.7)", label: "Cliff" },
    ];
    let lx = padding;
    for (const item of legend) {
      ctx.fillStyle = item.color;
      ctx.fillRect(lx, 2, 8, 8);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(item.label, lx + 11, 9);
      lx += ctx.measureText(item.label).width + 20;
    }
  }, [sortedBands, currentTick, height]);

  return (
    <div ref={wrapRef} className="w-full" style={{ minHeight: height }}>
      <canvas ref={canvasRef} className="block w-full" style={{ height }} />
    </div>
  );
}
