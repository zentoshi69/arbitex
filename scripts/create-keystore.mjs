#!/usr/bin/env node
/**
 * Converts a raw private key into an encrypted Web3 v3 JSON keystore file
 * compatible with @ethereumjs/wallet (used by the ArbitEx worker).
 *
 * Run from the monorepo root (where node_modules exist):
 *   node scripts/create-keystore.mjs
 *
 * Or on the VPS after `docker exec` into the worker container.
 */

import { createInterface } from "node:readline";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  // Dynamic import — works whether deps are hoisted or in node_modules
  let Wallet;
  try {
    const mod = await import("@ethereumjs/wallet");
    Wallet = mod.Wallet ?? mod.default?.Wallet ?? mod.default;
  } catch {
    console.error("ERROR: @ethereumjs/wallet not found. Run from the monorepo root or install it:");
    console.error("  npm install @ethereumjs/wallet");
    process.exit(1);
  }

  console.log("\n=== ArbitEx Execution Wallet Keystore Generator ===\n");

  let privKey = await ask("Private key (hex, with or without 0x): ");
  privKey = privKey.trim().replace(/^0x/, "");

  if (!/^[a-fA-F0-9]{64}$/.test(privKey)) {
    console.error("ERROR: Invalid private key. Must be 64 hex characters.");
    process.exit(1);
  }

  const password = await ask("Keystore encryption password: ");
  if (password.length < 8) {
    console.error("ERROR: Password must be at least 8 characters.");
    process.exit(1);
  }

  const confirm = await ask("Confirm password: ");
  if (password !== confirm) {
    console.error("ERROR: Passwords do not match.");
    process.exit(1);
  }

  rl.close();

  console.log("\nEncrypting (this takes ~10 seconds)...");

  const privKeyBuf = Buffer.from(privKey, "hex");
  const wallet = Wallet.fromPrivateKey(privKeyBuf);
  const address = `0x${Buffer.from(wallet.getAddress()).toString("hex")}`;

  console.log(`Wallet address: ${address}`);

  const keystoreV3 = await wallet.toV3(password);

  const outDir = "/opt/arbitex/secrets";
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
    console.log(`Created directory: ${outDir}`);
  }

  const outPath = `${outDir}/execution-keystore.json`;
  writeFileSync(outPath, JSON.stringify(keystoreV3, null, 2), { mode: 0o600 });

  console.log(`\nKeystore saved to: ${outPath}`);
  console.log(`File permissions: 600 (owner read/write only)\n`);

  console.log("=== SAVE THIS INFO ===");
  console.log(`Address:  ${address}`);
  console.log(`Keystore: ${outPath}`);
  console.log(`Password: (the one you just entered)\n`);

  console.log("=== Next steps ===");
  console.log("1. Fund this address with AVAX (for gas) + trading tokens");
  console.log("2. In your .env.prod on the VPS, set:");
  console.log(`     EXECUTION_KEYSTORE_FILE=${outPath}`);
  console.log(`     EXECUTION_WALLET_KEYSTORE_PASS=<your password>`);
  console.log(`     MOCK_EXECUTION=false`);
  console.log("3. Redeploy the worker:");
  console.log("     docker compose -f docker-compose.prod.yml up -d --build worker\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
