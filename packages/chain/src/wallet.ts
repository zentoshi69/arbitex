import {
  createWalletClient,
  http,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";
import { getChain } from "./client.js";

// Web3 v3 keystore decrypt — uses Node.js crypto
import { decrypt as decryptKeystore } from "@ethereumjs/wallet";

export type SignerConfig = {
  keystorePath: string;
  keystorePassword: string;
  rpcUrl: string;
  chainId: number;
};

export type WalletAbstraction = {
  address: `0x${string}`;
  signTransaction: (txRequest: unknown) => Promise<Hex>;
  sendTransaction: (txRequest: unknown) => Promise<Hex>;
  client: WalletClient<Transport, Chain, Account>;
};

/**
 * Load wallet from encrypted web3 v3 keystore.
 * Private key is held only in memory for the lifetime of this object.
 * Never expose walletAbstraction to external modules — pass address only.
 */
export async function loadWalletFromKeystore(
  cfg: SignerConfig
): Promise<WalletAbstraction> {
  const keystoreJson = readFileSync(cfg.keystorePath, "utf-8");
  const keystore = JSON.parse(keystoreJson);
  
  // Decrypt keystore — throws on wrong password
  const wallet = await decryptKeystore(keystore, cfg.keystorePassword);
  const privateKey = `0x${Buffer.from(wallet.getPrivateKey()).toString("hex")}` as Hex;

  const account = privateKeyToAccount(privateKey);
  const chain = getChain(cfg.chainId);

  const client = createWalletClient({
    account,
    chain,
    transport: http(cfg.rpcUrl),
  });

  return {
    address: account.address,
    signTransaction: async (txRequest) => {
      return client.signTransaction(txRequest as any);
    },
    sendTransaction: async (txRequest) => {
      return client.sendTransaction(txRequest as any);
    },
    client,
  };
}

/**
 * Mock wallet for testing — signs with a dev key, never submits.
 */
export function createMockWallet(address: `0x${string}`): WalletAbstraction {
  const mockPrivKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
  const account = privateKeyToAccount(mockPrivKey);
  const chain = getChain(1);
  const client = createWalletClient({ account, chain, transport: http() });

  return {
    address,
    signTransaction: async (tx) =>
      `0x${"00".repeat(32)}` as Hex, // mock signature
    sendTransaction: async () => `0x${"ab".repeat(32)}` as Hex,
    client,
  };
}
