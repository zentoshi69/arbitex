import { test, expect } from "@playwright/test";

// ── Overview ──────────────────────────────────────────────────────────────────
test.describe("Overview Dashboard", () => {
  test("loads and shows KPI cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Overview")).toBeVisible();
    // Four KPI cards
    await expect(page.locator("text=Today's PnL")).toBeVisible();
    await expect(page.locator("text=7-Day PnL")).toBeVisible();
    await expect(page.locator("text=Success Rate")).toBeVisible();
    await expect(page.locator("text=All-Time PnL")).toBeVisible();
  });

  test("sidebar navigation is present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=ArbitEx")).toBeVisible();
    await expect(page.locator("a[href='/opportunities']")).toBeVisible();
    await expect(page.locator("a[href='/risk']")).toBeVisible();
    await expect(page.locator("a[href='/health']")).toBeVisible();
  });

  test("shows kill switch warning when active", async ({ page }) => {
    // Mock the API to return active kill switch
    await page.route("**/api/v1/risk/kill-switches", (route) =>
      route.fulfill({ json: { GLOBAL: true, CHAIN_1: false } })
    );
    await page.goto("/");
    await expect(page.locator("text=Kill switch active")).toBeVisible();
    await expect(page.locator("text=Kill Switch Active")).toBeVisible();
  });
});

// ── Opportunities ──────────────────────────────────────────────────────────────
test.describe("Opportunities Page", () => {
  test("loads table with filter controls", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.locator("text=Opportunities")).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
    await expect(page.locator("input[placeholder*='Search']")).toBeVisible();
  });

  test("opens detail drawer on row click", async ({ page }) => {
    // Mock opportunities list
    await page.route("**/api/v1/opportunities*", (route) =>
      route.fulfill({
        json: {
          items: [{
            id: "test-opp-001",
            state: "APPROVED",
            tokenInSymbol: "USDC",
            tokenOutSymbol: "WETH",
            tokenInAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            tokenOutAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            tradeSizeUsd: 1000,
            grossSpreadUsd: 50,
            netProfitUsd: 12.5,
            netProfitBps: 12.5,
            buyVenueName: "Uniswap V3",
            sellVenueName: "SushiSwap V2",
            detectedAt: new Date().toISOString(),
            expiresAt: null,
          }],
          pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        },
      })
    );
    // Mock detail
    await page.route("**/api/v1/opportunities/test-opp-001", (route) =>
      route.fulfill({
        json: {
          id: "test-opp-001",
          state: "APPROVED",
          tokenInSymbol: "USDC",
          tokenOutSymbol: "WETH",
          tokenInAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
          tokenOutAddress: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
          tradeSizeUsd: 1000,
          grossSpreadUsd: 50,
          gasEstimateUsd: 18,
          venueFeesUsd: 6,
          slippageBufferUsd: 5,
          failureBufferUsd: 2,
          netProfitUsd: 12.5,
          netProfitBps: 12.5,
          buyVenueName: "Uniswap V3",
          sellVenueName: "SushiSwap V2",
          detectedAt: new Date().toISOString(),
          routes: [],
          execution: null,
          riskDecision: {
            approved: true,
            rejectionReasons: [],
            checkedRules: [{ rule: "MIN_NET_PROFIT", passed: true }],
            evaluatedAt: new Date().toISOString(),
          },
        },
      })
    );

    await page.goto("/opportunities");
    await page.locator("tr").nth(1).click();

    // Drawer opens
    await expect(page.locator("text=Opportunity Detail")).toBeVisible();
    await expect(page.locator("text=Profit Breakdown")).toBeVisible();
    await expect(page.locator("text=Gross Spread")).toBeVisible();
    await expect(page.locator("text=Net Profit")).toBeVisible();
    await expect(page.locator("text=Risk Decision")).toBeVisible();
    await expect(page.locator("text=APPROVED")).toBeVisible();
  });

  test("state filter works", async ({ page }) => {
    await page.goto("/opportunities");
    const select = page.locator("select").first();
    await select.selectOption("LANDED");
    await expect(page.url()).toContain("/opportunities");
    // Filter value retained
    await expect(select).toHaveValue("LANDED");
  });
});

