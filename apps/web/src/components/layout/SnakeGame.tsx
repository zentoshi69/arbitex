"use client";

import { useRef, useEffect } from "react";

const CELL = 5;
const TICK_MS = 85;

type Pt = [number, number];

export function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;

    let raf = 0;
    let lastTick = 0;
    let cols = 0;
    let rows = 0;

    const resize = () => {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
      cols = Math.floor(canvas.width / CELL);
      rows = Math.floor(canvas.height / CELL);
    };
    resize();

    let snake: Pt[] = [];
    let food: Pt = [0, 0];
    let dx = 1;
    let dy = 0;
    let grow = 0;

    const occupied = (x: number, y: number) =>
      snake.some(([sx, sy]) => sx === x && sy === y);

    const spawnFood = () => {
      const set = new Set(snake.map(([x, y]) => `${x},${y}`));
      for (let i = 0; i < 400; i++) {
        const fx = Math.floor(Math.random() * cols);
        const fy = Math.floor(Math.random() * rows);
        if (!set.has(`${fx},${fy}`)) {
          food = [fx, fy];
          return;
        }
      }
    };

    const reset = () => {
      const cx = Math.floor(cols / 2);
      const cy = Math.floor(rows / 2);
      snake = [
        [cx, cy],
        [cx - 1, cy],
        [cx - 2, cy],
      ];
      dx = 1;
      dy = 0;
      grow = 0;
      spawnFood();
    };
    reset();

    const steer = () => {
      const [hx, hy] = snake[0];
      const dirs: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      let best: [number, number] = [dx, dy];
      let bestDist = Infinity;

      for (const [ddx, ddy] of dirs) {
        if (
          snake.length > 1 &&
          hx + ddx === snake[1][0] &&
          hy + ddy === snake[1][1]
        )
          continue;
        const nx = hx + ddx;
        const ny = hy + ddy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        if (occupied(nx, ny)) continue;

        // Prefer open space: count free neighbors of candidate
        let freedom = 0;
        for (const [fx, fy] of dirs) {
          const nnx = nx + fx;
          const nny = ny + fy;
          if (nnx >= 0 && nnx < cols && nny >= 0 && nny < rows && !occupied(nnx, nny))
            freedom++;
        }

        const dist = Math.abs(nx - food[0]) + Math.abs(ny - food[1]);
        const score = -dist * 4 + freedom + Math.random() * 0.5;

        if (score > -bestDist) {
          bestDist = -score;
          best = [ddx, ddy];
        }
      }
      [dx, dy] = best;
    };

    const tick = () => {
      steer();
      const [hx, hy] = snake[0];
      const nx = hx + dx;
      const ny = hy + dy;
      if (
        nx < 0 ||
        nx >= cols ||
        ny < 0 ||
        ny >= rows ||
        occupied(nx, ny)
      ) {
        reset();
        return;
      }
      snake.unshift([nx, ny]);
      if (nx === food[0] && ny === food[1]) {
        grow += 2;
        spawnFood();
      }
      if (grow > 0) grow--;
      else snake.pop();
      if (snake.length > 40) reset();
    };

    const draw = (ts: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const len = snake.length;
      for (let i = len - 1; i >= 0; i--) {
        const [x, y] = snake[i];
        const a = 0.25 + 0.75 * (1 - i / len);
        ctx.fillStyle = `rgba(232, 65, 66, ${a})`;
        ctx.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
      }

      const pulse = 0.35 + 0.3 * Math.sin(ts * 0.005);
      ctx.fillStyle = `rgba(232, 65, 66, ${pulse})`;
      ctx.beginPath();
      ctx.arc(
        food[0] * CELL + CELL / 2,
        food[1] * CELL + CELL / 2,
        CELL * 0.6,
        0,
        Math.PI * 2
      );
      ctx.fill();
    };

    const loop = (ts: number) => {
      if (ts - lastTick >= TICK_MS) {
        tick();
        lastTick = ts;
      }
      draw(ts);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      resize();
      reset();
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="h-full w-full" style={{ minWidth: 0 }}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
