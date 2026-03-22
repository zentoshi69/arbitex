"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import type { WsEventMap } from "@arbitex/shared-types";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { TokenProvider } from "@/contexts/TokenContext";

// ── React Query ───────────────────────────────────────────────────────────────
const queryClientConfig = {
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
};

// ── WebSocket context ─────────────────────────────────────────────────────────
type WsContextValue = {
  socket: Socket | null;
  connected: boolean;
  on: <K extends keyof WsEventMap>(
    event: K,
    handler: (data: WsEventMap[K]) => void
  ) => () => void;
};

const WsContext = createContext<WsContextValue>({
  socket: null,
  connected: false,
  on: () => () => {},
});

export function useWs() {
  return useContext(WsContext);
}

function WsProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    const t =
      typeof window !== "undefined" ? localStorage.getItem("arbitex_token") ?? "" : "";
    setToken(t);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === "arbitex_token") setToken(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const wsToken = typeof window !== "undefined" ? token : "";

    // WebSocket connects directly to the API domain (can't proxy WS through Next.js rewrites).
    // Derive from current hostname: bitrunner3001.com → wss://api.bitrunner3001.com
    const wsBase =
      typeof window !== "undefined" && window.location.hostname !== "localhost"
        ? `wss://api.${window.location.hostname}`
        : "ws://localhost:3001";

    const socket = io(`${wsBase}/ws`, {
      auth: { token: wsToken },
      transports: ["websocket"],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", {
        channels: ["opportunities", "executions", "pnl", "risk", "system"],
      });
    });
    socket.on("disconnect", () => setConnected(false));

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [token]);

  const on = <K extends keyof WsEventMap>(
    event: K,
    handler: (data: WsEventMap[K]) => void
  ) => {
    socketRef.current?.on(event, handler as any);
    return () => { socketRef.current?.off(event, handler as any); };
  };

  return (
    <WsContext.Provider value={{ socket: socketRef.current, connected, on }}>
      {children}
    </WsContext.Provider>
  );
}

// ── Root provider ─────────────────────────────────────────────────────────────
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient(queryClientConfig));
  return (
    <QueryClientProvider client={queryClient}>
      <WsProvider>
        <WalletProvider>
          <TokenProvider>{children}</TokenProvider>
        </WalletProvider>
      </WsProvider>
    </QueryClientProvider>
  );
}
