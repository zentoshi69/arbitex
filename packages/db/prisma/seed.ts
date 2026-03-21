/**
 * Prisma seed — thin wrapper that delegates to the main seed script.
 *
 * Run: npx prisma db seed
 *
 * All pool/venue data lives in src/seed.ts (the authoritative source).
 * This file only exists because Prisma expects prisma/seed.ts.
 */

import "../src/seed.js";