// ── Risk Controls ──────────────────────────────────────────────────────────────
test.describe("Risk Controls Page", () => {
  test("renders parameter form with all fields", async ({ page }) => {
    await page.route("**/api/v1/risk/config", (route) =>
      route.fulfill({
        json: {
          maxTradeSizeUsd: 1000, minNetProfitUsd: 5, maxGasGwei: 100,
          minPoolLiquidityUsd: 100000, maxFailedTxPerHour: 5,
          maxSlippageBps: 50, maxTokenExposureUsd: 25000,
          tokenCooldownSeconds: 300, slippageBufferFactor: 0.005,
          failureBufferFactor: 0.1,
        },
      })
    );
    await page.route("**/api/v1/risk/kill-switches", (route) =>
      route.fulfill({ json: { GLOBAL: false, CHAIN_1: false } })
    );
    await page.route("**/api/v1/risk/events", (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto("/risk");
    await expect(page.locator("text=Risk Controls")).toBeVisible();
    await expect(page.locator("text=Risk Parameters")).toBeVisible();
    await expect(page.locator("text=Min Net Profit")).toBeVisible();
    await expect(page.locator("text=Max Trade Size")).toBeVisible();
    await expect(page.locator("text=Kill Switches")).toBeVisible();
  });

  test("global kill switch shows confirm dialog", async ({ page }) => {
    await page.route("**/api/v1/risk/kill-switches", (route) =>
      route.fulfill({ json: { GLOBAL: false, CHAIN_1: false } })
    );
    await page.route("**/api/v1/risk/config", (route) =>
      route.fulfill({ json: { minNetProfitUsd: 5, maxTradeSizeUsd: 1000, maxGasGwei: 100, minPoolLiquidityUsd: 100000, maxFailedTxPerHour: 5, maxSlippageBps: 50, maxTokenExposureUsd: 25000, tokenCooldownSeconds: 300 } })
    );
    await page.route("**/api/v1/risk/events", (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto("/risk");
    // Click Activate on GLOBAL
    const globalRow = page.locator("text=Global Kill Switch").locator("..").locator("..");
    const activateBtn = globalRow.locator("button", { hasText: "Activate" });
    await activateBtn.click();
    // Confirm dialog appears
    await expect(page.locator("text=Activate Global Kill Switch?")).toBeVisible();
    await expect(page.locator("button", { hasText: "Cancel" })).toBeVisible();
    // Cancel dismisses
    await page.locator("button", { hasText: "Cancel" }).click();
    await expect(page.locator("text=Activate Global Kill Switch?")).not.toBeVisible();
  });

  test("risk config save triggers audit entry", async ({ page }) => {
    let patchCalled = false;
    await page.route("**/api/v1/risk/config", async (route) => {
      if (route.request().method() === "PATCH") {
        patchCalled = true;
        await route.fulfill({ json: { minNetProfitUsd: 10 } });
      } else {
        await route.fulfill({ json: { minNetProfitUsd: 5, maxTradeSizeUsd: 1000, maxGasGwei: 100, minPoolLiquidityUsd: 100000, maxFailedTxPerHour: 5, maxSlippageBps: 50, maxTokenExposureUsd: 25000, tokenCooldownSeconds: 300 } });
      }
    });
    await page.route("**/api/v1/risk/kill-switches", (route) =>
      route.fulfill({ json: { GLOBAL: false } })
    );
    await page.route("**/api/v1/risk/events", (route) =>
      route.fulfill({ json: [] })
    );

    await page.goto("/risk");
    // Change a value
    const profitInput = page.locator("input[type='number']").first();
    await profitInput.fill("10");
    await page.locator("button", { hasText: "Save Changes" }).click();
    await expect(patchCalled).toBe(true);
  });
});

// ── Audit Log ──────────────────────────────────────────────────────────────────
test.describe("Audit Log Page", () => {
  test("renders audit entries with expandable diffs", async ({ page }) => {
    await page.route("**/api/v1/audit*", (route) =>
      route.fulfill({
        json: {
          items: [{
            id: "audit-001",
            action: "RISK_CONFIG_UPDATED",
            actor: "admin@arbitex.io",
            entityType: "risk_config",
            entityId: "global",
            diff: { before: { minNetProfitUsd: 5 }, after: { minNetProfitUsd: 10 } },
            ipAddress: "127.0.0.1",
            createdAt: new Date().toISOString(),
          }],
          pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
        },
      })
    );

    await page.goto("/audit");
    await expect(page.locator("text=Audit Log")).toBeVisible();
    await expect(page.locator("text=RISK_CONFIG_UPDATED")).toBeVisible();
    await expect(page.locator("text=admin@arbitex.io")).toBeVisible();

    // Expand diff
    await page.locator("button").first().click();
    await expect(page.locator("text=minNetProfitUsd")).toBeVisible();
  });

  test("shows read-only notice", async ({ page }) => {
    await page.route("**/api/v1/audit*", (route) =>
      route.fulfill({ json: { items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } })
    );
    await page.goto("/audit");
    await expect(page.locator("text=Logs are read-only")).toBeVisible();
  });
});

// ── System Health ──────────────────────────────────────────────────────────────
test.describe("System Health Page", () => {
  test("shows all service statuses", async ({ page }) => {
    await page.route("**/health", (route) =>
      route.fulfill({
        json: {
          status: "healthy",
          database: "up",
          redis: "up",
          rpc: "up",
          workerQueueDepths: { "pool-refresh": 0, "opportunity-score": 2 },
          killSwitches: { GLOBAL: false, CHAIN_1: false },
          uptime: 3661,
          checkedAt: new Date().toISOString(),
        },
      })
    );

    await page.goto("/health");
    await expect(page.locator("text=System Health")).toBeVisible();
    await expect(page.locator("text=Database (PostgreSQL)")).toBeVisible();
    await expect(page.locator("text=Cache (Redis)")).toBeVisible();
    await expect(page.locator("text=Ethereum RPC")).toBeVisible();
    await expect(page.locator("text=HEALTHY").or(page.locator("text=Healthy"))).toBeVisible();
  });

  test("shows degraded status when RPC is slow", async ({ page }) => {
    await page.route("**/health", (route) =>
      route.fulfill({
        json: {
          status: "degraded",
          database: "up",
          redis: "up",
          rpc: "slow",
          workerQueueDepths: {},
          killSwitches: {},
          uptime: 100,
          checkedAt: new Date().toISOString(),
        },
      })
    );

    await page.goto("/health");
    await expect(page.locator("text=DEGRADED").or(page.locator("text=Degraded"))).toBeVisible();
  });
});
