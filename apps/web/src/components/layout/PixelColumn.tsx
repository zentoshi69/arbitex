"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type CoinGeckoSimplePrice = Record<string, { usd?: number }>;

export type PixelColumnHandle = {
  firePixel: (isBuy: boolean) => void;
};

const PIXEL_COUNT = 28;

export const PixelColumn = forwardRef<PixelColumnHandle>(function PixelColumn(_, ref) {
  const [buyPressure, setBuyPressure] = useState(0.1);
  const [sellPressure, setSellPressure] = useState(0.1);
  const prevAvaxRef = useRef<number | null>(null);

  const pushPressure = (isBuy: boolean) => {
    if (isBuy) {
      setBuyPressure((value) => Math.min(1, value + 0.12));
    } else {
      setSellPressure((value) => Math.min(1, value + 0.12));
    }
  };

  useImperativeHandle(ref, () => ({
    firePixel: (isBuy: boolean) => pushPressure(isBuy),
  }));

  const avaxQuery = useQuery({
    queryKey: ["ui", "coingecko", "avax-btc"],
    queryFn: async () => {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=avalanche-2&vs_currencies=usd"
      );
      if (!res.ok) throw new Error(`CoinGecko failed ${res.status}`);
      return (await res.json()) as CoinGeckoSimplePrice;
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  useEffect(() => {
    const price = avaxQuery.data?.["avalanche-2"]?.usd;
    if (!price || !Number.isFinite(price)) return;
    const prev = prevAvaxRef.current;
    if (prev !== null) {
      if (price > prev) pushPressure(true);
      if (price < prev) pushPressure(false);
    }
    prevAvaxRef.current = price;
  }, [avaxQuery.data]);

  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      setBuyPressure((value) => Math.max(0.05, value - 0.015));
      setSellPressure((value) => Math.max(0.05, value - 0.015));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const loop = () => {
      if (!active) return;
      const isBuy = Math.random() < 0.52;
      pushPressure(isBuy);
      const delay = Math.floor(120 + Math.random() * 480);
      timeoutId = setTimeout(loop, delay);
    };

    loop();
    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const buyCount = Math.round(buyPressure * PIXEL_COUNT * 0.5);
  const sellCount = Math.round(sellPressure * PIXEL_COUNT * 0.5);

  return (
    <div className="absolute bottom-0 right-0 top-0 z-[6] w-[28px] border-l border-[var(--border)]">
      <div className="flex h-full flex-col justify-between gap-1 px-[9px] py-2">
        {Array.from({ length: PIXEL_COUNT }, (_, index) => {
          const fromTop = index;
          const fromBottom = PIXEL_COUNT - 1 - index;
          const inSell = fromTop < sellCount;
          const inBuy = fromBottom < buyCount;

          let bg = "rgba(37,37,35,0.30)";
          if (inSell) {
            const tipStrength = sellCount <= 1 ? 1 : 1 - fromTop / Math.max(sellCount - 1, 1);
            const intensity = 0.3 + tipStrength * 0.65;
            bg = `rgba(232,65,66,${intensity.toFixed(3)})`;
          } else if (inBuy) {
            const tipStrength = buyCount <= 1 ? 1 : 1 - fromBottom / Math.max(buyCount - 1, 1);
            const intensity = 0.3 + tipStrength * 0.65;
            bg = `rgba(77,214,140,${intensity.toFixed(3)})`;
          }

          return (
            <div
              key={index}
              className="h-[10px] w-[10px]"
              style={{
                background: bg,
                clipPath:
                  "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
});
