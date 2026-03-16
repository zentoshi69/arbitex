"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SectionHeader, Skeleton, EmptyState } from "@/components/ui";
import { FileText, ChevronDown, ChevronRight } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  RISK_CONFIG_UPDATED: "text-blue-400",
  KILL_SWITCH_ACTIVATED: "text-red-400",
  KILL_SWITCH_DEACTIVATED: "text-emerald-400",
  TOKEN_FLAGS_UPDATED: "text-amber-400",
  VENUE_DISABLED: "text-orange-400",
  VENUE_ENABLED: "text-emerald-400",
};

function DiffViewer({ diff }: { diff: any }) {
  if (!diff) return null;
  return (
    <pre className="text-[11px] font-mono bg-slate-950 rounded p-3 overflow-x-auto text-slate-300 border border-slate-800">
      {JSON.stringify(diff, null, 2)}
    </pre>
  );
}

function AuditRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const color = ACTION_COLORS[log.action] ?? "text-slate-300";

  return (
    <div className="border-b border-slate-800/60 last:border-0">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/30 transition-colors text-left"
      >
        <span className="text-slate-600 w-4">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className={`text-xs font-mono font-semibold ${color} w-52 flex-shrink-0`}>
          {log.action}
        </span>
        <span className="text-xs text-slate-400 flex-1 truncate">
          <span className="text-slate-300">{log.actor}</span>
          {" · "}
          <span className="text-slate-500">{log.entityType}:{log.entityId.slice(0, 8)}</span>
        </span>
        <span className="text-[11px] text-slate-500 font-mono flex-shrink-0">
          {new Date(log.createdAt).toLocaleString()}
        </span>
        {log.ipAddress && (
          <span className="text-[11px] text-slate-600 font-mono flex-shrink-0 hidden lg:block">
            {log.ipAddress}
          </span>
        )}
      </button>
      {expanded && log.diff && (
        <div className="px-4 pb-3 pl-11">
          <DiffViewer diff={log.diff} />
        </div>
      )}
    </div>
  );
}

async function fetchAuditLogs({ page, action }: { page: number; action: string }) {
  const BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";
  const token = typeof window !== "undefined" ? localStorage.getItem("arbitex_token") : null;
  const qs = new URLSearchParams({ page: String(page), limit: "50", ...(action !== "ALL" ? { action } : {}) });
  const res = await fetch(`${BASE}/api/v1/audit?${qs}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return res.json();
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["audit", page, actionFilter],
    queryFn: () => fetchAuditLogs({ page, action: actionFilter }),
    refetchInterval: 30_000,
  });

  const ACTIONS = [
    "ALL",
    "RISK_CONFIG_UPDATED",
    "KILL_SWITCH_ACTIVATED",
    "KILL_SWITCH_DEACTIVATED",
    "TOKEN_FLAGS_UPDATED",
    "VENUE_DISABLED",
    "VENUE_ENABLED",
  ];

  return (
    <div className="space-y-4 max-w-[1200px]">
      <SectionHeader
        title="Audit Log"
        description="Immutable append-only log of all operator actions"
      />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded text-sm text-slate-300 px-2 py-1.5 focus:outline-none focus:border-blue-600"
          >
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <span className="text-xs text-slate-500">
          Logs are read-only. No deletion through UI or API.
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {data?.pagination?.total ?? 0} total
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 bg-slate-950">
          <span className="w-4" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase w-52">Action</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase flex-1">Actor / Entity</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase">Timestamp</span>
        </div>

        {isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}

        {!isLoading && data?.items?.length === 0 && (
          <EmptyState message="No audit log entries" />
        )}

        {data?.items?.map((log: any) => (
          <AuditRow key={log.id} log={log} />
        ))}

        {data && data.pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-xs px-3 py-1.5 bg-slate-800 rounded disabled:opacity-40 text-slate-300 hover:bg-slate-700"
            >
              ← Prev
            </button>
            <span className="text-xs text-slate-500">Page {page} / {data.pagination.totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              className="text-xs px-3 py-1.5 bg-slate-800 rounded disabled:opacity-40 text-slate-300 hover:bg-slate-700"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
