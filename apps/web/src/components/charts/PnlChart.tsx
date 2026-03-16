"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

type PnlPoint = {
  date: string;
  pnl: number;
  trades: number;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }} className="font-mono font-medium">
          {entry.name}: {
            entry.name === "PnL"
              ? `$${Number(entry.value).toFixed(2)}`
              : entry.value
          }
        </p>
      ))}
    </div>
  );
};

export function PnlChart({
  data,
  height = 240,
}: {
  data: PnlPoint[];
  height?: number;
}) {
  // Compute cumulative PnL
  let running = 0;
  const cumulative = data.map((d) => {
    running += d.pnl;
    return {
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      PnL: running,
      Trades: d.trades,
    };
  });

  if (cumulative.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-slate-600 text-sm"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  const maxPnl = Math.max(...cumulative.map((d) => d.PnL));
  const isPositive = maxPnl >= 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor={isPositive ? "#10b981" : "#ef4444"}
              stopOpacity={0.25}
            />
            <stop
              offset="95%"
              stopColor={isPositive ? "#10b981" : "#ef4444"}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11, fontFamily: "monospace" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={64}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="PnL"
          stroke={isPositive ? "#10b981" : "#ef4444"}
          strokeWidth={2}
          fill="url(#pnlGradient)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TradeBarChart({
  data,
  height = 180,
}: {
  data: PnlPoint[];
  height?: number;
}) {
  const formatted = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    PnL: d.pnl,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}`}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar
          dataKey="PnL"
          fill="#3b82f6"
          radius={[2, 2, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
