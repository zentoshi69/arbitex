"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { SectionHeader, Skeleton } from "@/components/ui";
import { Settings, ToggleLeft, ToggleRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function VenueRow({ venue }: { venue: any }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: (isEnabled: boolean) => api.venues.update(venue.id, { isEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      setConfirming(false);
    },
  });

  return (
    <div className={cn(
      "flex items-center justify-between px-5 py-4 border-b border-slate-800 last:border-0",
      !venue.isEnabled && "opacity-60"
    )}>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-slate-200">{venue.name}</p>
          <span className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 bg-slate-800 rounded">
            {venue.protocol}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5 font-mono">
          {venue.routerAddress}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-semibold ${venue.isEnabled ? "text-emerald-400" : "text-slate-500"}`}>
          {venue.isEnabled ? "ENABLED" : "DISABLED"}
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">Confirm?</span>
            <button onClick={() => mutation.mutate(!venue.isEnabled)}
              className="text-xs px-2 py-1 bg-amber-700 hover:bg-amber-600 rounded text-white transition-colors">
              Yes
            </button>
            <button onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors">
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={mutation.isPending}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
              venue.isEnabled
                ? "bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300"
                : "bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300"
            )}
          >
            {venue.isEnabled
              ? <><ToggleRight className="w-3.5 h-3.5" /> Disable</>
              : <><ToggleLeft className="w-3.5 h-3.5" /> Enable</>
            }
          </button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: venues, isLoading: venuesLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.venues.list(),
  });

  const venueList = venues?.items ?? venues ?? [];

  return (
    <div className="space-y-6 max-w-[900px]">
      <SectionHeader
        title="Settings"
        description="Venue and chain configuration"
      />

      {/* Venue toggles */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Settings className="w-4 h-4 text-blue-400" />
            DEX Venues
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Disable a venue to stop all pool indexing and execution for that DEX.
            Changes take effect on next poll cycle.
          </p>
        </div>
        {venuesLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : venueList.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            No venues configured. Seed the database to add venues.
          </div>
        ) : (
          venueList.map((venue: any) => <VenueRow key={venue.id} venue={venue} />)
        )}
      </div>

      {/* System info */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-white">System Information</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            ["API URL", process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"],
            ["WS URL", process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001"],
            ["Dashboard Version", "v1.0.0-MVP"],
            ["Environment", process.env.NODE_ENV ?? "development"],
          ].map(([label, value]) => (
            <div key={label} className="bg-slate-800/60 rounded px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xs font-mono text-slate-300 mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Security notes */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-950/30 border border-amber-900/50">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-300 space-y-1">
          <p className="font-semibold">Security Reminders</p>
          <p>Private keys are never accessible through this dashboard. Wallet management requires direct server access.</p>
          <p>All configuration changes are logged to the audit trail with actor, timestamp, and diff.</p>
          <p>For production deployments, ensure <code className="font-mono bg-amber-950 px-1 rounded">MOCK_EXECUTION=false</code> and Flashbots relay is configured.</p>
        </div>
      </div>
    </div>
  );
}
