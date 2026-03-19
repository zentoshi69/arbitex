"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  SectionHeader,
  PageHeader,
  Button,
  Panel,
  PanelHeader,
  VenueSelect,
  EmptyState,
  InfoGrid,
  Alert,
  Tag,
  Skeleton,
} from "@/components/ui";
import { Settings, ToggleLeft, ToggleRight, AlertTriangle, ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDexVenueIds } from "@/hooks/useDexVenueIds";
import { useMemo } from "react";

function VenueRow({ venue }: { venue: any }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: (isEnabled: boolean) =>
      api.venues.update(venue.id, { isEnabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venues"] });
      setConfirming(false);
    },
  });

  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-border px-4 py-4 last:border-0",
        !venue.isEnabled && "opacity-60"
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-medium text-white">{venue.name}</p>
          <span className="rounded-[2px] border border-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {venue.protocol}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[10.5px] text-dim">
          {venue.routerAddress}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "text-xs font-semibold",
            venue.isEnabled ? "text-[#4ADE80]" : "text-muted"
          )}
        >
          {venue.isEnabled ? "ENABLED" : "DISABLED"}
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-400">Confirm?</span>
            <button
              onClick={() => mutation.mutate(!venue.isEnabled)}
              className="rounded-[2px] bg-amber-700 px-2 py-1 text-xs text-white transition-colors hover:bg-amber-600"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="rounded-[2px] bg-bg-hover px-2 py-1 text-xs text-dim transition-colors hover:bg-border-hi"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={mutation.isPending}
            className={cn(
              "flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 text-xs font-medium transition-colors duration-[0.12s]",
              venue.isEnabled
                ? "bg-red/10 text-dim hover:bg-red/20 hover:text-red"
                : "bg-[#4ADE80]/10 text-[#4ADE80] hover:bg-[#4ADE80]/20"
            )}
          >
            {venue.isEnabled ? (
              <>
                <ToggleRight className="h-3.5 w-3.5" /> Disable
              </>
            ) : (
              <>
                <ToggleLeft className="h-3.5 w-3.5" /> Enable
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { data: venuesData, isLoading: venuesLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => api.venues.list(),
  });

  const { pangolinVenueId, blackholeVenueId, save } = useDexVenueIds();

  const venueList = Array.isArray(venuesData)
    ? venuesData
    : (venuesData as any)?.items ?? [];

  const avaxVenues = useMemo(
    () => (venueList as any[]).filter((v: any) => v.chainId === 43114),
    [venueList]
  );

  const activeCount = (venueList as any[]).filter(
    (v: any) => v.isEnabled
  ).length;

  return (
    <div className="max-w-[900px] space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Venue and chain configuration"
        actions={
          <>
            <Button variant="ghost">Export config</Button>
            <Button variant="primary" icon={<ArrowRight className="h-3 w-3" />}>
              Deploy changes
            </Button>
          </>
        }
      />

      {/* Live Prices — Venue Selection */}
      <section>
        <SectionHeader label="Live Prices — Venue Selection" />
        <Panel className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <VenueSelect
              label="Pangolin V2 venue"
              value={pangolinVenueId}
              options={avaxVenues}
              onChange={(v) => save({ pangolinVenueId: v, blackholeVenueId })}
              chainLabel=""
            />
            <VenueSelect
              label="Blackhole V2 venue"
              value={blackholeVenueId}
              options={avaxVenues}
              onChange={(v) => save({ pangolinVenueId, blackholeVenueId: v })}
              chainLabel=""
            />
          </div>
          <p className="mt-3 text-[9.5px] text-muted">
            Prices show once the three pools are registered under these venues.
          </p>
        </Panel>
      </section>

      {/* DEX Venues */}
      <section>
        <SectionHeader
          label="DEX Venues"
          tag={<Tag variant="gray">{activeCount} Active</Tag>}
        />
        <Panel>
          <PanelHeader
            icon={<Settings className="h-3.5 w-3.5" />}
            title="DEX Venues"
            description="Disable a venue to stop all pool indexing and execution for that DEX. Changes take effect on next poll cycle."
            action={
              <Button variant="ghost" icon={<Plus className="h-3 w-3" />}>
                Add venue
              </Button>
            }
          />
          {venuesLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-[2px]" />
              ))}
            </div>
          ) : venueList.length === 0 ? (
            <EmptyState
              message="No venues configured"
              hint={
                <>
                  Seed the database to add venues — see{" "}
                  <code>pnpm db:seed</code>
                </>
              }
            />
          ) : (
            venueList.map((venue: any) => (
              <VenueRow key={venue.id} venue={venue} />
            ))
          )}
        </Panel>
      </section>

      {/* System Information */}
      <section>
        <SectionHeader label="System Information" />
        <Panel>
          <PanelHeader
            icon={<Settings className="h-3.5 w-3.5" />}
            title="System Info"
          />
          <div className="p-4 pt-0">
            <InfoGrid
              items={[
                [
                  "API URL",
                  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
                ],
                [
                  "WS URL",
                  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001",
                ],
                ["Dashboard Version", "v1.0.0-MVP"],
                ["Environment", process.env.NODE_ENV ?? "development"],
              ]}
            />
          </div>
        </Panel>
      </section>

      {/* Security Reminders */}
      <section>
        <SectionHeader label="Security Reminders" />
        <Alert
          variant="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Security Reminders"
        >
          <p>Private keys are never accessible through this dashboard. Wallet management requires direct server access.</p>
          <p>All configuration changes are logged to the audit trail with actor, timestamp, and diff.</p>
          <p>
            For production deployments, ensure{" "}
            <code>MOCK_EXECUTION=false</code> and Flashbots relay is configured.
          </p>
        </Alert>
      </section>
    </div>
  );
}
