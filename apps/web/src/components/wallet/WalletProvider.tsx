"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, type WalletClient } from "viem";
import { avalanche } from "viem/chains";

/* ── EIP-6963 types ──────────────────────────────────────────────────────── */

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export type DiscoveredWallet = {
  info: EIP6963ProviderInfo;
  provider: any;
};

/* ── Wallet priority (lower = higher priority) ───────────────────────────── */

const PRIORITY: Record<string, number> = {
  "app.core.extension": 0,
  "com.avalanche.core": 0,
  "io.metamask": 1,
  "com.trustwallet.app": 2,
  "app.phantom": 3,
};

function sortWallets(list: DiscoveredWallet[]) {
  return [...list].sort(
    (a, b) => (PRIORITY[a.info.rdns] ?? 99) - (PRIORITY[b.info.rdns] ?? 99)
  );
}

function isCoreRdns(rdns: string) {
  return rdns === "app.core.extension" || rdns === "com.avalanche.core";
}

/* ── Context shape ───────────────────────────────────────────────────────── */

type WalletState = {
  wallets: DiscoveredWallet[];
  available: boolean;
  connected: boolean;
  address: `0x${string}` | null;
  chainId: number | null;
  walletClient: WalletClient | null;
  activeWallet: DiscoveredWallet | null;
  connect: (wallet?: DiscoveredWallet) => Promise<void>;
  disconnect: () => void;
  switchToAvalanche: () => Promise<void>;
};

const WalletContext = createContext<WalletState>({
  wallets: [],
  available: false,
  connected: false,
  address: null,
  chainId: null,
  walletClient: null,
  activeWallet: null,
  connect: async () => {},
  disconnect: () => {},
  switchToAvalanche: async () => {},
});

/* ── Provider component ──────────────────────────────────────────────────── */

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  const [activeProvider, setActiveProvider] = useState<any>(null);
  const [activeWallet, setActiveWallet] = useState<DiscoveredWallet | null>(
    null
  );
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const walletMap = useRef(new Map<string, DiscoveredWallet>());

  /* ── EIP-6963 discovery ───────────────────────────────────────────────── */
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleAnnounce = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: EIP6963ProviderInfo;
          provider: any;
        }>
      ).detail;
      if (!detail?.info?.uuid) return;
      walletMap.current.set(detail.info.uuid, {
        info: detail.info,
        provider: detail.provider,
      });
      setWallets(sortWallets(Array.from(walletMap.current.values())));
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Legacy fallback: if no EIP-6963 wallets after 600ms, sniff globals
    const timer = setTimeout(() => {
      if (walletMap.current.size > 0) return;

      const coreEth = (window as any).avalanche;
      const eth = (window as any).ethereum;

      if (coreEth) {
        walletMap.current.set("legacy-core", {
          info: {
            uuid: "legacy-core",
            name: "Core",
            icon: "",
            rdns: "app.core.extension",
          },
          provider: coreEth,
        });
      }

      if (eth && eth !== coreEth) {
        const name = eth.isMetaMask
          ? "MetaMask"
          : eth.isTrust || eth.isTrustWallet
            ? "Trust Wallet"
            : "Browser Wallet";
        const rdns = eth.isMetaMask
          ? "io.metamask"
          : eth.isTrust || eth.isTrustWallet
            ? "com.trustwallet.app"
            : "unknown";
        walletMap.current.set("legacy-injected", {
          info: { uuid: "legacy-injected", name, icon: "", rdns },
          provider: eth,
        });
      }

      if (walletMap.current.size > 0) {
        setWallets(sortWallets(Array.from(walletMap.current.values())));
      }
    }, 600);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnounce);
      clearTimeout(timer);
    };
  }, []);

  /* ── Derived viem wallet client ────────────────────────────────────────── */
  const walletClient = useMemo(() => {
    if (!activeProvider) return null;
    return createWalletClient({
      chain: avalanche,
      transport: custom(activeProvider),
    });
  }, [activeProvider]);

  /* ── Connect ───────────────────────────────────────────────────────────── */
  const connect = useCallback(
    async (wallet?: DiscoveredWallet) => {
      const w = wallet ?? wallets[0];
      if (!w) throw new Error("No wallet available");

      const accounts = (await w.provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      const chainHex = (await w.provider.request({
        method: "eth_chainId",
      })) as string;

      setActiveProvider(w.provider);
      setActiveWallet(w);
      setAddress((accounts?.[0] as `0x${string}`) ?? null);
      setChainId(parseInt(chainHex, 16));
    },
    [wallets]
  );

  /* ── Disconnect ────────────────────────────────────────────────────────── */
  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setActiveProvider(null);
    setActiveWallet(null);
  }, []);

  /* ── Switch to Avalanche C-Chain ───────────────────────────────────────── */
  const switchToAvalanche = useCallback(async () => {
    if (!activeProvider) throw new Error("No wallet connected");
    const hex = "0xA86A";
    try {
      await activeProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (e: any) {
      if (e?.code === 4902) {
        await activeProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: hex,
              chainName: "Avalanche C-Chain",
              nativeCurrency: {
                name: "Avalanche",
                symbol: "AVAX",
                decimals: 18,
              },
              rpcUrls: [process.env["NEXT_PUBLIC_AVAX_RPC_URL"] ?? "https://api.avax.network/ext/bc/C/rpc"],
              blockExplorerUrls: ["https://snowtrace.io"],
            },
          ],
        });
      } else {
        throw e;
      }
    }
    setChainId(43114);
  }, [activeProvider]);

  /* ── Event listeners on the active provider ────────────────────────────── */
  useEffect(() => {
    if (!activeProvider) return;
    const onAccounts = (accs: string[]) =>
      setAddress((accs?.[0] as `0x${string}`) ?? null);
    const onChain = (c: string) => setChainId(parseInt(c, 16));
    activeProvider.on?.("accountsChanged", onAccounts);
    activeProvider.on?.("chainChanged", onChain);
    return () => {
      activeProvider.removeListener?.("accountsChanged", onAccounts);
      activeProvider.removeListener?.("chainChanged", onChain);
    };
  }, [activeProvider]);

  const value: WalletState = {
    wallets,
    available: wallets.length > 0,
    connected: !!address,
    address,
    chainId,
    walletClient,
    activeWallet,
    connect,
    disconnect,
    switchToAvalanche,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export { isCoreRdns };
