"use client";

import { useEffect, useState } from "react";

const LS_PANGOLIN = "arbitex_venue_pangolin_v2";
const LS_BLACKHOLE = "arbitex_venue_blackhole_v2";

export function useDexVenueIds() {
  const [pangolinVenueId, setPangolinVenueId] = useState<string>("");
  const [blackholeVenueId, setBlackholeVenueId] = useState<string>("");

  useEffect(() => {
    setPangolinVenueId(localStorage.getItem(LS_PANGOLIN) ?? "");
    setBlackholeVenueId(localStorage.getItem(LS_BLACKHOLE) ?? "");
  }, []);

  function save(next: { pangolinVenueId: string; blackholeVenueId: string }) {
    localStorage.setItem(LS_PANGOLIN, next.pangolinVenueId);
    localStorage.setItem(LS_BLACKHOLE, next.blackholeVenueId);
    setPangolinVenueId(next.pangolinVenueId);
    setBlackholeVenueId(next.blackholeVenueId);
  }

  return { pangolinVenueId, blackholeVenueId, save };
}

