#!/usr/bin/env node
/**
 * Create a Web3 Secret Storage (v3) keystore for ArbitEx.
 * Usage:
 *   pnpm run keystore:create [execution|superadmin]
 *   # Or: node scripts/create-keystore.mjs execution
 *
 * Prompts for private key (0x-prefixed hex) and password.
 * Output: infra/secrets/<name>-keystore.json
 */

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const secretsDir = join(root, "infra", "secrets");

async function prompt(question, hide = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function isValidPrivateKey(s) {
  return /^0x[0-9a-fA-F]{64}$/.test(s) || /^[0-9a-fA-F]{64}$/.test(s);
}

async function main() {
  const name = process.argv[2] || "execution";
  if (!["execution", "superadmin"].includes(name)) {
    console.error("Usage: pnpm run keystore:create [execution|superadmin]");
    process.exit(1);
  }

  const { Wallet } = await import("@ethereumjs/wallet");
  console.log(`\nCreating ${name} keystore for ArbitEx.\n`);

  const pkRaw = await prompt("Private key (0x-prefixed hex, 64 chars): ");
  const privateKey = pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`;
  if (!isValidPrivateKey(privateKey)) {
    console.error("Invalid private key format.");
    process.exit(1);
  }

  const password = await prompt("Keystore password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pkBuffer = Buffer.from(privateKey.slice(2), "hex");
  const wallet = Wallet.fromPrivateKey(pkBuffer);
  const keystore = wallet.toV3(password, { kdf: "scrypt" });

  mkdirSync(secretsDir, { recursive: true });
  const outPath = join(secretsDir, `${name}-keystore.json`);
  writeFileSync(outPath, JSON.stringify(keystore, null, 2), "utf-8");

  console.log(`\nKeystore saved to: ${outPath}`);
  console.log(`Address: ${wallet.getAddressString()}`);
  console.log("\nSet in .env.secrets:");
  console.log(`  ${name === "execution" ? "EXECUTION" : "SUPERADMIN"}_KEYSTORE_FILE=${outPath.replace(root, ".").replace(/\\/g, "/")}`);
  console.log(`  ${name === "execution" ? "EXECUTION_WALLET" : "SUPERADMIN"}_KEYSTORE_PASS=<your password>`);
  console.log("\nNever commit this file. Add infra/secrets/ to .gitignore.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
