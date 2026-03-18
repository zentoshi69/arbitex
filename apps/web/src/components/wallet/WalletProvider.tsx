"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { avalanche } from "viem/chains";

type WalletState = {
  available: boolean;
  connected: boolean;
  address: `0x${string}` | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToAvalanche: () => Promise<void>;
};

const WalletContext = createContext<WalletState>({
  available: false,
  connected: false,
  address: null,
  chainId: null,
  walletClient: null,
  connect: async () => {},
  disconnect: () => {},
  switchToAvalanche: async () => {},
});

function getEthereum(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).ethereum ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [ethereum, setEthereum] = useState<any | null>(null);
  const [available, setAvailable] = useState(false);
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Avoid SSR/client hydration mismatch by detecting the wallet after mount.
  useEffect(() => {
    const eth = getEthereum();
    setEthereum(eth);
    setAvailable(!!eth);
  }, []);

  const walletClient = useMemo(() => {
    if (!available) return null;
    return createWalletClient({
      chain: avalanche,
      transport: custom(ethereum),
    });
  }, [available, ethereum]);

  const refresh = useCallback(async () => {
    if (!walletClient) return;
    const [addrs, cId] = await Promise.all([
      walletClient.getAddresses().catch(() => [] as any),
      walletClient.getChainId().catch(() => null),
    ]);
    setAddress((addrs?.[0] as any) ?? null);
    setChainId(cId as any);
  }, [walletClient]);

  const connect = useCallback(async () => {
    if (!ethereum || !walletClient) throw new Error("No wallet detected (install MetaMask)");
    await ethereum.request({ method: "eth_requestAccounts" });
    await refresh();
  }, [ethereum, walletClient, refresh]);

  const disconnect = useCallback(() => {
    // EIP-1193 providers generally don't support programmatic disconnect; we just clear local state.
    setAddress(null);
    setChainId(null);
  }, []);

  const switchToAvalanche = useCallback(async () => {
    if (!ethereum) throw new Error("No wallet detected");
    const hex = "0xA86A"; // 43114
    try {
      await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e: any) {
      // If chain is not added, try add it.
      if (e?.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: "Avalanche C-Chain",
              nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
              rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
              blockExplorerUrls: ["https://snowtrace.io"],
            },
          ],
        });
      } else {
        throw e;
      }
    } finally {
      await refresh();
    }
  }, [ethereum, refresh]);

  useEffect(() => {
    if (!ethereum) return;
    const onAccountsChanged = (accs: string[]) => setAddress((accs?.[0] as any) ?? null);
    const onChainChanged = (c: string) => setChainId(parseInt(c, 16));
    ethereum.on?.("accountsChanged", onAccountsChanged);
    ethereum.on?.("chainChanged", onChainChanged);
    refresh();
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccountsChanged);
      ethereum.removeListener?.("chainChanged", onChainChanged);
    };
  }, [ethereum, refresh]);

  const value: WalletState = {
    available,
    connected: !!address,
    address,
    chainId,
    walletClient,
    connect,
    disconnect,
    switchToAvalanche,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  return useContext(WalletContext);
}

