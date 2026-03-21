"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type TrackedToken = {
  id: string;
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  chainId: number;
  accentColor: string | null;
  isTracked: boolean;
  isEnabled: boolean;
  poolCount: number;
};

type TokenContextValue = {
  activeTokenId: string;
  setActiveTokenId: (id: string) => void;
  trackedTokens: TrackedToken[];
  activeToken: TrackedToken | null;
  isAll: boolean;
  isLoading: boolean;
};

const LS_KEY = "arbitex_active_token";

const TokenContext = createContext<TokenContextValue>({
  activeTokenId: "ALL",
  setActiveTokenId: () => {},
  trackedTokens: [],
  activeToken: null,
  isAll: true,
  isLoading: true,
});

export function useTokenContext() {
  return useContext(TokenContext);
}

export function TokenProvider({ children }: { children: ReactNode }) {
  const [activeTokenId, setActiveTokenIdState] = useState<string>("ALL");

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY);
    if (saved) setActiveTokenIdState(saved);
  }, []);

  const setActiveTokenId = (id: string) => {
    setActiveTokenIdState(id);
    localStorage.setItem(LS_KEY, id);
  };

  const { data: trackedTokens = [], isLoading } = useQuery<TrackedToken[]>({
    queryKey: ["tokens", "tracked"],
    queryFn: () => api.tokens.tracked(),
    staleTime: 30_000,
  });

  const activeToken =
    activeTokenId === "ALL"
      ? null
      : trackedTokens.find((t) => t.id === activeTokenId) ?? null;

  return (
    <TokenContext.Provider
      value={{
        activeTokenId,
        setActiveTokenId,
        trackedTokens,
        activeToken,
        isAll: activeTokenId === "ALL",
        isLoading,
      }}
    >
      {children}
    </TokenContext.Provider>
  );
}
