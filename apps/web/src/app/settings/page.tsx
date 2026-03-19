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
import { Settings, ToggleLeft, ToggleRight, AlertTriangle, ArrowRight, Plus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDexVenueIds } from "@/hooks/useDexVenueIds";
import { useMemo } from "react";
import { getRole } from "@/lib/auth";

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
            venue.isEnabled ? "text-[#4DD68C]" : "text-muted"
          )}
        >
          {venue.isEnabled ? "ENABLED" : "DISABLED"}
        </span>
        {confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#F59E0B]">Confirm?</span>
            <button
              onClick={() => mutation.mutate(!venue.isEnabled)}
              className="rounded-[2px] bg-[#B45309] px-2 py-1 text-xs text-white transition-colors hover:bg-[#D97706]"
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
                : "bg-[#4DD68C]/10 text-[#4DD68C] hover:bg-[#4DD68C]/20"
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
  const role = useMemo(() => getRole(), []);
  const isSuperAdmin = role === "SUPER_ADMIN";

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
        <div className="mb-3 flex items-start gap-3 rounded-[2px] border border-[var(--border)] bg-[rgba(255,255,255,0.02)] p-4">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--grey1)]" />
          <div className="text-[12px] leading-[1.7] text-[var(--grey1)]">
            <p className="mb-1.5 font-medium text-[var(--offwhite)]">What are DEX Venues?</p>
            <p>
              A <strong className="text-[var(--offwhite)]">venue</strong> is a decentralized exchange (DEX) that ArbitEx monitors for arbitrage opportunities.
              Each venue has a <strong className="text-[var(--offwhite)]">factory contract</strong> that creates trading pools and a{" "}
              <strong className="text-[var(--offwhite)]">router contract</strong> that executes swaps.
            </p>
            <p className="mt-1.5">
              ArbitEx scans all enabled venues for price discrepancies across the same token pairs. When the price on one venue is lower than another,
              it creates an arbitrage opportunity — buy low on venue A, sell high on venue B — capturing the spread as profit.
            </p>
            <p className="mt-1.5 text-[var(--grey2)]">
              Disabling a venue stops all pool indexing and trade execution for that DEX. Changes take effect on the next poll cycle (~15 seconds).
            </p>
          </div>
        </div>
        <Panel>
          <PanelHeader
            icon={<Settings className="h-3.5 w-3.5" />}
            title="DEX Venues"
            description="Enable or disable venues to control which DEXes the system scans."
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

      {/* System Information — Super Admin only */}
      {isSuperAdmin && (
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
      )}

      {/* Security Reminders — Super Admin only */}
      {isSuperAdmin && (
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
      )}
    </div>
  );
}
